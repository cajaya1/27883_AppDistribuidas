const cluster = require('cluster');
const os = require('os');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { createAdapter } = require('@socket.io/redis-adapter');
const redis = require('redis');

// Importar modelos y rutas
const Database = require('./models/database');
const PostgresDatabase = require('./models/postgresDatabase');
const RedisManager = require('./models/redisManager');
const RoomManager = require('./models/roomManager');
const UserManager = require('./models/userManager');

const numCPUs = os.cpus().length;
const isDevelopment = process.env.NODE_ENV !== 'production';
const usePostgres = process.env.USE_POSTGRES === 'true';
const useRedis = process.env.USE_REDIS === 'true';

// En producción, usar clustering para aprovechar múltiples cores
if (!isDevelopment && cluster.isMaster) {
    console.log(`Master ${process.pid} iniciado`);
    console.log(`Iniciando ${numCPUs} workers...`);

    // Crear workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // Manejar workers que fallan
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} murió. Reiniciando...`);
        cluster.fork();
    });

    // Cleanup periódico desde el master
    if (useRedis) {
        const redisManager = new RedisManager();
        redisManager.init().then(() => {
            setInterval(async () => {
                try {
                    await redisManager.cleanupExpiredData();
                } catch (error) {
                    console.error('Error en cleanup periódico:', error);
                }
            }, 300000); // Cada 5 minutos
        });
    }

} else {
    // Worker process
    startWorkerServer();
}

async function startWorkerServer() {
    const app = express();
    const server = http.createServer(app);
    
    let io;
    let database;
    let redisManager;
    let roomManager;
    let userManager;

    try {
        // Configurar base de datos
        if (usePostgres) {
            database = new PostgresDatabase();
        } else {
            database = new Database();
        }
        await database.init();

        // Configurar Redis si está habilitado
        if (useRedis) {
            redisManager = new RedisManager();
            await redisManager.init();

            // Configurar Socket.IO con Redis Adapter para múltiples instancias
            const pubClient = redis.createClient({
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379
            });
            const subClient = pubClient.duplicate();

            await pubClient.connect();
            await subClient.connect();

            io = socketIo(server, {
                cors: { origin: "*", methods: ["GET", "POST"] },
                adapter: createAdapter(pubClient, subClient)
            });
        } else {
            io = socketIo(server, {
                cors: { origin: "*", methods: ["GET", "POST"] }
            });
        }

        // Inicializar managers
        roomManager = new RoomManager(database, redisManager);
        userManager = new UserManager(database, redisManager);

        // Middleware optimizado
        app.use(cors());
        app.use(express.json({ limit: '1mb' }));
        app.use(express.urlencoded({ extended: true, limit: '1mb' }));

        // Rate limiting más sofisticado
        const createRateLimiter = (windowMs, max, message) => {
            if (useRedis) {
                // Rate limiting distribuido con Redis
                return async (req, res, next) => {
                    const key = `rate_limit:${req.ip}:${req.path}`;
                    const allowed = await redisManager.checkRateLimit(key, max, windowMs / 1000);
                    
                    if (!allowed) {
                        return res.status(429).json({ success: false, message });
                    }
                    next();
                };
            } else {
                // Rate limiting local
                return rateLimit({ windowMs, max, message: { success: false, message } });
            }
        };

        app.use(createRateLimiter(15 * 60 * 1000, 200, 'Demasiadas peticiones'));

        // Servir archivos estáticos con cache
        app.use(express.static(path.join(__dirname, '../frontend'), {
            maxAge: isDevelopment ? 0 : '1d',
            etag: true
        }));

        app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
            maxAge: '7d',
            etag: true
        }));

        // Hacer managers disponibles para las rutas
        app.locals.roomManager = roomManager;
        app.locals.userManager = userManager;
        app.locals.redisManager = redisManager;

        // Rutas API
        const authRoutes = require('./routes/auth');
        const roomRoutes = require('./routes/rooms');
        app.use('/api/auth', authRoutes);
        app.use('/api/rooms', roomRoutes);

        // Endpoint de health check
        app.get('/health', async (req, res) => {
            try {
                const stats = redisManager ? await redisManager.getGlobalStats() : null;
                res.json({
                    status: 'healthy',
                    worker: process.pid,
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    stats: stats
                });
            } catch (error) {
                res.status(500).json({
                    status: 'unhealthy',
                    error: error.message
                });
            }
        });

        // Ruta principal
        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../frontend/index.html'));
        });

        // Gestión optimizada de conexiones Socket.IO
        const connectedUsers = new Map();
        const userSessions = new Map();

        // Estadísticas en tiempo real
        let totalConnections = 0;
        let peakConnections = 0;

        io.on('connection', async (socket) => {
            totalConnections++;
            peakConnections = Math.max(peakConnections, totalConnections);

            const clientIP = socket.handshake.headers['x-forwarded-for'] || 
                            socket.handshake.address || 
                            socket.conn.remoteAddress;

            console.log(`[Worker ${process.pid}] Usuario conectado: ${socket.id} desde ${clientIP}`);

            // Evento: Unirse a una sala (optimizado)
            socket.on('joinRoom', async (data) => {
                try {
                    const { pin, nickname } = data;
                    
                    // Verificación de sesión única con Redis
                    if (redisManager) {
                        const existingSession = await redisManager.getUserSession(clientIP);
                        if (existingSession && existingSession.nickname !== nickname) {
                            socket.emit('error', {
                                message: 'Ya tienes una sesión activa desde este dispositivo'
                            });
                            return;
                        }
                    } else {
                        // Fallback a verificación en memoria
                        if (userSessions.has(clientIP)) {
                            const existingUser = userSessions.get(clientIP);
                            if (existingUser.nickname !== nickname) {
                                socket.emit('error', {
                                    message: 'Ya tienes una sesión activa desde este dispositivo'
                                });
                                return;
                            }
                        }
                    }

                    // Validar PIN y obtener información de la sala (con cache)
                    const room = await roomManager.getRoomByPin(pin);
                    if (!room) {
                        socket.emit('error', { message: 'PIN de sala inválido' });
                        return;
                    }

                    // Verificar límite de usuarios en la sala
                    if (redisManager) {
                        const currentUsers = await redisManager.getRoomUserCount(room.id);
                        if (currentUsers >= (room.max_users || 50)) {
                            socket.emit('error', { 
                                message: 'La sala ha alcanzado el límite máximo de usuarios' 
                            });
                            return;
                        }
                    }

                    // Validar nickname único en la sala
                    let usersInRoom = [];
                    if (redisManager) {
                        usersInRoom = await redisManager.getRoomActiveUsers(room.id);
                    } else {
                        usersInRoom = Array.from(connectedUsers.values())
                            .filter(user => user.roomId === room.id);
                    }
                    
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
                        joinedAt: new Date().toISOString(),
                        ip: clientIP
                    };
                    
                    // Guardar en mapas locales y Redis
                    connectedUsers.set(socket.id, userInfo);
                    userSessions.set(clientIP, userInfo);
                    
                    if (redisManager) {
                        await redisManager.setUserSession(clientIP, userInfo);
                        await redisManager.addUserToRoom(room.id, userInfo);
                        await redisManager.incrementRoomUsers(room.id);
                    }

                    // Confirmar conexión exitosa
                    socket.emit('joinedRoom', {
                        roomId: room.id,
                        roomName: room.name,
                        roomType: room.type,
                        nickname
                    });

                    // Notificar a otros usuarios
                    socket.to(room.id.toString()).emit('userJoined', {
                        nickname,
                        message: `${nickname} se ha unido a la sala`
                    });

                    // Actualizar lista de usuarios
                    const updatedUsers = redisManager ? 
                        await redisManager.getRoomActiveUsers(room.id) :
                        Array.from(connectedUsers.values()).filter(u => u.roomId === room.id);
                    
                    io.to(room.id.toString()).emit('updateUserList', {
                        users: updatedUsers.map(u => u.nickname)
                    });

                    // Cargar historial (con cache)
                    let messages = [];
                    if (redisManager) {
                        messages = await redisManager.getCachedRoomMessages(room.id);
                    }
                    
                    if (!messages) {
                        messages = await roomManager.getRoomMessages(room.id, 50);
                        if (redisManager) {
                            await redisManager.cacheRoomMessages(room.id, messages);
                        }
                    }
                    
                    socket.emit('messageHistory', messages);

                    console.log(`[Worker ${process.pid}] ${nickname} se unió a ${room.name}`);

                    // Actualizar estadísticas globales
                    if (redisManager) {
                        await redisManager.updateGlobalStats({
                            totalConnections,
                            peakConnections,
                            timestamp: new Date().toISOString(),
                            workerId: process.pid
                        });
                    }

                } catch (error) {
                    console.error('Error al unirse a la sala:', error);
                    socket.emit('error', { message: 'Error interno del servidor' });
                }
            });

            // Resto de eventos Socket.IO optimizados...
            socket.on('sendMessage', async (data) => {
                try {
                    const userInfo = connectedUsers.get(socket.id);
                    if (!userInfo) {
                        socket.emit('error', { message: 'No estás conectado a ninguna sala' });
                        return;
                    }

                    const { message } = data;
                    if (!message || message.trim().length === 0 || message.length > 500) {
                        return;
                    }

                    // Rate limiting por usuario
                    if (redisManager) {
                        const rateLimitKey = `msg_rate:${userInfo.ip}:${userInfo.roomId}`;
                        const allowed = await redisManager.checkRateLimit(rateLimitKey, 10, 60); // 10 msg/min
                        if (!allowed) {
                            socket.emit('error', { message: 'Enviando mensajes demasiado rápido' });
                            return;
                        }
                    }

                    // Guardar mensaje (procesamiento en lotes)
                    const messageData = {
                        roomId: userInfo.roomId,
                        nickname: userInfo.nickname,
                        message: message.trim(),
                        timestamp: new Date(),
                        userIP: userInfo.ip
                    };

                    await roomManager.saveMessage(messageData);

                    // Broadcast a la sala
                    const broadcastData = {
                        id: Date.now(),
                        nickname: userInfo.nickname,
                        message: message.trim(),
                        timestamp: new Date().toISOString(),
                        type: 'text'
                    };

                    io.to(userInfo.roomId.toString()).emit('newMessage', broadcastData);

                } catch (error) {
                    console.error('Error al enviar mensaje:', error);
                    socket.emit('error', { message: 'Error al enviar mensaje' });
                }
            });

            // Evento de desconexión optimizado
            socket.on('disconnect', async () => {
                totalConnections--;
                
                const userInfo = connectedUsers.get(socket.id);
                if (userInfo) {
                    // Limpiar de mapas locales
                    connectedUsers.delete(socket.id);
                    userSessions.delete(userInfo.ip);

                    // Limpiar de Redis
                    if (redisManager) {
                        await redisManager.deleteUserSession(userInfo.ip);
                        await redisManager.removeUserFromRoom(userInfo.roomId, socket.id);
                        await redisManager.decrementRoomUsers(userInfo.roomId);
                    }

                    // Notificar a otros usuarios
                    socket.to(userInfo.roomId.toString()).emit('userLeft', {
                        nickname: userInfo.nickname,
                        message: `${userInfo.nickname} ha salido de la sala`
                    });

                    // Actualizar lista de usuarios
                    const remainingUsers = redisManager ?
                        await redisManager.getRoomActiveUsers(userInfo.roomId) :
                        Array.from(connectedUsers.values()).filter(u => u.roomId === userInfo.roomId);
                    
                    io.to(userInfo.roomId.toString()).emit('updateUserList', {
                        users: remainingUsers.map(u => u.nickname)
                    });

                    console.log(`[Worker ${process.pid}] ${userInfo.nickname} desconectado`);
                }
            });
        });

        // Iniciar servidor
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`Worker ${process.pid} corriendo en puerto ${PORT}`);
            if (isDevelopment) {
                console.log(`Acceso web: http://localhost:${PORT}`);
            }
        });

    } catch (error) {
        console.error('Error inicializando worker:', error);
        process.exit(1);
    }

    // Cleanup al cerrar
    process.on('SIGTERM', async () => {
        console.log(`Worker ${process.pid} cerrando...`);
        if (redisManager) await redisManager.disconnect();
        if (database) await database.close();
        process.exit(0);
    });
}

module.exports = { startWorkerServer };