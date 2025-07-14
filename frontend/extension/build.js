/* eslint-env node */



const fs = require('fs-extra');
const path = require('path');
const { minify } = require('terser');

class ExtensionBuilder {
    constructor() {
        this.srcDir = './';         // lucrezi din directorul extension/
        this.distDir = './dist';
        this.isDev = process.argv.includes('--dev');
        this.isWatching = process.argv.includes('--watch');
    }

    async build() {
        console.log('🔨 Starting BeeDetection build process...');
        await this.cleanDist();
        await this.createDirectories();
        await this.copyStaticFiles();
        await this.processJavaScript();
        await this.processCSS();
        await this.processHTML();
        await this.generateManifest();
        await this.createMissingAssets();
        console.log('✅ Build completed successfully!');

        if (this.isWatching) this.startWatcher();
    }

    async cleanDist() {
        console.log('🧹 Cleaning dist directory...');
        await fs.remove(this.distDir);
    }

    async createDirectories() {
        console.log('📁 Creating directories...');
        await fs.ensureDir(path.join(this.distDir, 'js'));
        await fs.ensureDir(path.join(this.distDir, 'js', 'platforms'));
        await fs.ensureDir(path.join(this.distDir, 'css'));
        await fs.ensureDir(path.join(this.distDir, 'images'));
    }

    async copyStaticFiles() {
        console.log('📋 Copying static files...');
        const staticFiles = [
            'popup.html',
            'report.html'
        ];
        for (const file of staticFiles) {
            if (await fs.pathExists(file)) {
                await fs.copy(file, path.join(this.distDir, file));
            }
        }
        // Copiem folderul images (cu icon.png)
        if (await fs.pathExists('images')) {
            await fs.copy('images', path.join(this.distDir, 'images'));
        }
    }

    async processJavaScript() {
        console.log('⚙️ Processing JavaScript files...');
        const jsFiles = [
            { src: 'background.js', dest: 'js/background.js' },
            { src: 'content.js', dest: 'js/content.js' },
            { src: 'content-universal.js', dest: 'js/content-universal.js' },
            { src: 'popup.js', dest: 'js/popup.js' },
            { src: 'report.js', dest: 'js/report.js' },
            { src: 'queue-manager.js', dest: 'js/queue-manager.js' },
            { src: 'image-processor.js', dest: 'js/image-processor.js' },
            { src: path.join('platforms', 'facebook.js'), dest: 'js/platforms/facebook.js' },
            { src: path.join('platforms', 'instagram.js'), dest: 'js/platforms/instagram.js' }
        ];

        for (const file of jsFiles) {
            if (await fs.pathExists(file.src)) {
                await this.processJSFile(file.src, file.dest);
            } else {
                console.warn(`⚠️ JS not found: ${file.src}`);
            }
        }
    }

    async processJSFile(srcPath, destPath) {
        const code = await fs.readFile(srcPath, 'utf8');
        const outFull = path.join(this.distDir, destPath);
        await fs.ensureDir(path.dirname(outFull));

        if (this.isDev) {
            await fs.writeFile(outFull, code);
        } else {
            try {
                const minified = await minify(code, {
                    compress: { drop_console: false, drop_debugger: true },
                    mangle: { reserved: ['chrome', 'window', 'document'] }
                });
                await fs.writeFile(outFull, minified.code);
            } catch (e) {
                console.warn(`⚠️ Minify failed ${srcPath}, copying original.`);
                await fs.writeFile(outFull, code);
            }
        }
    }

    async processCSS() {
        console.log('🎨 Processing CSS files...');
        const cssFiles = [
            { src: 'popup.css', dest: 'css/popup.css' },
            { src: 'report.css', dest: 'css/report.css' },
            { src: 'content.css', dest: 'css/content.css' }
        ];
        for (const file of cssFiles) {
            if (await fs.pathExists(file.src)) {
                let content = await fs.readFile(file.src, 'utf8');
                if (!this.isDev) {
                    content = content
                        .replace(/\s+/g, ' ')
                        .replace(/;\s*}/g, '}')
                        .replace(/{\s*/g, '{')
                        .replace(/;\s*/g, ';')
                        .trim();
                }
                await fs.writeFile(path.join(this.distDir, file.dest), content);
            } else {
                console.warn(`⚠️ CSS not found: ${file.src}`);
            }
        }
    }

    async processHTML() {
        console.log('📄 Processing HTML files...');
        const htmlFiles = ['popup.html', 'report.html'];
        for (const file of htmlFiles) {
            const p = path.join(this.distDir, file);
            if (await fs.pathExists(p)) {
                let content = await fs.readFile(p, 'utf8');
                if (!this.isDev) {
                    content = content.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
                }
                await fs.writeFile(p, content);
            }
        }
    }

    async generateManifest() {
        console.log('📋 Generating manifest...');
        const mfSrc = 'manifest.json';
        if (await fs.pathExists(mfSrc)) {
            const m = await fs.readJson(mfSrc);
            if (!this.isDev) {
                delete m.key;
                delete m.content_security_policy;
            }
            await fs.writeJson(path.join(this.distDir, 'manifest.json'), m, { spaces: 2 });
        }
    }

    async createMissingAssets() {
        console.log('🎨 Creating missing assets...');
        const imagesDir = path.join(this.distDir, 'images');
        await fs.ensureDir(imagesDir);
        for (const size of [16, 32, 48, 128]) {
            const png = path.join(imagesDir, `icon${size}.png`);
            if (!await fs.pathExists(png)) {
                // plasează acolo logo-ul tău — aici doar generăm un placeholder SVG
                const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="#1a73e8"/><text x="50%" y="50%" text-anchor="middle" dy="0.3em" fill="white" font-size="${size * 0.6}">🔍</text></svg>`;
                await fs.writeFile(png.replace('.png', '.svg'), svg);
            }
        }
    }

    startWatcher() {
        console.log('👀 Watching for changes...');
        const chokidar = require('chokidar');
        chokidar.watch(['*.js', '*.css', '*.html', 'manifest.json'], { ignoreInitial: true })
            .on('change', async f => {
                console.log(`🔄 Changed: ${f}`);
                try {
                    if (f.endsWith('.js')) await this.processJavaScript();
                    if (f.endsWith('.css')) await this.processCSS();
                    if (f.endsWith('.html')) await this.processHTML();
                    if (f === 'manifest.json') await this.generateManifest();
                    console.log('✅ Rebuild OK');
                } catch (err) {
                    console.error(`❌ Rebuild failed: ${err.message}`);
                }
            });
    }
}

(async () => {
    try {
        await new ExtensionBuilder().build();
    } catch (err) {
        console.error('❌ Build crashed:', err);
        process.exit(1);
    }
})();
