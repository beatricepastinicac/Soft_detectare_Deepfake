const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

console.log('📦 Building BeeDetection Pro Extension Package...');

// Create dist directory if it doesn't exist
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
}

// Create zip file
const output = fs.createWriteStream(path.join(distDir, 'bee-detection-pro-v2.0.0.zip'));
const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
});

output.on('close', function() {
    console.log('✅ Extension packaged successfully!');
    console.log(`📊 Total size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
    console.log('📂 Package location: dist/bee-detection-pro-v2.0.0.zip');
    console.log('\n🚀 Ready to load in Chrome!');
    console.log('1. Open Chrome Extensions (chrome://extensions/)');
    console.log('2. Enable Developer mode');
    console.log('3. Click "Load unpacked" and select this folder');
});

archive.on('error', function(err) {
    console.error('❌ Error creating package:', err);
    throw err;
});

archive.pipe(output);

// Add files to the archive
const filesToInclude = [
    'manifest.json',
    'popup.html',
    'popup.js',
    'options.html',
    'report.html',
    'js/',
    'css/',
    'images/',
    'package.json'
];

filesToInclude.forEach(file => {
    const fullPath = path.join(__dirname, file);
    
    if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            archive.directory(fullPath, file);
            console.log(`📁 Added directory: ${file}`);
        } else {
            archive.file(fullPath, { name: file });
            console.log(`📄 Added file: ${file}`);
        }
    } else {
        console.log(`⚠️  File not found: ${file}`);
    }
});

// Finalize the archive
archive.finalize();
