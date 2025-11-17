const redis = require('redis');

class RedisManager {
    constructor() {
        this.client = null;
        this.publisher = null;
        this.subscriber = null;
    }

    async init() {
        try {
            // Cliente principal para cache
            this.client = redis.createClient({
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                retry_strategy: (options) => {
                    if (options.error && options.error.code === 'ECONNREFUSED') {
                        console.error('Redis server refused connection');
                        return new Error('Redis server refused connection');
                    }
                    if (options.total_retry_time > 1000 * 60 * 60) {
                        return new Error('Retry time exhausted');
                    }
                    if (options.attempt > 10) {
                        return undefined;
                    }
                    return Math.min(options.attempt * 100, 3000);
                }
            });

            // Cliente para publicar mensajes entre instancias
            this.publisher = redis.createClient({
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD || undefined
            });

            // Cliente para suscribirse a mensajes entre instancias
            this.subscriber = redis.createClient({
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD || undefined
            });

            await this.client.connect();
            await this.publisher.connect();
            await this.subscriber.connect();

            console.log('Conectado a Redis correctamente');
        } catch (error) {
            console.error('Error conectando a Redis:', error);
            throw error;
        }
    }

    // Gestión de sesiones de usuarios
    async setUserSession(userIP, sessionData, ttlSeconds = 3600) {
        const key = `session:${userIP}`;
        await this.client.setEx(key, ttlSeconds, JSON.stringify(sessionData));
    }

    async getUserSession(userIP) {
        const key = `session:${userIP}`;
        const session = await this.client.get(key);
        return session ? JSON.parse(session) : null;
    }

    async deleteUserSession(userIP) {
        const key = `session:${userIP}`;
        await this.client.del(key);
    }

    // Cache de mensajes recientes por sala
    async cacheRoomMessages(roomId, messages, ttlSeconds = 1800) {
        const key = `room:${roomId}:messages`;
        await this.client.setEx(key, ttlSeconds, JSON.stringify(messages));
    }

    async getCachedRoomMessages(roomId) {
        const key = `room:${roomId}:messages`;
        const messages = await this.client.get(key);
        return messages ? JSON.parse(messages) : null;
    }

    // Contadores de usuarios por sala en tiempo real
    async incrementRoomUsers(roomId) {
        const key = `room:${roomId}:users`;
        return await this.client.incr(key);
    }

    async decrementRoomUsers(roomId) {
        const key = `room:${roomId}:users`;
        const count = await this.client.decr(key);
        if (count <= 0) {
            await this.client.del(key);
            return 0;
        }
        return count;
    }

    async getRoomUserCount(roomId) {
        const key = `room:${roomId}:users`;
        const count = await this.client.get(key);
        return count ? parseInt(count) : 0;
    }

    // Lista de usuarios activos en una sala
    async addUserToRoom(roomId, userInfo) {
        const key = `room:${roomId}:active_users`;
        await this.client.hSet(key, userInfo.socketId, JSON.stringify({
            nickname: userInfo.nickname,
            joinedAt: userInfo.joinedAt,
            ip: userInfo.ip
        }));
        await this.client.expire(key, 3600); // Expire en 1 hora
    }

    async removeUserFromRoom(roomId, socketId) {
        const key = `room:${roomId}:active_users`;
        await this.client.hDel(key, socketId);
    }

    async getRoomActiveUsers(roomId) {
        const key = `room:${roomId}:active_users`;
        const users = await this.client.hGetAll(key);
        const result = [];
        
        for (const [socketId, userData] of Object.entries(users)) {
            try {
                result.push({
                    socketId,
                    ...JSON.parse(userData)
                });
            } catch (e) {
                // Limpiar datos corruptos
                await this.client.hDel(key, socketId);
            }
        }
        
        return result;
    }

    // Rate limiting distribuido
    async checkRateLimit(key, maxRequests, windowSeconds) {
        const current = await this.client.incr(key);
        
        if (current === 1) {
            await this.client.expire(key, windowSeconds);
        }
        
        return current <= maxRequests;
    }

    // Pub/Sub para comunicación entre instancias del servidor
    async publishMessage(channel, message) {
        await this.publisher.publish(channel, JSON.stringify(message));
    }

    async subscribeToChannel(channel, callback) {
        await this.subscriber.subscribe(channel, (message) => {
            try {
                const data = JSON.parse(message);
                callback(data);
            } catch (error) {
                console.error('Error parsing Redis message:', error);
            }
        });
    }

    // Cache de información de salas
    async cacheRoomInfo(roomId, roomData, ttlSeconds = 3600) {
        const key = `room:${roomId}:info`;
        await this.client.setEx(key, ttlSeconds, JSON.stringify(roomData));
    }

    async getCachedRoomInfo(roomId) {
        const key = `room:${roomId}:info`;
        const room = await this.client.get(key);
        return room ? JSON.parse(room) : null;
    }

    // Estadísticas globales
    async updateGlobalStats(stats) {
        const key = 'global:stats';
        await this.client.setEx(key, 300, JSON.stringify(stats)); // Cache por 5 minutos
    }

    async getGlobalStats() {
        const key = 'global:stats';
        const stats = await this.client.get(key);
        return stats ? JSON.parse(stats) : null;
    }

    // Limpieza de cache expirado
    async cleanupExpiredData() {
        // Esta función se puede extender para limpiar datos específicos
        console.log('Limpieza de cache Redis iniciada');
        
        // Ejemplo: limpiar salas sin usuarios
        const keys = await this.client.keys('room:*:users');
        for (const key of keys) {
            const count = await this.client.get(key);
            if (!count || parseInt(count) <= 0) {
                const roomId = key.split(':')[1];
                await this.client.del(`room:${roomId}:messages`);
                await this.client.del(`room:${roomId}:active_users`);
                await this.client.del(`room:${roomId}:info`);
            }
        }
    }

    async disconnect() {
        if (this.client) await this.client.disconnect();
        if (this.publisher) await this.publisher.disconnect();
        if (this.subscriber) await this.subscriber.disconnect();
        console.log('Desconectado de Redis');
    }
}

module.exports = RedisManager;