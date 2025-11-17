// Configuración global para Jest
process.env.NODE_ENV = 'test';

// Mock global para console.error durante las pruebas
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

// Configuración global de timeouts
jest.setTimeout(10000);