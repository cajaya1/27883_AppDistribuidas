const { Pool } = require('pg');

class PostgresDatabase {
    constructor() {
        this.pool = null;
        this.config = {
            user: process.env.DB_USER || 'postgres',
            host: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'chatapp',
            password: process.env.DB_PASSWORD || 'password',
            port: process.env.DB_PORT || 5432,
            max: 20, // máximo 20 conexiones en el pool
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        };
    }

    async init() {
        try {
            this.pool = new Pool(this.config);
            
            // Verificar conexión
            const client = await this.pool.connect();
            console.log('Conectado a PostgreSQL');
            client.release();
            
            await this.createTables();
            console.log('Tablas de PostgreSQL creadas correctamente');
        } catch (error) {
            console.error('Error conectando a PostgreSQL:', error);
            throw error;
        }
    }

    async createTables() {
        const queries = [
            // Tabla de salas con índices para mejor rendimiento
            `CREATE TABLE IF NOT EXISTS rooms (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) NOT NULL,
                type VARCHAR(20) NOT NULL CHECK(type IN ('text', 'multimedia')),
                pin CHAR(6) UNIQUE NOT NULL,
                admin_password VARCHAR(255),
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE,
                max_users INTEGER DEFAULT 50,
                user_count INTEGER DEFAULT 0
            )`,
            
            // Tabla de mensajes particionada por fecha para mejor rendimiento
            `CREATE TABLE IF NOT EXISTS messages (
                id BIGSERIAL PRIMARY KEY,
                room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                nickname VARCHAR(20) NOT NULL,
                message TEXT NOT NULL,
                message_type VARCHAR(20) DEFAULT 'text' CHECK(message_type IN ('text', 'file', 'image')),
                file_path TEXT,
                file_name TEXT,
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                user_ip INET
            )`,
            
            // Tabla de sesiones activas para control de concurrencia
            `CREATE TABLE IF NOT EXISTS active_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_ip INET NOT NULL,
                nickname VARCHAR(20) NOT NULL,
                room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                socket_id VARCHAR(50) NOT NULL,
                last_activity TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_ip, room_id)
            )`,
            
            // Tabla de estadísticas en tiempo real
            `CREATE TABLE IF NOT EXISTS room_stats (
                room_id INTEGER PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
                current_users INTEGER DEFAULT 0,
                total_messages INTEGER DEFAULT 0,
                last_message_at TIMESTAMPTZ,
                peak_users INTEGER DEFAULT 0,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const query of queries) {
            await this.query(query);
        }

        // Crear índices para optimizar consultas frecuentes
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_rooms_pin ON rooms(pin)',
            'CREATE INDEX IF NOT EXISTS idx_rooms_active ON rooms(is_active)',
            'CREATE INDEX IF NOT EXISTS idx_messages_room_timestamp ON messages(room_id, timestamp DESC)',
            'CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id)',
            'CREATE INDEX IF NOT EXISTS idx_active_sessions_room ON active_sessions(room_id)',
            'CREATE INDEX IF NOT EXISTS idx_active_sessions_ip ON active_sessions(user_ip)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON active_sessions(last_activity)'
        ];

        for (const index of indexes) {
            await this.query(index);
        }
    }

    async query(text, params = []) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(text, params);
            return result;
        } finally {
            client.release();
        }
    }

    async transaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Método para limpiar sesiones expiradas
    async cleanupExpiredSessions(timeoutMinutes = 30) {
        const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
        
        const result = await this.query(
            'DELETE FROM active_sessions WHERE last_activity < $1',
            [cutoff]
        );
        
        return result.rowCount;
    }

    // Método para obtener estadísticas de rendimiento
    async getPerformanceStats() {
        const stats = await this.query(`
            SELECT 
                COUNT(*) as total_rooms,
                SUM(user_count) as total_active_users,
                AVG(user_count) as avg_users_per_room,
                MAX(user_count) as max_users_in_room
            FROM rooms WHERE is_active = TRUE
        `);

        return stats.rows[0];
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            console.log('Pool de conexiones PostgreSQL cerrado');
        }
    }
}

module.exports = PostgresDatabase;