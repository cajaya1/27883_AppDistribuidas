// Middleware de autenticación y validación
const rateLimit = require('express-rate-limit');

// Rate limiter específico para autenticación (relajado para demo educativo)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 50, // máximo 50 intentos por IP (para múltiples estudiantes)
    message: {
        success: false,
        message: 'Demasiados intentos de autenticación. Inténtalo más tarde.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting en desarrollo
    skip: (req, res) => process.env.NODE_ENV === 'development'
});

// Rate limiter para creación de salas (relajado para demo educativo)
const roomCreationLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 20, // máximo 20 salas por minuto (para múltiples estudiantes)
    message: {
        success: false,
        message: 'Demasiadas salas creadas. Espera un momento antes de crear otra.'
    },
    // Skip rate limiting en desarrollo
    skip: (req, res) => process.env.NODE_ENV === 'development'
});

// Rate limiter para mensajes (más permisivo para demo educativo)
const messageLimiter = rateLimit({
    windowMs: 1000, // 1 segundo
    max: 30, // máximo 30 mensajes por segundo (para múltiples estudiantes)
    message: {
        success: false,
        message: 'Enviando mensajes demasiado rápido. Espera un momento.'
    },
    // Skip rate limiting en desarrollo
    skip: (req, res) => process.env.NODE_ENV === 'development'
});

// Rate limiter para subida de archivos (más permisivo para demo educativo)
const uploadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 50, // máximo 50 archivos por minuto (para múltiples estudiantes)
    message: {
        success: false,
        message: 'Demasiados archivos subidos. Espera un momento.'
    },
    // Skip rate limiting en desarrollo
    skip: (req, res) => process.env.NODE_ENV === 'development'
});

// Middleware para validar JSON
const validateJSON = (err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            success: false,
            message: 'JSON inválido en el cuerpo de la petición'
        });
    }
    next();
};

// Middleware para logs de seguridad
const securityLogger = (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    // Log de peticiones sospechosas
    if (req.path.includes('admin') || req.path.includes('auth')) {
        console.log(`[SECURITY] ${new Date().toISOString()} - IP: ${ip} - ${req.method} ${req.path} - UserAgent: ${userAgent}`);
    }
    
    next();
};

// Middleware para sanitizar entrada
const sanitizeInput = (req, res, next) => {
    if (req.body) {
        // Remover caracteres peligrosos de strings
        for (const key in req.body) {
            if (typeof req.body[key] === 'string') {
                req.body[key] = req.body[key]
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remover scripts
                    .replace(/javascript:/gi, '') // Remover javascript:
                    .replace(/on\w+\s*=/gi, '') // Remover event handlers
                    .trim();
            }
        }
    }
    next();
};

// Middleware para validar parámetros de sala
const validateRoomParams = (req, res, next) => {
    if (req.params.id) {
        const roomId = parseInt(req.params.id);
        if (isNaN(roomId) || roomId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'ID de sala inválido'
            });
        }
        req.roomId = roomId;
    }
    
    if (req.params.pin) {
        const pin = req.params.pin;
        if (!/^\d{4,6}$/.test(pin)) {
            return res.status(400).json({
                success: false,
                message: 'PIN debe tener entre 4 y 6 dígitos'
            });
        }
    }
    
    next();
};

// Middleware para validar datos de usuario
const validateUserData = (req, res, next) => {
    if (req.body.nickname) {
        const nickname = req.body.nickname.trim();
        
        if (nickname.length < 2 || nickname.length > 20) {
            return res.status(400).json({
                success: false,
                message: 'Nickname debe tener entre 2 y 20 caracteres'
            });
        }
        
        if (!/^[a-zA-Z0-9\-_]+$/.test(nickname)) {
            return res.status(400).json({
                success: false,
                message: 'Nickname solo puede contener letras, números, guiones y guiones bajos'
            });
        }
        
        req.body.nickname = nickname;
    }
    
    next();
};

// Middleware para validar datos de sala
const validateRoomData = (req, res, next) => {
    if (req.body.name) {
        const name = req.body.name.trim();
        
        if (name.length < 3 || name.length > 50) {
            return res.status(400).json({
                success: false,
                message: 'Nombre de sala debe tener entre 3 y 50 caracteres'
            });
        }
        
        if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
            return res.status(400).json({
                success: false,
                message: 'Nombre de sala contiene caracteres no permitidos'
            });
        }
        
        req.body.name = name;
    }
    
    if (req.body.type && !['text', 'multimedia'].includes(req.body.type)) {
        return res.status(400).json({
            success: false,
            message: 'Tipo de sala debe ser "text" o "multimedia"'
        });
    }
    
    next();
};

// Middleware de detección de entorno para rate limiting
const isEducationalDemo = () => {
    return process.env.NODE_ENV === 'development' || 
           process.env.RENDER || 
           process.env.EDUCATIONAL_MODE === 'true';
};

// Rate limiter dinámico basado en el entorno
const createDynamicLimiter = (baseConfig) => {
    return rateLimit({
        ...baseConfig,
        max: isEducationalDemo() ? baseConfig.max * 10 : baseConfig.max,
        skip: (req, res) => process.env.NODE_ENV === 'development'
    });
};

// Middleware para CORS personalizado
const corsMiddleware = (req, res, next) => {
    const origin = req.headers.origin;
    
    // Lista de orígenes permitidos (incluye dominios de Render)
    const allowedOrigins = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        /^https:\/\/.*\.onrender\.com$/,
        // Agregar más orígenes según sea necesario
    ];
    
    // Verificar si el origen está permitido (incluyendo patrones regex)
    const isOriginAllowed = !origin || allowedOrigins.some(allowed => {
        if (typeof allowed === 'string') {
            return allowed === origin;
        } else if (allowed instanceof RegExp) {
            return allowed.test(origin);
        }
        return false;
    });
    
    if (isOriginAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    next();
};

// Middleware de manejo de errores
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    
    // Error de archivo demasiado grande
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            success: false,
            message: 'Archivo demasiado grande. Máximo 10MB.'
        });
    }
    
    // Error de tipo de archivo no permitido
    if (err.message === 'Tipo de archivo no permitido') {
        return res.status(400).json({
            success: false,
            message: 'Tipo de archivo no permitido'
        });
    }
    
    // Error de base de datos
    if (err.code === 'SQLITE_CONSTRAINT') {
        return res.status(409).json({
            success: false,
            message: 'Conflicto en la base de datos. Es posible que el recurso ya exista.'
        });
    }
    
    // Error genérico del servidor
    res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
    });
};

// Middleware para logging de requests
const requestLogger = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        
        console.log(`[${new Date().toISOString()}] ${ip} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    
    next();
};

module.exports = {
    authLimiter,
    roomCreationLimiter,
    messageLimiter,
    uploadLimiter,
    validateJSON,
    securityLogger,
    sanitizeInput,
    validateRoomParams,
    validateUserData,
    validateRoomData,
    corsMiddleware,
    errorHandler,
    requestLogger,
    isEducationalDemo,
    createDynamicLimiter
};