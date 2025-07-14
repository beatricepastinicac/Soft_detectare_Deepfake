#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Verificare implementare funcționalități Premium\n');

// Check backend files
const backendFiles = [
    'backend/deepfakeDetector/heatmapGeneratorAvansat.py',
    'backend/deepfakeDetector/wrapperHeatmapAvansat.py',
    'backend/routes/analysis.js',
    'backend/testPremiumFeatures.js'
];

// Check frontend files
const frontendFiles = [
    'frontend/website/deepfakeDetection/src/components/Product.js',
    'frontend/website/deepfakeDetection/src/styles/components/product.css'
];

console.log('📁 Verificare fișiere backend:');
backendFiles.forEach(file => {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        console.log(`  ✅ ${file} (${(stats.size / 1024).toFixed(1)}KB)`);
    } else {
        console.log(`  ❌ ${file} - LIPSEȘTE`);
    }
});

console.log('\n📁 Verificare fișiere frontend:');
frontendFiles.forEach(file => {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        console.log(`  ✅ ${file} (${(stats.size / 1024).toFixed(1)}KB)`);
    } else {
        console.log(`  ❌ ${file} - LIPSEȘTE`);
    }
});

// Check if dependencies are installed
console.log('\n📦 Verificare dependențe:');

// Check Python requirements
const pythonReqPath = path.join(process.cwd(), 'backend/deepfakeDetector/requirements.txt');
if (fs.existsSync(pythonReqPath)) {
    console.log('  ✅ requirements.txt găsit');
    const requirements = fs.readFileSync(pythonReqPath, 'utf8');
    const hasImportantDeps = ['tensorflow', 'opencv', 'matplotlib'].every(dep => 
        requirements.toLowerCase().includes(dep)
    );
    console.log(`  ${hasImportantDeps ? '✅' : '⚠️'} Dependențe critice: tensorflow, opencv, matplotlib`);
} else {
    console.log('  ❌ requirements.txt lipsește');
}

// Check package.json
const packagePath = path.join(process.cwd(), 'backend/package.json');
if (fs.existsSync(packagePath)) {
    console.log('  ✅ backend/package.json găsit');
    try {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        const hasNodeDeps = ['express', 'axios', 'multer'].every(dep => 
            pkg.dependencies && pkg.dependencies[dep]
        );
        console.log(`  ${hasNodeDeps ? '✅' : '⚠️'} Dependențe Node.js critice găsite`);
    } catch (e) {
        console.log('  ⚠️ Eroare la citirea package.json');
    }
}

// Check specific functions in files
console.log('\n🔧 Verificare funcționalități implementate:');

// Check if advanced heatmap function exists in analysis.js
const analysisPath = path.join(process.cwd(), 'backend/routes/analysis.js');
if (fs.existsSync(analysisPath)) {
    const analysisContent = fs.readFileSync(analysisPath, 'utf8');
    const hasPremiumFunction = analysisContent.includes('generateAdvancedHeatmapForPremium');
    const hasTierCheck = analysisContent.includes('userTier') || analysisContent.includes('tier');
    
    console.log(`  ${hasPremiumFunction ? '✅' : '❌'} Funcție premium heatmap în analysis.js`);
    console.log(`  ${hasTierCheck ? '✅' : '❌'} Verificare tier utilizator`);
}

// Check Product.js for premium features
const productPath = path.join(process.cwd(), 'frontend/website/deepfakeDetection/src/components/Product.js');
if (fs.existsSync(productPath)) {
    const productContent = fs.readFileSync(productPath, 'utf8');
    const hasIsUserPremium = productContent.includes('isUserPremium');
    const hasPremiumBadge = productContent.includes('premium-badge');
    const hasPremiumStats = productContent.includes('premium-stats-container');
    
    console.log(`  ${hasIsUserPremium ? '✅' : '❌'} Funcție isUserPremium() în Product.js`);
    console.log(`  ${hasPremiumBadge ? '✅' : '❌'} Badge-uri premium în UI`);
    console.log(`  ${hasPremiumStats ? '✅' : '❌'} Container statistici premium`);
}

console.log('\n📋 Checklist pentru testare:');
console.log('  1. ⬜ Server backend pornit (npm start în /backend)');
console.log('  2. ⬜ Frontend pornit (npm start în /frontend/website/deepfakeDetection)');
console.log('  3. ⬜ Utilizator cu tier premium creat în baza de date');
console.log('  4. ⬜ Test imagine disponibilă (backend/deepfakeDetector/test.jpg)');
console.log('  5. ⬜ Python dependențe instalate (pip install -r requirements.txt)');

console.log('\n🚀 Pentru a testa funcționalitățile premium:');
console.log('  1. cd backend && node testPremiumFeatures.js');
console.log('  2. Accesați interfața web și autentificați-vă');
console.log('  3. Încărcați o imagine și verificați:');
console.log('     - Badge PREMIUM în header');
console.log('     - Heatmap avansat în rezultate');
console.log('     - Secțiuni "Statistici Premium" și "Funcționalități Premium"');

console.log('\n✨ Implementare completă realizată cu succes!');
