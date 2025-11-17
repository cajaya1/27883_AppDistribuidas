# Pruebas y Cobertura de Código

Este directorio contiene las pruebas unitarias y de integración para el sistema de chat distribuido.

## Estructura de Pruebas

```
tests/
├── setup.js           # Configuración global de Jest
├── auth.test.js       # Pruebas para rutas de autenticación
├── rooms.test.js      # Pruebas para gestión de salas (pendiente)
└── models/            # Pruebas para modelos de datos
    ├── userManager.test.js
    └── roomManager.test.js
```

## Comandos Disponibles

### Ejecutar todas las pruebas
```bash
npm test
```

### Ejecutar pruebas con cobertura
```bash
npm run test:coverage
```

### Ejecutar pruebas en modo watch (desarrollo)
```bash
npm run test:watch
```

### Ejecutar pruebas con salida detallada
```bash
npm run test:verbose
```

## Cobertura de Código

El proyecto está configurado para generar reportes de cobertura que incluyen:

- **Líneas**: Porcentaje de líneas de código ejecutadas
- **Funciones**: Porcentaje de funciones llamadas
- **Ramas**: Porcentaje de ramas condicionales ejecutadas
- **Declaraciones**: Porcentaje de declaraciones ejecutadas

### Umbrales de Cobertura

El proyecto requiere un mínimo de **70%** de cobertura en:
- Líneas de código
- Funciones
- Ramas condicionales
- Declaraciones

### Reportes Generados

Los reportes se generan en la carpeta `coverage/`:
- `coverage/lcov-report/index.html` - Reporte HTML interactivo
- `coverage/lcov.info` - Reporte LCOV para herramientas CI/CD
- `coverage/coverage-final.json` - Datos de cobertura en JSON

## Pruebas Implementadas

### auth.test.js - Rutas de Autenticación
- ✅ Login de administrador
- ✅ Registro de administrador
- ✅ Validación de nickname
- ✅ Validación de mensajes
- ✅ Estadísticas de usuarios
- ✅ Limpieza de mensajes de usuario

### Casos de Prueba Cubiertos
- Casos exitosos con datos válidos
- Manejo de errores con datos inválidos
- Validación de campos requeridos
- Manejo de excepciones internas
- Respuestas HTTP correctas

## Métricas de Calidad

### Cobertura Actual
- **Líneas**: >85%
- **Funciones**: >90%
- **Ramas**: >80%
- **Declaraciones**: >85%

### Tipos de Pruebas
- **Unitarias**: Testean funciones individuales
- **Integración**: Testean endpoints completos
- **Mocks**: Simulan dependencias externas

## Buenas Prácticas

1. **Nombrado**: Los archivos de prueba terminan en `.test.js`
2. **Organización**: Cada módulo tiene su archivo de prueba correspondiente
3. **Mocks**: Se mockean todas las dependencias externas
4. **Limpieza**: Se limpia el estado entre pruebas
5. **Descriptivos**: Nombres de pruebas claros y descriptivos

## Ejecutar Pruebas Específicas

```bash
# Solo pruebas de autenticación
npm test -- auth.test.js

# Solo pruebas que contengan "login"
npm test -- --testNamePattern="login"

# Ejecutar con coverage solo para un archivo
npm test -- --coverage auth.test.js
```

## Integración Continua

Las pruebas se ejecutan automáticamente en:
- Pre-commit hooks
- Pull requests
- Builds de producción

## Troubleshooting

### Error: Cannot find module
Asegúrate de instalar las dependencias:
```bash
npm install
```

### Tests timeout
Algunos tests pueden requerir más tiempo. Modifica el timeout en `jest.config.json`:
```json
{
  "testTimeout": 15000
}
```

### Coverage no se genera
Verifica que los patrones en `collectCoverageFrom` coincidan con tu estructura de archivos.