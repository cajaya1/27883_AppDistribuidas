#!/usr/bin/env node

/**
 * Script de configuración para despliegue en Render
 * Configura automáticamente las variables de entorno y optimizaciones
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Configurando aplicación para Render...\n');

// 1. Verificar archivos necesarios
const requiredFiles = [
    'package.json',
    'server.js',
    'render.yaml'
];

console.log('📋 Verificando archivos necesarios...');
requiredFiles.forEach(file => {
    if (fs.existsSync(path.join(__dirname, '..', file))) {
        console.log(`   ✅ ${file}`);
    } else {
        console.log(`   ❌ ${file} - FALTANTE`);
    }
});

// 2. Crear render.yaml si no existe
const renderYamlPath = path.join(__dirname, '..', 'render.yaml');
if (!fs.existsSync(renderYamlPath)) {
    console.log('\n📝 Creando render.yaml...');
    
    const renderConfig = `services:
  - type: web
    name: chat-app
    env: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: EDUCATIONAL_MODE
        value: true
      - key: USE_POSTGRES
        value: false
      - key: USE_REDIS
        value: false
      - key: MAX_CONNECTIONS_PER_IP
        value: 100
      - key: LOG_LEVEL
        value: info
    healthCheckPath: /health
`;

    fs.writeFileSync(renderYamlPath, renderConfig);
    console.log('   ✅ render.yaml creado');
}

// 3. Verificar configuración de package.json
console.log('\n📦 Verificando package.json...');
const packageJsonPath = path.join(__dirname, '..', 'package.json');
if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Verificar scripts necesarios
    const requiredScripts = {
        'start': 'node server.js',
        'build': 'echo "No build step required"'
    };
    
    let needsUpdate = false;
    for (const [script, command] of Object.entries(requiredScripts)) {
        if (!packageJson.scripts[script] || packageJson.scripts[script] !== command) {
            packageJson.scripts[script] = command;
            needsUpdate = true;
        }
    }
    
    // Verificar engines
    if (!packageJson.engines) {
        packageJson.engines = {};
        needsUpdate = true;
    }
    if (!packageJson.engines.node) {
        packageJson.engines.node = '>=16.0.0';
        needsUpdate = true;
    }
    
    if (needsUpdate) {
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        console.log('   ✅ package.json actualizado');
    } else {
        console.log('   ✅ package.json configurado correctamente');
    }
}

// 4. Crear endpoint de health check si no existe
const serverPath = path.join(__dirname, '..', 'server.js');
if (fs.existsSync(serverPath)) {
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    
    if (!serverContent.includes('/health')) {
        console.log('\n🏥 Agregando endpoint de health check...');
        
        // Buscar donde agregar el endpoint
        const lines = serverContent.split('\n');
        const insertIndex = lines.findIndex(line => line.includes('app.listen') || line.includes('server.listen'));
        
        if (insertIndex > 0) {
            const healthCheckCode = `
// Health check endpoint para Render
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    });
});
`;
            
            lines.splice(insertIndex, 0, healthCheckCode);
            fs.writeFileSync(serverPath, lines.join('\n'));
            console.log('   ✅ Health check endpoint agregado');
        }
    } else {
        console.log('   ✅ Health check endpoint ya existe');
    }
}

// 5. Mostrar instrucciones finales
console.log('\n🎉 Configuración completada!');
console.log('\n📋 Instrucciones para desplegar en Render:');
console.log('   1. Haz commit y push de todos los cambios');
console.log('   2. Conecta tu repositorio en render.com');
console.log('   3. Las variables de entorno se configurarán automáticamente');
console.log('   4. El despliegue debería funcionar sin problemas');

console.log('\n⚙️  Variables de entorno recomendadas para Render:');
console.log('   EDUCATIONAL_MODE=true');
console.log('   NODE_ENV=production');
console.log('   MAX_CONNECTIONS_PER_IP=100');

console.log('\n🔗 Tu aplicación estará disponible en:');
console.log('   https://tu-app-name.onrender.com');

console.log('\n💡 Tip: Los rate limits ahora son más permisivos para demostraciones educativas');
console.log('    hasta 50 usuarios pueden acceder desde la misma IP sin problemas.');