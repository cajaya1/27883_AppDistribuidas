const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Configurar multer para subida de archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generar nombre único con timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// Filtro de archivos
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'text/plain',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de archivo no permitido'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB máximo
    }
});

// Variables que serán inicializadas desde el servidor principal
let roomManager;

// Middleware para inicializar roomManager
router.use((req, res, next) => {
    if (!roomManager && req.app.locals.roomManager) {
        roomManager = req.app.locals.roomManager;
    }
    next();
});

// POST /api/rooms/create - Crear nueva sala
router.post('/create', async (req, res) => {
    try {
        const { name, type, pin } = req.body;

        if (!name || !type || !pin) {
            return res.status(400).json({
                success: false,
                message: 'Nombre, tipo y PIN de sala son requeridos'
            });
        }

        // Validar nombre de sala
        if (!roomManager.validateRoomName(name)) {
            return res.status(400).json({
                success: false,
                message: 'Nombre de sala inválido. Use solo letras, números, espacios, guiones y guiones bajos (3-50 caracteres)'
            });
        }

        const room = await roomManager.createRoom({
            name: name.trim(),
            type,
            pin: pin.trim()
        });

        res.status(201).json({
            success: true,
            message: 'Sala creada exitosamente',
            room: room
        });
    } catch (error) {
        console.error('Error creando sala:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/rooms/validate-pin/:pin - Validar PIN de sala
router.get('/validate-pin/:pin', async (req, res) => {
    try {
        const { pin } = req.params;

        if (!roomManager.validatePin(pin)) {
            return res.status(400).json({
                success: false,
                message: 'PIN debe tener entre 4 y 6 dígitos'
            });
        }

        const room = await roomManager.getRoomByPin(pin);

        if (room) {
            res.json({
                success: true,
                message: 'PIN válido',
                room: {
                    id: room.id,
                    name: room.name,
                    type: room.type
                }
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Sala no encontrada o PIN inválido'
            });
        }
    } catch (error) {
        console.error('Error validando PIN:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// GET /api/rooms/list - Listar todas las salas (solo admin)
router.get('/list', async (req, res) => {
    try {
        // En un entorno real, aquí se verificaría el token de admin
        const rooms = await roomManager.getAllRooms();
        
        res.json({
            success: true,
            data: rooms
        });
    } catch (error) {
        console.error('Error listando salas:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// GET /api/rooms/:id/stats - Obtener estadísticas de una sala
router.get('/:id/stats', async (req, res) => {
    try {
        const roomId = parseInt(req.params.id);
        
        if (isNaN(roomId)) {
            return res.status(400).json({
                success: false,
                message: 'ID de sala inválido'
            });
        }

        const stats = await roomManager.getRoomStats(roomId);
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas de sala:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/rooms/:id/messages - Obtener mensajes de una sala
router.get('/:id/messages', async (req, res) => {
    try {
        const roomId = parseInt(req.params.id);
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        if (isNaN(roomId)) {
            return res.status(400).json({
                success: false,
                message: 'ID de sala inválido'
            });
        }

        const messages = await roomManager.getRoomMessages(roomId, limit, offset);
        
        res.json({
            success: true,
            data: messages
        });
    } catch (error) {
        console.error('Error obteniendo mensajes:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/rooms/:id/search - Buscar mensajes en una sala
router.post('/:id/search', async (req, res) => {
    try {
        const roomId = parseInt(req.params.id);
        const { searchTerm } = req.body;
        const limit = parseInt(req.query.limit) || 20;
        
        if (isNaN(roomId)) {
            return res.status(400).json({
                success: false,
                message: 'ID de sala inválido'
            });
        }

        if (!searchTerm || searchTerm.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Término de búsqueda debe tener al menos 2 caracteres'
            });
        }

        const messages = await roomManager.searchMessages(roomId, searchTerm.trim(), limit);
        
        res.json({
            success: true,
            data: messages
        });
    } catch (error) {
        console.error('Error buscando mensajes:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/rooms/:id/upload - Subir archivo a sala multimedia
router.post('/:id/upload', upload.single('file'), async (req, res) => {
    try {
        const roomId = parseInt(req.params.id);
        const { nickname } = req.body;
        
        if (isNaN(roomId)) {
            return res.status(400).json({
                success: false,
                message: 'ID de sala inválido'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No se proporcionó archivo'
            });
        }

        if (!nickname) {
            return res.status(400).json({
                success: false,
                message: 'Nickname es requerido'
            });
        }

        // Verificar que la sala sea multimedia
        const room = await roomManager.getRoomById(roomId);
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Sala no encontrada'
            });
        }

        if (room.type !== 'multimedia') {
            return res.status(400).json({
                success: false,
                message: 'Esta sala no permite subida de archivos'
            });
        }

        // Guardar información del archivo en la base de datos
        const messageData = {
            roomId: roomId,
            nickname: nickname,
            message: `Archivo compartido: ${req.file.originalname}`,
            messageType: req.file.mimetype.startsWith('image/') ? 'image' : 'file',
            filePath: `/uploads/${req.file.filename}`,
            fileName: req.file.originalname
        };

        const savedMessage = await roomManager.saveMessage(messageData);

        // Emitir mensaje vía Socket.IO para que aparezca en tiempo real
        const io = req.app.locals.io;
        if (io) {
            io.to(roomId.toString()).emit('newMessage', {
                id: savedMessage.id,
                nickname: nickname,
                message: messageData.message,
                messageType: messageData.messageType,
                filePath: messageData.filePath,
                fileName: messageData.fileName,
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            message: 'Archivo subido exitosamente',
            data: {
                messageId: savedMessage.id,
                fileName: req.file.originalname,
                filePath: messageData.filePath,
                fileSize: req.file.size,
                mimeType: req.file.mimetype
            }
        });
    } catch (error) {
        console.error('Error subiendo archivo:', error);
        
        // Limpiar archivo si hubo error
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error eliminando archivo temporal:', err);
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE /api/rooms/:id - Desactivar sala
router.delete('/:id', async (req, res) => {
    try {
        const roomId = parseInt(req.params.id);
        
        if (isNaN(roomId)) {
            return res.status(400).json({
                success: false,
                message: 'ID de sala inválido'
            });
        }

        // En un entorno real, aquí se verificarían permisos de admin
        const success = await roomManager.deactivateRoom(roomId);
        
        if (success) {
            res.json({
                success: true,
                message: 'Sala desactivada exitosamente'
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Sala no encontrada'
            });
        }
    } catch (error) {
        console.error('Error desactivando sala:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE /api/rooms/:id/permanent - Eliminar sala permanentemente
router.delete('/:id/permanent', async (req, res) => {
    try {
        const roomId = parseInt(req.params.id);
        
        if (isNaN(roomId)) {
            return res.status(400).json({
                success: false,
                message: 'ID de sala inválido'
            });
        }

        // En un entorno real, aquí se verificarían permisos de admin
        const success = await roomManager.deleteRoom(roomId);
        
        if (success) {
            res.json({
                success: true,
                message: 'Sala eliminada permanentemente'
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Sala no encontrada'
            });
        }
    } catch (error) {
        console.error('Error eliminando sala:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;