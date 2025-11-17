const { v4: uuidv4 } = require('uuid');

class RoomManager {
    constructor(database, redisManager = null) {
        this.db = database;
        this.redis = redisManager;
        this.messageQueue = [];
        this.batchSize = 10;
        this.batchInterval = 1000; // 1 segundo
        
        // Iniciar procesamiento en lotes
        if (this.redis) {
            this.startBatchProcessing();
        }
    }

    // Crear nueva sala
    async createRoom(roomData) {
        const { name, type, pin } = roomData;
        
        // Validaciones
        if (!name || name.length < 3 || name.length > 50) {
            throw new Error('El nombre de la sala debe tener entre 3 y 50 caracteres');
        }

        if (!['text', 'multimedia'].includes(type)) {
            throw new Error('Tipo de sala inválido. Debe ser "text" o "multimedia"');
        }

        // Validar PIN proporcionado por el administrador
        if (!pin || pin.length < 4) {
            throw new Error('El PIN debe tener al menos 4 dígitos');
        }

        if (!/^\d+$/.test(pin)) {
            throw new Error('El PIN debe contener solo números');
        }

        // Verificar que el PIN no existe
        const existingRoom = await this.db.get('SELECT id FROM rooms WHERE pin = ?', [pin]);
        if (existingRoom) {
            throw new Error('Este PIN ya está en uso. Por favor, elige otro PIN.');
        }

        try {
            const result = await this.db.run(
                `INSERT INTO rooms (name, type, pin, admin_password) 
                 VALUES (?, ?, ?, ?)`,
                [name, type, pin, null]
            );

            return {
                id: result.id,
                name,
                type,
                pin,
                created_at: new Date().toISOString()
            };
        } catch (error) {
            if (error.message.includes('UNIQUE constraint failed')) {
                throw new Error('Ya existe una sala con ese PIN. Inténtalo de nuevo.');
            }
            throw error;
        }
    }

    // Obtener sala por PIN con cache
    async getRoomByPin(pin) {
        if (!pin || pin.length < 4) {
            return null;
        }

        // Intentar obtener del cache primero
        if (this.redis) {
            const cached = await this.redis.getCachedRoomInfo(`pin:${pin}`);
            if (cached) {
                return cached;
            }
        }

        const room = await this.db.get(
            'SELECT * FROM rooms WHERE pin = ? AND is_active = 1',
            [pin]
        );

        // Cachear el resultado si existe
        if (room && this.redis) {
            await this.redis.cacheRoomInfo(`pin:${pin}`, room, 1800); // 30 minutos
        }

        return room;
    }

    // Obtener sala por ID
    async getRoomById(id) {
        return await this.db.get(
            'SELECT * FROM rooms WHERE id = ? AND is_active = 1',
            [id]
        );
    }

    // Listar todas las salas activas (para administrador)
    async getAllRooms() {
        return await this.db.all(
            'SELECT id, name, type, pin, created_at FROM rooms WHERE is_active = 1 ORDER BY created_at DESC'
        );
    }

    // Desactivar sala
    async deactivateRoom(id) {
        const result = await this.db.run(
            'UPDATE rooms SET is_active = 0 WHERE id = ?',
            [id]
        );
        return result.changes > 0;
    }

    // Eliminar sala permanentemente
    async deleteRoom(id) {
        try {
            // Eliminar mensajes asociados
            await this.db.run('DELETE FROM messages WHERE room_id = ?', [id]);
            
            // Eliminar la sala
            const result = await this.db.run('DELETE FROM rooms WHERE id = ?', [id]);
            
            return result.changes > 0;
        } catch (error) {
            throw new Error('Error al eliminar la sala: ' + error.message);
        }
    }

    // Guardar mensaje con procesamiento en lotes
    async saveMessage(messageData) {
        const { roomId, nickname, message, messageType = 'text', filePath = null, fileName = null } = messageData;

        const messageObj = {
            id: Date.now() + Math.random(), // ID temporal
            roomId,
            nickname,
            message,
            messageType,
            filePath,
            fileName,
            timestamp: new Date().toISOString(),
            userIP: messageData.userIP || null
        };

        try {
            // Si Redis está disponible, usar procesamiento en lotes
            if (this.redis) {
                this.messageQueue.push(messageObj);
                
                // Si la cola está llena, procesar inmediatamente
                if (this.messageQueue.length >= this.batchSize) {
                    await this.processBatch();
                }
            } else {
                // Procesamiento directo sin Redis
                const result = await this.db.run(
                    `INSERT INTO messages (room_id, nickname, message, message_type, file_path, file_name) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [roomId, nickname, message, messageType, filePath, fileName]
                );
                messageObj.id = result.id;
            }

            // Invalidar cache de mensajes de la sala
            if (this.redis) {
                await this.redis.client.del(`room:${roomId}:messages`);
            }

            return messageObj;
        } catch (error) {
            throw new Error('Error al guardar mensaje: ' + error.message);
        }
    }

    // Procesamiento en lotes para mejor rendimiento
    async processBatch() {
        if (this.messageQueue.length === 0) return;

        const batch = this.messageQueue.splice(0, this.batchSize);
        
        try {
            // Preparar consulta en lote
            const values = batch.map(msg => 
                `(${msg.roomId}, '${msg.nickname}', '${msg.message.replace(/'/g, "''")}', 
                  '${msg.messageType}', ${msg.filePath ? `'${msg.filePath}'` : 'NULL'}, 
                  ${msg.fileName ? `'${msg.fileName}'` : 'NULL'}, '${msg.timestamp}')`
            ).join(',');

            const query = `
                INSERT INTO messages (room_id, nickname, message, message_type, file_path, file_name, timestamp) 
                VALUES ${values}
            `;

            await this.db.run(query);
            console.log(`Procesado lote de ${batch.length} mensajes`);
        } catch (error) {
            console.error('Error procesando lote de mensajes:', error);
            // Reintroducir mensajes en la cola para reintento
            this.messageQueue.unshift(...batch);
        }
    }

    // Iniciar procesamiento automático en lotes
    startBatchProcessing() {
        setInterval(async () => {
            if (this.messageQueue.length > 0) {
                await this.processBatch();
            }
        }, this.batchInterval);
    }

    // Obtener historial de mensajes de una sala
    async getRoomMessages(roomId, limit = 50, offset = 0) {
        try {
            const messages = await this.db.all(
                `SELECT id, nickname, message, message_type, file_path, file_name, timestamp 
                 FROM messages 
                 WHERE room_id = ? 
                 ORDER BY timestamp DESC 
                 LIMIT ? OFFSET ?`,
                [roomId, limit, offset]
            );

            // Revertir el orden para mostrar del más antiguo al más reciente
            return messages.reverse().map(msg => ({
                id: msg.id,
                nickname: msg.nickname,
                message: msg.message,
                type: msg.message_type,
                filePath: msg.file_path,
                fileName: msg.file_name,
                timestamp: msg.timestamp
            }));
        } catch (error) {
            throw new Error('Error al obtener mensajes: ' + error.message);
        }
    }

    // Obtener estadísticas de una sala
    async getRoomStats(roomId) {
        try {
            const stats = await this.db.get(
                `SELECT 
                    COUNT(*) as total_messages,
                    COUNT(DISTINCT nickname) as unique_users,
                    MIN(timestamp) as first_message,
                    MAX(timestamp) as last_message
                 FROM messages 
                 WHERE room_id = ?`,
                [roomId]
            );

            const room = await this.getRoomById(roomId);
            
            return {
                room: room,
                totalMessages: stats.total_messages,
                uniqueUsers: stats.unique_users,
                firstMessage: stats.first_message,
                lastMessage: stats.last_message
            };
        } catch (error) {
            throw new Error('Error al obtener estadísticas: ' + error.message);
        }
    }

    // Limpiar mensajes antiguos de una sala
    async clearOldMessages(roomId, daysOld = 7) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        
        try {
            const result = await this.db.run(
                'DELETE FROM messages WHERE room_id = ? AND timestamp < ?',
                [roomId, cutoffDate.toISOString()]
            );
            
            return result.changes;
        } catch (error) {
            throw new Error('Error al limpiar mensajes antiguos: ' + error.message);
        }
    }

    // Buscar mensajes en una sala
    async searchMessages(roomId, searchTerm, limit = 20) {
        try {
            const messages = await this.db.all(
                `SELECT id, nickname, message, message_type, file_path, file_name, timestamp 
                 FROM messages 
                 WHERE room_id = ? AND (message LIKE ? OR nickname LIKE ?)
                 ORDER BY timestamp DESC 
                 LIMIT ?`,
                [roomId, `%${searchTerm}%`, `%${searchTerm}%`, limit]
            );

            return messages.map(msg => ({
                id: msg.id,
                nickname: msg.nickname,
                message: msg.message,
                type: msg.message_type,
                filePath: msg.file_path,
                fileName: msg.file_name,
                timestamp: msg.timestamp
            }));
        } catch (error) {
            throw new Error('Error al buscar mensajes: ' + error.message);
        }
    }

    // Validar PIN
    validatePin(pin) {
        return /^\d{4,6}$/.test(pin);
    }

    // Validar nombre de sala
    validateRoomName(name) {
        return name && name.length >= 3 && name.length <= 50 && /^[a-zA-Z0-9\s\-_]+$/.test(name);
    }
}

module.exports = RoomManager;