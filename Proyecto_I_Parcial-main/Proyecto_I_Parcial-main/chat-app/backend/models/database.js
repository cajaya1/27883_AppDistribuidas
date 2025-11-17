/**
 * Capa de Acceso a Datos - SQLite
 * Maneja la conexión, inicialización y creación de esquemas
 * para la base de datos embebida del sistema de chat
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        this.db = null;
        // Usar directorio actual para producción o config para desarrollo
        const dbDir = process.env.NODE_ENV === 'production' 
            ? __dirname 
            : path.join(__dirname, '../config');
        
        // Asegurar que el directorio existe
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        this.dbPath = path.join(dbDir, 'chat.db');
        console.log('Ruta de base de datos:', this.dbPath);
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error al conectar con la base de datos:', err.message);
                    console.error('Ruta intentada:', this.dbPath);
                    reject(err);
                } else {
                    console.log('Conectado a la base de datos SQLite');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        const queries = [
            // Tabla de salas
            `CREATE TABLE IF NOT EXISTS rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('text', 'multimedia')),
                pin TEXT UNIQUE NOT NULL,
                admin_password TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT 1
            )`,
            
            // Tabla de mensajes
            `CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id INTEGER NOT NULL,
                nickname TEXT NOT NULL,
                message TEXT NOT NULL,
                message_type TEXT DEFAULT 'text' CHECK(message_type IN ('text', 'file', 'image')),
                file_path TEXT,
                file_name TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE
            )`,
            
            // Tabla de archivos subidos (para salas multimedia)
            `CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER NOT NULL,
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                mime_type TEXT NOT NULL,
                upload_path TEXT NOT NULL,
                uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE
            )`,
            
            // Tabla de administradores (opcional)
            `CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT 1
            )`
        ];

        for (const query of queries) {
            await this.run(query);
        }

        // Crear índices para optimizar consultas
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_rooms_pin ON rooms(pin)',
            'CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id)',
            'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_files_message_id ON files(message_id)'
        ];

        for (const index of indexes) {
            await this.run(index);
        }

        console.log('Tablas de la base de datos creadas correctamente');
    }

    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('Error ejecutando query:', err.message);
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    console.error('Error ejecutando query:', err.message);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('Error ejecutando query:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('Conexión de base de datos cerrada');
                    resolve();
                }
            });
        });
    }

    // Método para limpiar datos antiguos (opcional)
    async cleanup(daysOld = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        
        try {
            // Eliminar mensajes antiguos
            await this.run(
                'DELETE FROM messages WHERE timestamp < ?',
                [cutoffDate.toISOString()]
            );
            
            // Eliminar salas inactivas antiguas
            await this.run(
                'DELETE FROM rooms WHERE is_active = 0 AND created_at < ?',
                [cutoffDate.toISOString()]
            );
            
            console.log('Limpieza de datos antiguos completada');
        } catch (error) {
            console.error('Error durante la limpieza:', error);
        }
    }
}

module.exports = Database;