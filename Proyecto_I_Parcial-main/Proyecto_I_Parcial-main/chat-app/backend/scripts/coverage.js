#!/usr/bin/env node

/**
 * Script para generar reportes de cobertura de pruebas
 * Uso: npm run test:coverage
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🧪 Ejecutando pruebas con cobertura...\n');

try {
    // Ejecutar Jest con cobertura
    execSync('jest --coverage --verbose', { 
        stdio: 'inherit',
        cwd: __dirname
    });

    console.log('\n✅ Pruebas completadas exitosamente!');
    
    // Verificar si se generó el reporte HTML
    const coverageHtmlPath = path.join(__dirname, '..', 'coverage', 'lcov-report', 'index.html');
    
    if (fs.existsSync(coverageHtmlPath)) {
        console.log(`\n📊 Reporte HTML generado en: ${coverageHtmlPath}`);
        console.log('💡 Abre el reporte en tu navegador para ver los detalles de cobertura');
    }

    // Mostrar resumen de archivos de cobertura
    const coverageDir = path.join(__dirname, '..', 'coverage');
    if (fs.existsSync(coverageDir)) {
        const files = fs.readdirSync(coverageDir);
        console.log('\n📁 Archivos de cobertura generados:');
        files.forEach(file => {
            console.log(`   - ${file}`);
        });
    }

} catch (error) {
    console.error('❌ Error ejecutando las pruebas:', error.message);
    process.exit(1);
}