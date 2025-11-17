const express = require('express');
const router = express.Router();

// Esta será importada desde el servidor principal
let userManager;

// Middleware para inicializar userManager (se configurará en server.js)
router.use((req, res, next) => {
    if (!userManager && req.app.locals.userManager) {
        userManager = req.app.locals.userManager;
    }
    next();
});

// POST /api/auth/admin/login - Login de administrador
router.post('/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username y password son requeridos'
            });
        }

        const result = await userManager.authenticateAdmin(username, password);

        if (result.success) {
            // En un entorno de producción, aquí se generaría un JWT token
            res.json({
                success: true,
                message: 'Login exitoso',
                admin: result.admin
            });
        } else {
            res.status(401).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        console.error('Error en login de admin:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// POST /api/auth/admin/register - Registro de administrador
router.post('/admin/register', async (req, res) => {
    try {
        const { username, password, confirmPassword } = req.body;

        // Validaciones básicas
        if (!username || !password || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos son requeridos'
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Las contraseñas no coinciden'
            });
        }

        const admin = await userManager.createAdmin({ username, password });

        res.status(201).json({
            success: true,
            message: 'Administrador creado exitosamente',
            admin: {
                id: admin.id,
                username: admin.username,
                created_at: admin.created_at
            }
        });
    } catch (error) {
        console.error('Error en registro de admin:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/auth/validate-nickname - Validar nickname
router.post('/validate-nickname', async (req, res) => {
    try {
        const { nickname } = req.body;

        if (!nickname) {
            return res.status(400).json({
                success: false,
                message: 'Nickname es requerido'
            });
        }

        const validation = userManager.validateNickname(nickname);

        if (validation.valid) {
            res.json({
                success: true,
                message: 'Nickname válido'
            });
        } else {
            res.status(400).json({
                success: false,
                message: validation.message
            });
        }
    } catch (error) {
        console.error('Error validando nickname:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// POST /api/auth/validate-message - Validar mensaje
router.post('/validate-message', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Mensaje es requerido'
            });
        }

        const validation = userManager.validateMessage(message);

        if (validation.valid) {
            res.json({
                success: true,
                message: 'Mensaje válido'
            });
        } else {
            res.status(400).json({
                success: false,
                message: validation.message
            });
        }
    } catch (error) {
        console.error('Error validando mensaje:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// GET /api/auth/user-stats - Obtener estadísticas de usuarios (solo admin)
router.get('/user-stats', async (req, res) => {
    try {
        // En un entorno real, aquí se verificaría el token de admin
        const stats = await userManager.getUserStats();
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// POST /api/auth/clear-user-messages - Limpiar mensajes de usuario (moderación)
router.post('/clear-user-messages', async (req, res) => {
    try {
        const { nickname, roomId } = req.body;

        if (!nickname || !roomId) {
            return res.status(400).json({
                success: false,
                message: 'Nickname y roomId son requeridos'
            });
        }

        // En un entorno real, aquí se verificaría permisos de admin
        const deletedCount = await userManager.clearUserMessages(nickname, roomId);

        res.json({
            success: true,
            message: `Se eliminaron ${deletedCount} mensajes del usuario ${nickname}`,
            deletedCount
        });
    } catch (error) {
        console.error('Error limpiando mensajes:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;