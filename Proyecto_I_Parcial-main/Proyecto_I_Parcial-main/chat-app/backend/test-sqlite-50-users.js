const io = require('socket.io-client');

class SQLiteScalabilityTest {
    constructor() {
        this.url = 'http://localhost:3000';
        this.targetUsers = 50; // Exactamente el requisito
        this.messagesPerUser = 5;
        this.clients = [];
        this.stats = {
            connected: 0,
            messagesSent: 0,
            messagesReceived: 0,
            errors: 0,
            startTime: null,
            endTime: null
        };
    }

    async runTest() {
        console.log('🧪 TEST DE ESCALABILIDAD SQLITE - 50 USUARIOS SIMULTÁNEOS');
        console.log('='.repeat(60));
        console.log(`🎯 Objetivo: Demostrar que SQLite soporta ${this.targetUsers} usuarios`);
        console.log(`📊 Configuración:`);
        console.log(`   - Usuarios objetivo: ${this.targetUsers}`);
        console.log(`   - Mensajes por usuario: ${this.messagesPerUser}`);
        console.log(`   - Base de datos: SQLite`);
        console.log('');

        try {
            // Verificar que el servidor esté corriendo
            await this.checkServerHealth();
            
            this.stats.startTime = Date.now();

            // Crear sala de prueba
            const testRoom = await this.createTestRoom();
            console.log(`✅ Sala creada - PIN: ${testRoom.pin}`);

            // Conectar usuarios gradualmente
            await this.connectUsers(testRoom.pin);
            
            // Verificar conexiones exitosas
            await this.verifyConnections();

            // Enviar mensajes de prueba
            await this.sendTestMessages();

            // Generar reporte final
            this.generateReport();

            // Limpiar conexiones
            this.cleanup();

        } catch (error) {
            console.error('❌ Error durante el test:', error.message);
            this.cleanup();
            process.exit(1);
        }
    }

    async checkServerHealth() {
        console.log('🔍 Verificando servidor...');
        
        try {
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(`${this.url}/`);
            if (response.ok) {
                console.log('✅ Servidor SQLite respondiendo correctamente');
            } else {
                throw new Error('Servidor no responde');
            }
        } catch (error) {
            throw new Error(`❌ Servidor no disponible en ${this.url}. Asegúrate de ejecutar: npm start`);
        }
    }

    async createTestRoom() {
        const fetch = (await import('node-fetch')).default;
        
        // Primero crear un admin (si no existe)
        try {
            await fetch(`${this.url}/api/auth/admin/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: 'testadmin',
                    password: 'test123456',
                    confirmPassword: 'test123456'
                })
            });
        } catch (e) {
            // Admin ya existe, continuar
        }

        // Crear sala de prueba
        const response = await fetch(`${this.url}/api/rooms/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test SQLite 50 Users',
                type: 'text'
            })
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(`Error creando sala: ${data.message}`);
        }

        return data.room;
    }

    async connectUsers(pin) {
        console.log(`🔌 Conectando ${this.targetUsers} usuarios simultáneamente...`);
        
        const connectionPromises = [];
        
        for (let i = 0; i < this.targetUsers; i++) {
            connectionPromises.push(this.connectSingleUser(i, pin));
            
            // Progreso visual cada 10 usuarios
            if ((i + 1) % 10 === 0) {
                process.stdout.write(`\r🔌 Iniciando conexión ${i + 1}/${this.targetUsers}...`);
            }
        }

        // Conectar todos simultáneamente
        await Promise.allSettled(connectionPromises);
        console.log(`\n✅ Proceso de conexión completado`);
    }

    connectSingleUser(userId, pin) {
        return new Promise((resolve) => {
            const nickname = `user${userId}`;
            const client = io(this.url, {
                transports: ['websocket'],
                timeout: 10000
            });

            client.userId = userId;
            client.nickname = nickname;
            client.connected = false;

            const timeout = setTimeout(() => {
                if (!client.connected) {
                    this.stats.errors++;
                    console.log(`⏰ Timeout usuario ${userId}`);
                    resolve();
                }
            }, 15000);

            client.on('connect', () => {
                client.emit('joinRoom', { nickname, pin });
            });

            client.on('joinedRoom', () => {
                clearTimeout(timeout);
                client.connected = true;
                this.stats.connected++;
                this.clients.push(client);
                resolve();
            });

            client.on('newMessage', () => {
                this.stats.messagesReceived++;
            });

            client.on('error', (error) => {
                clearTimeout(timeout);
                this.stats.errors++;
                console.log(`❌ Error usuario ${userId}: ${error.message}`);
                resolve();
            });

            client.on('disconnect', () => {
                this.stats.connected--;
            });
        });
    }

    async verifyConnections() {
        console.log(`\n📊 Resultado de conexiones:`);
        console.log(`   ✅ Conectados: ${this.stats.connected}`);
        console.log(`   ❌ Errores: ${this.stats.errors}`);
        console.log(`   🎯 Objetivo: ${this.targetUsers}`);
        
        const successRate = (this.stats.connected / this.targetUsers) * 100;
        console.log(`   📈 Tasa de éxito: ${successRate.toFixed(1)}%`);

        if (this.stats.connected >= this.targetUsers * 0.9) { // 90% de éxito mínimo
            console.log(`   ✅ ÉXITO: SQLite soporta ${this.stats.connected} usuarios simultáneos`);
        } else {
            console.log(`   ⚠️  ADVERTENCIA: Solo ${this.stats.connected} de ${this.targetUsers} se conectaron`);
        }

        // Esperar un momento para estabilizar
        await this.sleep(2000);
    }

    async sendTestMessages() {
        console.log(`\n💬 Enviando mensajes de prueba...`);
        
        const messagePromises = this.clients.map((client, index) => 
            this.sendMessagesForClient(client, index)
        );

        await Promise.all(messagePromises);
        
        // Esperar que lleguen todos los mensajes
        await this.sleep(3000);
        
        console.log(`   📤 Mensajes enviados: ${this.stats.messagesSent}`);
        console.log(`   📥 Mensajes recibidos: ${this.stats.messagesReceived}`);
    }

    async sendMessagesForClient(client, clientIndex) {
        for (let i = 0; i < this.messagesPerUser; i++) {
            const message = `Test msg ${i + 1} from ${client.nickname} - ${Date.now()}`;
            client.emit('sendMessage', { message });
            this.stats.messagesSent++;
            
            // Interval aleatorio para simular uso real
            await this.sleep(Math.random() * 1000 + 500);
        }
    }

    generateReport() {
        this.stats.endTime = Date.now();
        const duration = (this.stats.endTime - this.stats.startTime) / 1000;
        const successRate = (this.stats.connected / this.targetUsers) * 100;
        const messagesPerSecond = this.stats.messagesSent / duration;

        console.log('\n' + '='.repeat(60));
        console.log('📊 REPORTE FINAL - TEST SQLite ESCALABILIDAD');
        console.log('='.repeat(60));
        console.log(`⏱️  Duración total: ${duration.toFixed(2)} segundos`);
        console.log(`🎯 Objetivo: ${this.targetUsers} usuarios simultáneos`);
        console.log(`✅ Usuarios conectados: ${this.stats.connected}/${this.targetUsers}`);
        console.log(`📈 Tasa de éxito: ${successRate.toFixed(1)}%`);
        console.log(`❌ Errores: ${this.stats.errors}`);
        console.log(`💬 Mensajes totales: ${this.stats.messagesSent} enviados, ${this.stats.messagesReceived} recibidos`);
        console.log(`🚀 Throughput: ${messagesPerSecond.toFixed(2)} mensajes/segundo`);
        console.log('');

        // Evaluación del cumplimiento
        if (this.stats.connected >= 50 && successRate >= 90) {
            console.log('🎉 ✅ REQUISITO CUMPLIDO');
            console.log('   SQLite SOPORTA 50+ usuarios simultáneos por sala');
            console.log(`   Rendimiento: ${this.stats.connected} usuarios conectados exitosamente`);
        } else if (this.stats.connected >= 40) {
            console.log('⚠️  ✅ REQUISITO MAYORMENTE CUMPLIDO');
            console.log('   SQLite soporta la mayoría de usuarios requeridos');
            console.log('   Posibles optimizaciones menores necesarias');
        } else {
            console.log('❌ REQUISITO NO CUMPLIDO');
            console.log('   Se requieren optimizaciones o PostgreSQL');
        }

        console.log('');
        console.log('📋 ANÁLISIS TÉCNICO:');
        console.log(`   • SQLite maneja concurrencia: ${successRate >= 90 ? 'EXCELENTE' : 'ACEPTABLE'}`);
        console.log(`   • Rendimiento de mensajes: ${messagesPerSecond >= 10 ? 'ÓPTIMO' : 'MEJORABLE'}`);
        console.log(`   • Estabilidad de conexiones: ${this.stats.errors <= 5 ? 'ESTABLE' : 'INESTABLE'}`);
        console.log('='.repeat(60));
    }

    cleanup() {
        console.log('\n🧹 Limpiando conexiones...');
        this.clients.forEach(client => {
            if (client.connected) {
                client.disconnect();
            }
        });
        console.log('✅ Test completado');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Ejecutar test si es llamado directamente
if (require.main === module) {
    const test = new SQLiteScalabilityTest();
    test.runTest().catch(error => {
        console.error('❌ Error crítico:', error);
        process.exit(1);
    });
}

module.exports = SQLiteScalabilityTest;