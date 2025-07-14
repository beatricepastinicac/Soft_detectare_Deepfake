const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');

class ExtensionZipper {
    constructor() {
        this.distDir = './dist';
        this.outputDir = './releases';
        this.packageInfo = require('./package.json');
    }

    async createZip() {
        console.log('📦 Creating extension package...');
        
        await this.ensureDirectories();
        const zipPath = await this.generateZip();
        
        console.log(`✅ Extension packaged successfully: ${zipPath}`);
        return zipPath;
    }

    async ensureDirectories() {
        if (!await fs.pathExists(this.distDir)) {
            throw new Error('Dist directory not found. Run "npm run build" first.');
        }
        
        await fs.ensureDir(this.outputDir);
    }

    async generateZip() {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const zipName = `bee-detection-v${this.packageInfo.version}-${timestamp}.zip`;
        const zipPath = path.join(this.outputDir, zipName);
        
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            
            output.on('close', () => {
                console.log(`📁 Archive size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
                resolve(zipPath);
            });
            
            archive.on('error', reject);
            archive.pipe(output);
            
            this.addFilesToArchive(archive);
            archive.finalize();
        });
    }

    addFilesToArchive(archive) {
        const files = [
            'manifest.json',
            'popup.html',
            'report.html'
        ];
        
        const directories = [
            'js',
            'css',
            'images'
        ];
        
        files.forEach(file => {
            const filePath = path.join(this.distDir, file);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: file });
            }
        });
        
        directories.forEach(dir => {
            const dirPath = path.join(this.distDir, dir);
            if (fs.existsSync(dirPath)) {
                archive.directory(dirPath, dir);
            }
        });
    }

    async validatePackage() {
        console.log('🔍 Validating package contents...');
        
        const requiredFiles = [
            'manifest.json',
            'popup.html',
            'js/background.js',
            'js/content.js',
            'js/popup.js',
            'css/popup.css',
            'images/icon16.png',
            'images/icon48.png',
            'images/icon128.png'
        ];
        
        const missingFiles = [];
        
        for (const file of requiredFiles) {
            const filePath = path.join(this.distDir, file);
            if (!await fs.pathExists(filePath)) {
                missingFiles.push(file);
            }
        }
        
        if (missingFiles.length > 0) {
            console.error('❌ Missing required files:');
            missingFiles.forEach(file => console.error(`   - ${file}`));
            throw new Error('Package validation failed');
        }
        
        await this.validateManifest();
        console.log('✅ Package validation passed');
    }

    async validateManifest() {
        const manifestPath = path.join(this.distDir, 'manifest.json');
        const manifest = await fs.readJson(manifestPath);
        
        const requiredFields = ['name', 'version', 'manifest_version', 'action', 'permissions'];
        const missingFields = requiredFields.filter(field => !manifest[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Manifest missing required fields: ${missingFields.join(', ')}`);
        }
        
        if (manifest.manifest_version !== 3) {
            throw new Error('Manifest must use version 3');
        }
        
        if (!manifest.icons || !manifest.icons['16'] || !manifest.icons['48'] || !manifest.icons['128']) {
            throw new Error('Manifest must include icons for 16, 48, and 128 pixels');
        }
    }

    async createSourceZip() {
        console.log('📦 Creating source code package...');
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const zipName = `bee-detection-source-v${this.packageInfo.version}-${timestamp}.zip`;
        const zipPath = path.join(this.outputDir, zipName);
        
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            
            output.on('close', () => {
                console.log(`📁 Source archive size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
                resolve(zipPath);
            });
            
            archive.on('error', reject);
            archive.pipe(output);
            
            const sourceFiles = [
                'package.json',
                'build.js',
                'zip-extension.js',
                'manifest.json',
                '*.html',
                'js/**/*',
                'css/**/*',
                'images/**/*',
                'README.md'
            ];
            
            sourceFiles.forEach(pattern => {
                if (pattern.includes('*')) {
                    archive.glob(pattern, {
                        ignore: ['node_modules/**', 'dist/**', 'releases/**', '.git/**']
                    });
                } else if (fs.existsSync(pattern)) {
                    archive.file(pattern, { name: pattern });
                }
            });
            
            archive.finalize();
        });
    }

    async generateChecksums(zipPath) {
        const crypto = require('crypto');
        const fileBuffer = await fs.readFile(zipPath);
        
        const checksums = {
            md5: crypto.createHash('md5').update(fileBuffer).digest('hex'),
            sha256: crypto.createHash('sha256').update(fileBuffer).digest('hex')
        };
        
        const checksumPath = zipPath.replace('.zip', '.checksums.txt');
        const checksumContent = [
            `MD5: ${checksums.md5}`,
            `SHA256: ${checksums.sha256}`,
            `File: ${path.basename(zipPath)}`,
            `Size: ${fileBuffer.length} bytes`,
            `Generated: ${new Date().toISOString()}`
        ].join('\n');
        
        await fs.writeFile(checksumPath, checksumContent);
        console.log(`📋 Checksums saved to: ${checksumPath}`);
        
        return checksums;
    }
}

async function main() {
    try {
        const zipper = new ExtensionZipper();
        
        await zipper.validatePackage();
        
        const extensionZip = await zipper.createZip();
        await zipper.generateChecksums(extensionZip);
        
        if (process.argv.includes('--source')) {
            await zipper.createSourceZip();
        }
        
        console.log('🎉 Packaging completed successfully!');
        
    } catch (error) {
        console.error('❌ Packaging failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = ExtensionZipper;