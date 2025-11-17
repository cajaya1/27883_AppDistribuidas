const io = require('socket.io-client');
const readline = require('readline');

class ChatBenchmark {
    constructor(options = {}) {
        this.url = options.url || 'http://localhost:3000';
        this.totalUsers = options.totalUsers || 100;
        this.messagesPerUser = options.messagesPerUser || 10;
        this.concurrentConnections = options.concurrentConnections || 10;
        this.messageInterval = options.messageInterval || 1000;
        
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

    async runBenchmark() {
        console.log('🚀 Iniciando benchmark de escalabilidad...');
        console.log(`📊 Configuración:`);
        console.log(`   - URL: ${this.url}`);
        console.log(`   - Usuarios totales: ${this.totalUsers}`);
        console.log(`   - Mensajes por usuario: ${this.messagesPerUser}`);
        console.log(`   - Conexiones concurrentes: ${this.concurrentConnections}`);
        console.log(`   - Intervalo de mensajes: ${this.messageInterval}ms`);
        console.log('');

        this.stats.startTime = Date.now();

        // Crear sala de prueba
        const testRoom = await this.createTestRoom();
        console.log(`🏠 Sala de prueba creada - PIN: ${testRoom.pin}`);

        // Conectar usuarios en lotes
        await this.connectUsersInBatches(testRoom.pin);

        // Esperar a que todos se conecten
        await this.waitForConnections();

        // Enviar mensajes
        await this.sendMessages();

        // Generar reporte
        this.generateReport();

        // Limpiar
        this.cleanup();
    }

    async createTestRoom() {
        return new Promise((resolve, reject) => {
            const fetch = require('node-fetch');
            
            fetch(`${this.url}/api/rooms/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Benchmark Test Room',
                    type: 'text'
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    resolve(data.room);
                } else {
                    reject(new Error(data.message));
                }
            })
            .catch(reject);
        });
    }

    async connectUsersInBatches(pin) {
        const batches = Math.ceil(this.totalUsers / this.concurrentConnections);
        
        for (let batch = 0; batch < batches; batch++) {
            const batchSize = Math.min(
                this.concurrentConnections,
                this.totalUsers - (batch * this.concurrentConnections)
            );
            
            const batchPromises = [];
            
            for (let i = 0; i < batchSize; i++) {
                const userId = (batch * this.concurrentConnections) + i;
                batchPromises.push(this.connectUser(userId, pin));
            }
            
            await Promise.all(batchPromises);
            console.log(`📡 Conectado lote ${batch + 1}/${batches} (${batchSize} usuarios)`);
            
            // Pausa entre lotes para evitar sobrecarga
            if (batch < batches - 1) {
                await this.sleep(500);
            }
        }
    }

    connectUser(userId, pin) {
        return new Promise((resolve, reject) => {
            const nickname = `user${userId}`;
            const client = io(this.url, {
                transports: ['websocket'],
                timeout: 5000
            });

            client.userId = userId;
            client.nickname = nickname;
            client.messagesSent = 0;
            client.messagesReceived = 0;

            client.on('connect', () => {
                client.emit('joinRoom', { nickname, pin });
            });

            client.on('joinedRoom', () => {
                this.stats.connected++;
                this.clients.push(client);
                resolve();
            });

            client.on('newMessage', (data) => {
                client.messagesReceived++;
                this.stats.messagesReceived++;
            });

            client.on('error', (error) => {
                this.stats.errors++;
                console.error(`❌ Error usuario ${userId}:`, error.message);
                resolve(); // Continuar con otros usuarios
            });

            client.on('disconnect', () => {
                this.stats.connected--;
            });

            // Timeout para conexión
            setTimeout(() => {
                if (!client.connected) {
                    this.stats.errors++;
                    console.error(`⏰ Timeout conectando usuario ${userId}`);
                    resolve();
                }
            }, 10000);
        });
    }

    async waitForConnections() {
        console.log(`⏳ Esperando conexiones (${this.stats.connected}/${this.totalUsers})...`);
        
        while (this.stats.connected < this.totalUsers - this.stats.errors) {
            await this.sleep(100);
            process.stdout.write(`\r⏳ Conectados: ${this.stats.connected}/${this.totalUsers}`);
        }
        console.log(`\n✅ ${this.stats.connected} usuarios conectados`);
    }

    async sendMessages() {
        console.log(`📨 Iniciando envío de mensajes...`);
        
        const messagePromises = this.clients.map(client => 
            this.sendMessagesForUser(client)
        );

        await Promise.all(messagePromises);
        console.log(`✅ Todos los mensajes enviados`);
    }

    async sendMessagesForUser(client) {
        for (let i = 0; i < this.messagesPerUser; i++) {
            const message = `Mensaje ${i + 1} de ${client.nickname} - Timestamp: ${Date.now()}`;
            
            client.emit('sendMessage', { message });
            client.messagesSent++;
            this.stats.messagesSent++;

            // Intervalo aleatorio entre mensajes para simular comportamiento real
            const interval = this.messageInterval + (Math.random() * 500);
            await this.sleep(interval);
        }
    }

    generateReport() {
        this.stats.endTime = Date.now();
        const duration = (this.stats.endTime - this.stats.startTime) / 1000;
        const messagesPerSecond = this.stats.messagesSent / duration;
        const successRate = (this.stats.connected / this.totalUsers) * 100;

        console.log('\n' + '='.repeat(60));
        console.log('📊 REPORTE DE BENCHMARK');
        console.log('='.repeat(60));
        console.log(`⏱️  Duración total: ${duration.toFixed(2)} segundos`);
        console.log(`👥 Usuarios conectados: ${this.stats.connected}/${this.totalUsers}`);
        console.log(`✅ Tasa de éxito: ${successRate.toFixed(2)}%`);
        console.log(`❌ Errores: ${this.stats.errors}`);
        console.log(`📤 Mensajes enviados: ${this.stats.messagesSent}`);
        console.log(`📥 Mensajes recibidos: ${this.stats.messagesReceived}`);
        console.log(`🚀 Mensajes/segundo: ${messagesPerSecond.toFixed(2)}`);
        console.log(`📈 Throughput: ${(this.stats.messagesReceived / duration).toFixed(2)} msg/s recibidos`);
        
        // Métricas de latencia (aproximada)
        const avgLatency = duration / this.stats.messagesSent * 1000;
        console.log(`⏳ Latencia promedio estimada: ${avgLatency.toFixed(2)}ms`);
        
        console.log('='.repeat(60));

        // Evaluación de rendimiento
        if (successRate >= 95 && messagesPerSecond >= 50) {
            console.log('🎉 EXCELENTE: El sistema maneja la carga correctamente');
        } else if (successRate >= 90 && messagesPerSecond >= 25) {
            console.log('✅ BUENO: Rendimiento aceptable con optimizaciones menores');
        } else if (successRate >= 80) {
            console.log('⚠️  REGULAR: Necesita optimizaciones para mejor escalabilidad');
        } else {
            console.log('❌ POBRE: Requiere mejoras significativas en escalabilidad');
        }
    }

    cleanup() {
        console.log('\n🧹 Limpiando conexiones...');
        this.clients.forEach(client => {
            if (client.connected) {
                client.disconnect();
            }
        });
        console.log('✅ Benchmark completado');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Configuración de benchmark interactiva
async function runInteractiveBenchmark() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (prompt) => {
        return new Promise(resolve => {
            rl.question(prompt, resolve);
        });
    };

    console.log('🔧 Configuración de Benchmark de Escalabilidad\n');

    const url = await question('URL del servidor (http://localhost:3000): ') || 'http://localhost:3000';
    const totalUsers = parseInt(await question('Número de usuarios (100): ')) || 100;
    const messagesPerUser = parseInt(await question('Mensajes por usuario (10): ')) || 10;
    const concurrentConnections = parseInt(await question('Conexiones concurrentes (10): ')) || 10;
    const messageInterval = parseInt(await question('Intervalo entre mensajes en ms (1000): ')) || 1000;

    rl.close();

    const benchmark = new ChatBenchmark({
        url,
        totalUsers,
        messagesPerUser,
        concurrentConnections,
        messageInterval
    });

    try {
        await benchmark.runBenchmark();
    } catch (error) {
        console.error('❌ Error durante el benchmark:', error);
        process.exit(1);
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--interactive')) {
        runInteractiveBenchmark();
    } else {
        // Configuración por defecto
        const benchmark = new ChatBenchmark();
        benchmark.runBenchmark().catch(error => {
            console.error('❌ Error:', error);
            process.exit(1);
        });
    }
}

module.exports = ChatBenchmark;