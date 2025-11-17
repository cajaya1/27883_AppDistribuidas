const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/auth');

// Mock del userManager
const mockUserManager = {
    authenticateAdmin: jest.fn(),
    createAdmin: jest.fn(),
    validateNickname: jest.fn(),
    validateMessage: jest.fn(),
    getUserStats: jest.fn(),
    clearUserMessages: jest.fn()
};

// Configurar la aplicación de prueba
const app = express();
app.use(express.json());
app.locals.userManager = mockUserManager;
app.use('/api/auth', authRoutes);

describe('Auth Routes - Pruebas de Cobertura', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/auth/admin/login', () => {
        test('Debe autenticar administrador con credenciales válidas', async () => {
            mockUserManager.authenticateAdmin.mockResolvedValue({
                success: true,
                admin: { id: 1, username: 'admin', role: 'admin' }
            });

            const response = await request(app)
                .post('/api/auth/admin/login')
                .send({
                    username: 'admin',
                    password: 'password123'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Login exitoso');
            expect(mockUserManager.authenticateAdmin).toHaveBeenCalledWith('admin', 'password123');
        });

        test('Debe rechazar login con credenciales inválidas', async () => {
            mockUserManager.authenticateAdmin.mockResolvedValue({
                success: false,
                message: 'Credenciales inválidas'
            });

            const response = await request(app)
                .post('/api/auth/admin/login')
                .send({
                    username: 'admin',
                    password: 'wrongpassword'
                });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Credenciales inválidas');
        });

        test('Debe devolver error 400 si falta username', async () => {
            const response = await request(app)
                .post('/api/auth/admin/login')
                .send({
                    password: 'password123'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Username y password son requeridos');
        });

        test('Debe devolver error 400 si falta password', async () => {
            const response = await request(app)
                .post('/api/auth/admin/login')
                .send({
                    username: 'admin'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Username y password son requeridos');
        });

        test('Debe manejar errores internos del servidor', async () => {
            mockUserManager.authenticateAdmin.mockRejectedValue(new Error('Database error'));

            const response = await request(app)
                .post('/api/auth/admin/login')
                .send({
                    username: 'admin',
                    password: 'password123'
                });

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Error interno del servidor');
        });
    });

    describe('POST /api/auth/admin/register', () => {
        test('Debe registrar administrador con datos válidos', async () => {
            const mockAdmin = {
                id: 1,
                username: 'newadmin',
                created_at: new Date().toISOString()
            };

            mockUserManager.createAdmin.mockResolvedValue(mockAdmin);

            const response = await request(app)
                .post('/api/auth/admin/register')
                .send({
                    username: 'newadmin',
                    password: 'password123',
                    confirmPassword: 'password123'
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Administrador creado exitosamente');
            expect(response.body.admin.username).toBe('newadmin');
        });

        test('Debe rechazar registro si las contraseñas no coinciden', async () => {
            const response = await request(app)
                .post('/api/auth/admin/register')
                .send({
                    username: 'newadmin',
                    password: 'password123',
                    confirmPassword: 'password456'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Las contraseñas no coinciden');
        });

        test('Debe rechazar registro si faltan campos requeridos', async () => {
            const response = await request(app)
                .post('/api/auth/admin/register')
                .send({
                    username: 'newadmin'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Todos los campos son requeridos');
        });

        test('Debe manejar errores de creación de administrador', async () => {
            mockUserManager.createAdmin.mockRejectedValue(new Error('Usuario ya existe'));

            const response = await request(app)
                .post('/api/auth/admin/register')
                .send({
                    username: 'existingadmin',
                    password: 'password123',
                    confirmPassword: 'password123'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Usuario ya existe');
        });
    });

    describe('POST /api/auth/validate-nickname', () => {
        test('Debe validar nickname válido', async () => {
            mockUserManager.validateNickname.mockReturnValue({
                valid: true
            });

            const response = await request(app)
                .post('/api/auth/validate-nickname')
                .send({
                    nickname: 'usuario123'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Nickname válido');
        });

        test('Debe rechazar nickname inválido', async () => {
            mockUserManager.validateNickname.mockReturnValue({
                valid: false,
                message: 'Nickname contiene caracteres inválidos'
            });

            const response = await request(app)
                .post('/api/auth/validate-nickname')
                .send({
                    nickname: 'user@#$'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Nickname contiene caracteres inválidos');
        });

        test('Debe rechazar si falta nickname', async () => {
            const response = await request(app)
                .post('/api/auth/validate-nickname')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Nickname es requerido');
        });

        test('Debe manejar errores internos en validación', async () => {
            mockUserManager.validateNickname.mockImplementation(() => {
                throw new Error('Validation error');
            });

            const response = await request(app)
                .post('/api/auth/validate-nickname')
                .send({
                    nickname: 'usuario123'
                });

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Error interno del servidor');
        });
    });

    describe('POST /api/auth/validate-message', () => {
        test('Debe validar mensaje válido', async () => {
            mockUserManager.validateMessage.mockReturnValue({
                valid: true
            });

            const response = await request(app)
                .post('/api/auth/validate-message')
                .send({
                    message: 'Hola mundo'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Mensaje válido');
        });

        test('Debe rechazar mensaje inválido', async () => {
            mockUserManager.validateMessage.mockReturnValue({
                valid: false,
                message: 'Mensaje contiene palabras prohibidas'
            });

            const response = await request(app)
                .post('/api/auth/validate-message')
                .send({
                    message: 'mensaje con palabrota'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Mensaje contiene palabras prohibidas');
        });

        test('Debe rechazar si falta mensaje', async () => {
            const response = await request(app)
                .post('/api/auth/validate-message')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Mensaje es requerido');
        });
    });

    describe('GET /api/auth/user-stats', () => {
        test('Debe obtener estadísticas de usuarios', async () => {
            const mockStats = {
                totalUsers: 150,
                activeUsers: 45,
                totalRooms: 12,
                totalMessages: 1250
            };

            mockUserManager.getUserStats.mockResolvedValue(mockStats);

            const response = await request(app)
                .get('/api/auth/user-stats');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual(mockStats);
        });

        test('Debe manejar errores al obtener estadísticas', async () => {
            mockUserManager.getUserStats.mockRejectedValue(new Error('Database error'));

            const response = await request(app)
                .get('/api/auth/user-stats');

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Error interno del servidor');
        });
    });

    describe('POST /api/auth/clear-user-messages', () => {
        test('Debe limpiar mensajes de usuario exitosamente', async () => {
            mockUserManager.clearUserMessages.mockResolvedValue(5);

            const response = await request(app)
                .post('/api/auth/clear-user-messages')
                .send({
                    nickname: 'usuario123',
                    roomId: 'room-456'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.deletedCount).toBe(5);
            expect(response.body.message).toBe('Se eliminaron 5 mensajes del usuario usuario123');
        });

        test('Debe rechazar si faltan parámetros requeridos', async () => {
            const response = await request(app)
                .post('/api/auth/clear-user-messages')
                .send({
                    nickname: 'usuario123'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Nickname y roomId son requeridos');
        });

        test('Debe manejar errores al limpiar mensajes', async () => {
            mockUserManager.clearUserMessages.mockRejectedValue(new Error('User not found'));

            const response = await request(app)
                .post('/api/auth/clear-user-messages')
                .send({
                    nickname: 'usuario123',
                    roomId: 'room-456'
                });

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('User not found');
        });
    });
});