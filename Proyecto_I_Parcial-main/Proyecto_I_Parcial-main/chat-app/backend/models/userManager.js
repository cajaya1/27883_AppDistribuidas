const bcrypt = require('bcryptjs');

class UserManager {
    constructor(database) {
        this.db = database;
    }

    // Validar nickname
    validateNickname(nickname) {
        if (!nickname || typeof nickname !== 'string') {
            return { valid: false, message: 'Nickname es requerido' };
        }
        
        if (nickname.length < 2) {
            return { valid: false, message: 'Nickname debe tener al menos 2 caracteres' };
        }
        
        if (nickname.length > 20) {
            return { valid: false, message: 'Nickname no puede tener más de 20 caracteres' };
        }
        
        // Permitir letras, números, guiones y guiones bajos
        if (!/^[a-zA-Z0-9\-_]+$/.test(nickname)) {
            return { 
                valid: false, 
                message: 'Nickname solo puede contener letras, números, guiones y guiones bajos' 
            };
        }

        // Lista de palabras prohibidas
        const prohibitedWords = [
            'admin', 'administrator', 'moderator', 'mod', 'system', 'server',
            'bot', 'null', 'undefined', 'anonymous', 'guest'
        ];

        if (prohibitedWords.includes(nickname.toLowerCase())) {
            return { valid: false, message: 'Este nickname está reservado' };
        }

        return { valid: true };
    }

    // Crear administrador
    async createAdmin(adminData) {
        const { username, password } = adminData;
        
        // Validaciones
        if (!username || username.length < 3 || username.length > 30) {
            throw new Error('El nombre de usuario debe tener entre 3 y 30 caracteres');
        }

        if (!password || password.length < 6) {
            throw new Error('La contraseña debe tener al menos 6 caracteres');
        }

        // Verificar si ya existe
        const existing = await this.db.get(
            'SELECT id FROM admins WHERE username = ?',
            [username]
        );

        if (existing) {
            throw new Error('Ya existe un administrador con ese nombre de usuario');
        }

        // Hash de la contraseña
        const passwordHash = await bcrypt.hash(password, 12);

        try {
            const result = await this.db.run(
                'INSERT INTO admins (username, password_hash) VALUES (?, ?)',
                [username, passwordHash]
            );

            return {
                id: result.id,
                username,
                created_at: new Date().toISOString()
            };
        } catch (error) {
            throw new Error('Error al crear administrador: ' + error.message);
        }
    }

    // Autenticar administrador
    async authenticateAdmin(username, password) {
        try {
            const admin = await this.db.get(
                'SELECT id, username, password_hash FROM admins WHERE username = ? AND is_active = 1',
                [username]
            );

            if (!admin) {
                return { success: false, message: 'Credenciales inválidas' };
            }

            const isValidPassword = await bcrypt.compare(password, admin.password_hash);
            
            if (!isValidPassword) {
                return { success: false, message: 'Credenciales inválidas' };
            }

            return {
                success: true,
                admin: {
                    id: admin.id,
                    username: admin.username
                }
            };
        } catch (error) {
            throw new Error('Error en autenticación: ' + error.message);
        }
    }

    // Obtener información de usuario por socket ID (para usuarios conectados)
    getUserBySocketId(socketId, connectedUsers) {
        return connectedUsers.get(socketId);
    }

    // Verificar si un nickname está en uso en una sala específica
    isNicknameInUse(nickname, roomId, connectedUsers) {
        const users = Array.from(connectedUsers.values());
        return users.some(user => 
            user.roomId === roomId && 
            user.nickname.toLowerCase() === nickname.toLowerCase()
        );
    }

    // Obtener lista de usuarios conectados en una sala
    getUsersInRoom(roomId, connectedUsers) {
        const users = Array.from(connectedUsers.values());
        return users
            .filter(user => user.roomId === roomId)
            .map(user => ({
                nickname: user.nickname,
                joinedAt: user.joinedAt,
                socketId: user.socketId
            }));
    }

    // Verificar sesión única por IP
    checkUniqueSession(clientIP, nickname, userSessions) {
        const existingSession = userSessions.get(clientIP);
        
        if (existingSession && existingSession.nickname !== nickname) {
            return {
                allowed: false,
                message: 'Ya tienes una sesión activa desde este dispositivo con otro nickname'
            };
        }

        return { allowed: true };
    }

    // Limpiar sesión de usuario
    cleanupUserSession(socketId, connectedUsers, userSessions) {
        const userInfo = connectedUsers.get(socketId);
        
        if (userInfo) {
            connectedUsers.delete(socketId);
            userSessions.delete(userInfo.ip);
            return userInfo;
        }
        
        return null;
    }

    // Obtener estadísticas de usuarios
    async getUserStats() {
        try {
            // Contar mensajes por usuario en los últimos 30 días
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const userMessageStats = await this.db.all(
                `SELECT 
                    nickname,
                    COUNT(*) as message_count,
                    COUNT(DISTINCT room_id) as rooms_participated,
                    MIN(timestamp) as first_message,
                    MAX(timestamp) as last_message
                 FROM messages 
                 WHERE timestamp >= ?
                 GROUP BY nickname 
                 ORDER BY message_count DESC 
                 LIMIT 20`,
                [thirtyDaysAgo.toISOString()]
            );

            return userMessageStats;
        } catch (error) {
            throw new Error('Error al obtener estadísticas de usuarios: ' + error.message);
        }
    }

    // Banear/desbanear un nickname (opcional para moderación)
    async banNickname(nickname, reason = '') {
        // Esta funcionalidad podría expandirse con una tabla de usuarios baneados
        // Por simplicidad, mantenemos la lista en memoria o archivo
        console.log(`Nickname ${nickname} ha sido baneado. Razón: ${reason}`);
    }

    // Validar formato de mensaje
    validateMessage(message) {
        if (!message || typeof message !== 'string') {
            return { valid: false, message: 'Mensaje inválido' };
        }

        if (message.trim().length === 0) {
            return { valid: false, message: 'El mensaje no puede estar vacío' };
        }

        if (message.length > 500) {
            return { valid: false, message: 'El mensaje es demasiado largo (máximo 500 caracteres)' };
        }

        // Filtros básicos de contenido
        const prohibitedPatterns = [
            /(.)\1{10,}/g, // Repetición excesiva de caracteres
            /(https?:\/\/[^\s]+){5,}/g // Muchos enlaces
        ];

        for (const pattern of prohibitedPatterns) {
            if (pattern.test(message)) {
                return { valid: false, message: 'Mensaje contiene contenido no permitido' };
            }
        }

        return { valid: true };
    }

    // Generar ID de sesión único
    generateSessionId() {
        return require('crypto').randomBytes(32).toString('hex');
    }

    // Limpiar mensajes de un usuario específico (moderación)
    async clearUserMessages(nickname, roomId) {
        try {
            const result = await this.db.run(
                'DELETE FROM messages WHERE nickname = ? AND room_id = ?',
                [nickname, roomId]
            );
            
            return result.changes;
        } catch (error) {
            throw new Error('Error al limpiar mensajes del usuario: ' + error.message);
        }
    }
}

module.exports = UserManager;