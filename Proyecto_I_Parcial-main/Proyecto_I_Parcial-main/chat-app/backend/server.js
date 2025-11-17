/**
 * Sistema de Chat en Tiempo Real
 * Servidor principal que maneja WebSockets, autenticación de administradores,
 * gestión de salas y comunicación en tiempo real entre usuarios.
 * 
 * Características:
 * - Salas de chat con PINs de acceso
 * - Tipos de sala: texto y multimedia
 * - Control de sesión única por dispositivo
 * - Subida y descarga de archivos
 * - Rate limiting y validaciones de seguridad
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

// Importar modelos y rutas
const Database = require('./models/database');
const RoomManager = require('./models/roomManager');
const UserManager = require('./models/userManager');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Configuración de middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de rate limiting para prevenir ataques de fuerza bruta
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Demasiadas peticiones desde esta IP, inténtalo más tarde.'
});
app.use(limiter);

// Configuración de archivos estáticos
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Inicialización de la capa de datos y managers de negocio
const database = new Database();
const roomManager = new RoomManager(database);
const userManager = new UserManager(database);

// Inyección de dependencias para las rutas
app.locals.roomManager = roomManager;
app.locals.userManager = userManager;
app.locals.io = io;

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Gestión de conexiones WebSocket y control de sesiones
const connectedUsers = new Map();
const userSessions = new Map();

/**
 * Manejo de conexiones WebSocket
 * Gestiona la conexión de usuarios, validación de sesiones y 
 * comunicación en tiempo real entre usuarios de las salas
 */
io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);
    
    const clientIP = socket.handshake.headers['x-forwarded-for'] || 
                     socket.handshake.address || 
                     socket.conn.remoteAddress;

    /**
     * Evento: Unirse a una sala de chat
     * Valida PIN, nickname, control de sesión única y gestiona la conexión
     */
    socket.on('joinRoom', async (data) => {
        try {
            const { pin, nickname } = data;
            
            if (userSessions.has(clientIP)) {
                const existingUser = userSessions.get(clientIP);
                if (existingUser.nickname !== nickname) {
                    socket.emit('error', {
                        message: 'Ya tienes una sesión activa desde este dispositivo'
                    });
                    return;
                }
            }

            const room = await roomManager.getRoomByPin(pin);
            if (!room) {
                socket.emit('error', { message: 'PIN de sala inválido' });
                return;
            }

            if (!nickname || nickname.length < 2 || nickname.length > 20) {
                socket.emit('error', { 
                    message: 'El nickname debe tener entre 2 y 20 caracteres' 
                });
                return;
            }

            // Verificar unicidad del nickname en la sala
            const usersInRoom = Array.from(connectedUsers.values())
                .filter(user => user.roomId === room.id);
            
            const userExists = usersInRoom.find(user => 
                user.nickname.toLowerCase() === nickname.toLowerCase()
            );
            
            if (userExists) {
                socket.emit('error', { 
                    message: 'Este nickname ya está en uso en esta sala' 
                });
                return;
            }

            // Unirse a la sala
            socket.join(room.id.toString());
            
            // Registrar usuario
            const userInfo = {
                socketId: socket.id,
                nickname,
                roomId: room.id,
                roomName: room.name,
                roomType: room.type,
                joinedAt: new Date(),
                ip: clientIP
            };
            
            connectedUsers.set(socket.id, userInfo);
            userSessions.set(clientIP, userInfo);

            // Confirmar conexión exitosa
            socket.emit('joinedRoom', {
                roomId: room.id,
                roomName: room.name,
                roomType: room.type,
                nickname
            });

            // Notificar a otros usuarios en la sala
            socket.to(room.id.toString()).emit('userJoined', {
                nickname,
                message: `${nickname} se ha unido a la sala`
            });

            // Enviar lista de usuarios conectados
            const currentUsers = usersInRoom.concat([userInfo]);
            io.to(room.id.toString()).emit('updateUserList', {
                users: currentUsers.map(u => u.nickname)
            });

            // Cargar historial de mensajes
            const messages = await roomManager.getRoomMessages(room.id, 50);
            socket.emit('messageHistory', messages);

            console.log(`${nickname} se unió a la sala ${room.name} (${room.id})`);

        } catch (error) {
            console.error('Error al unirse a la sala:', error);
            socket.emit('error', { message: 'Error interno del servidor' });
        }
    });

    /**
     * Evento: Enviar mensaje
     * Procesa y valida mensajes, los guarda en BD y los distribuye en tiempo real
     */
    socket.on('sendMessage', async (data) => {
        try {
            const userInfo = connectedUsers.get(socket.id);
            if (!userInfo) {
                socket.emit('error', { message: 'No estás conectado a ninguna sala' });
                return;
            }

            const { message } = data;
            if (!message || message.trim().length === 0) {
                return;
            }

            if (message.length > 500) {
                socket.emit('error', { 
                    message: 'El mensaje es demasiado largo (máximo 500 caracteres)' 
                });
                return;
            }

            // Persistir mensaje y distribuir a usuarios conectados
            const messageData = {
                roomId: userInfo.roomId,
                nickname: userInfo.nickname,
                message: message.trim(),
                timestamp: new Date()
            };

            await roomManager.saveMessage(messageData);

            // Enviar mensaje a todos los usuarios de la sala
            io.to(userInfo.roomId.toString()).emit('newMessage', {
                id: Date.now(),
                nickname: userInfo.nickname,
                message: message.trim(),
                timestamp: new Date().toISOString(),
                type: 'text'
            });

        } catch (error) {
            console.error('Error al enviar mensaje:', error);
            socket.emit('error', { message: 'Error al enviar mensaje' });
        }
    });

    // Evento: Usuario escribiendo
    socket.on('typing', (data) => {
        const userInfo = connectedUsers.get(socket.id);
        if (userInfo) {
            socket.to(userInfo.roomId.toString()).emit('userTyping', {
                nickname: userInfo.nickname,
                isTyping: data.isTyping
            });
        }
    });

    /**
     * Evento: Desconexión de usuario
     * Limpia sesiones y notifica a otros usuarios de la sala
     */
    socket.on('disconnect', () => {
        const userInfo = connectedUsers.get(socket.id);
        if (userInfo) {
            // Remover de mapas
            connectedUsers.delete(socket.id);
            userSessions.delete(userInfo.ip);

            // Notificar a otros usuarios
            socket.to(userInfo.roomId.toString()).emit('userLeft', {
                nickname: userInfo.nickname,
                message: `${userInfo.nickname} ha salido de la sala`
            });

            // Actualizar lista de usuarios
            const remainingUsers = Array.from(connectedUsers.values())
                .filter(user => user.roomId === userInfo.roomId)
                .map(user => user.nickname);
            
            io.to(userInfo.roomId.toString()).emit('updateUserList', {
                users: remainingUsers
            });

            console.log(`${userInfo.nickname} se desconectó de la sala ${userInfo.roomName}`);
        }
        
        console.log(`Usuario desconectado: ${socket.id}`);
    });
});

/**
 * Inicialización del servidor
 * Configura la base de datos SQLite y arranca el servidor HTTP/WebSocket
 */
async function startServer() {
    try {
        await database.init();
        console.log('Base de datos inicializada correctamente');

        const PORT = process.env.PORT || 3000;

// Health check endpoint para Render
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    });
});

        server.listen(PORT, '0.0.0.0', () => {
            console.log(`Servidor corriendo en puerto ${PORT}`);
            console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
            if (process.env.NODE_ENV !== 'production') {
                console.log(`Acceso web: http://localhost:${PORT}`);
            }
        });
    } catch (error) {
        console.error('Error al inicializar el servidor:', error);
        if (!process.env.VERCEL) {
            process.exit(1);
        }
    }
}

// Inicializar aplicación
startServer();

// Manejo de errores no capturados para estabilidad del sistema
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

module.exports = { app, io, roomManager, userManager };