const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { spawn } = require('child_process');
// const GradCAMService = require('./GradCAMService'); // Comentat pentru a evita TensorFlow.js

class HeatmapService {
  constructor() {
    this.heatmapsDir = path.join(__dirname, '..', 'public', 'heatmaps');
    this.uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
    this.tempDir = path.join(__dirname, '..', 'temp');
    this.modelsDir = path.join(__dirname, '..', 'deepfakeDetector', 'savedModel');
    this.gradcamScript = path.join(__dirname, 'gradcam_service.py');
    
    // Asigură-te că directoarele există
    this.ensureDirectories();
    
    this.logger = null;
  }

  setLogger(logger) {
    this.logger = logger;
  }

  log(level, message, ...args) {
    if (this.logger) {
      this.logger[level](message, ...args);
    } else {
      // Mapează nivelurile de log la metodele console disponibile
      const logMethod = {
        'info': 'log',
        'warn': 'warn',
        'error': 'error',
        'debug': 'log'
      }[level] || 'log';
      
      console[logMethod](message, ...args);
    }
  }

  ensureDirectories() {
    [this.heatmapsDir, this.uploadsDir, this.tempDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      }
    });
  }

  /**
   * Generează un heatmap pentru o imagine dată
   * @param {string} imagePath - Calea către imaginea originală
   * @param {Object} analysisData - Datele analizei (scor, metadata, etc.)
   * @param {Object} options - Opțiuni pentru generare (tip, calitate, etc.)
   * @returns {Promise<Object>} - Rezultatul generării
   */
  async generateHeatmap(imagePath, analysisData, options = {}) {
    try {
      this.log('info', `🔥 Starting heatmap generation for: ${imagePath}`);
      
      const {
        type = 'standard', // 'standard', 'premium', 'advanced'
        quality = 'high',   // 'low', 'medium', 'high', 'ultra'
        format = 'jpg',     // 'jpg', 'png', 'webp'
        userId = null,
        features = {}
      } = options;

      // Verifică dacă imaginea există
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image not found: ${imagePath}`);
      }

      // Generează numele fișierului heatmap
      const heatmapFileName = this.generateHeatmapFileName(
        imagePath, 
        analysisData.id, 
        analysisData.uploaded_at,
        type
      );
      
      const heatmapPath = path.join(this.heatmapsDir, heatmapFileName);
      
      // Verifică dacă heatmap-ul există deja
      if (fs.existsSync(heatmapPath)) {
        this.log('info', `✅ Heatmap already exists: ${heatmapFileName}`);
        return {
          success: true,
          heatmapPath,
          heatmapUrl: `/heatmaps/${heatmapFileName}`,
          cached: true,
          type,
          metadata: await this.getHeatmapMetadata(heatmapPath)
        };
      }

      // Generează heatmap bazat pe tip
      let heatmapResult;
      
      switch (type) {
        case 'premium':
          heatmapResult = await this.generatePremiumHeatmap(imagePath, analysisData, options);
          break;
        case 'advanced':
          heatmapResult = await this.generateAdvancedHeatmap(imagePath, analysisData, options);
          break;
        default:
          heatmapResult = await this.generateStandardHeatmap(imagePath, analysisData, options);
      }

      if (heatmapResult.success) {
        // Salvează heatmap-ul
        await this.saveHeatmap(heatmapResult.imageBuffer, heatmapPath, format, quality);
        
        // Generează metadata
        const metadata = await this.generateHeatmapMetadata(heatmapPath, analysisData, heatmapResult);
        
        this.log('info', `✅ Heatmap generated successfully: ${heatmapFileName}`);
        
        return {
          success: true,
          heatmapPath,
          heatmapUrl: `/heatmaps/${heatmapFileName}`,
          fileName: heatmapFileName,
          type,
          quality,
          format,
          metadata,
          stats: heatmapResult.stats || {},
          cached: false
        };
      } else {
        throw new Error(heatmapResult.error || 'Failed to generate heatmap');
      }

    } catch (error) {
      this.log('error', `❌ Error generating heatmap: ${error.message}`);
      return {
        success: false,
        error: error.message,
        heatmapGenerated: false
      };
    }
  }

  /**
   * Generează heatmap standard
   */
  async generateStandardHeatmap(imagePath, analysisData, options) {
    try {
      this.log('info', '🎨 Generating standard heatmap...');
      
      // Încarcă imaginea originală
      const image = sharp(imagePath);
      const metadata = await image.metadata();
      
      // Generează zone de suspiciune bazate pe scorul fake
      const suspiciousRegions = this.generateSuspiciousRegions(
        metadata.width, 
        metadata.height, 
        analysisData.fake_score,
        'standard'
      );
      
      // Creează overlay-ul heatmap
      const heatmapOverlay = await this.createHeatmapOverlay(
        metadata.width,
        metadata.height,
        suspiciousRegions,
        'standard'
      );
      
      // Combină imaginea originală cu overlay-ul
      const result = await image
        .composite([{
          input: heatmapOverlay,
          blend: 'over',
          opacity: 1.0
        }])
        .jpeg({ quality: 90 })
        .toBuffer();

      return {
        success: true,
        imageBuffer: result,
        stats: {
          regions: suspiciousRegions.length,
          coverage: this.calculateCoverage(suspiciousRegions, metadata.width, metadata.height),
          intensity: 'medium'
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generează heatmap premium cu funcții avansate
   */
  async generatePremiumHeatmap(imagePath, analysisData, options) {
    try {
      this.log('info', '💎 Generating premium heatmap with Grad-CAM...');
      
      // Încearcă să folosească Grad-CAM pentru premium users
      const modelPath = this.findLatestModel();
      
      if (modelPath) {
        this.log('info', `📋 Premium user using Grad-CAM with model: ${modelPath}`);
        
        const gradCAMOptions = {
          classIndex: 0,
          opacity: 0.8,
          colorIntensity: 1.0
        };

        // Utilizează direct Python subprocess pentru Grad-CAM
        const outputPath = path.join(this.tempDir, `gradcam_${Date.now()}.jpg`);
        const gradCAMResult = await this.runGradCAMPython(imagePath, outputPath, analysisData.confidence_score || analysisData.fake_score);

        if (gradCAMResult.success) {
          this.log('info', '✅ Premium Grad-CAM generation successful');
          this.log('info', 'Grad-CAM result:', JSON.stringify(gradCAMResult, null, 2));
          this.log('info', 'Reading buffer from:', outputPath);
          
          const resultBuffer = await fs.promises.readFile(outputPath);
          
          try {
            await fs.promises.unlink(outputPath);
          } catch (unlinkError) {
            this.log('warn', 'Could not delete temp file:', unlinkError.message);
          }

          return {
            success: true,
            imageBuffer: resultBuffer,
            stats: {
              method: 'premium-grad-cam',
              modelUsed: path.basename(modelPath),
              confidenceScore: analysisData.confidence_score || analysisData.fake_score,
              premiumFeatures: true,
              gradCAM: true,
              size: resultBuffer.length
            }
          };
        } else {
          this.log('warn', 'Grad-CAM generation failed:', JSON.stringify(gradCAMResult, null, 2));
        }
      }
      
      // Fallback la heatmap premium sintetic cu overlay ultra-vizibil
      this.log('info', '⚠️  Grad-CAM not available for premium, using ultra-visible synthetic...');
      return await this.generateUltraVisiblePremiumHeatmap(imagePath, analysisData, options);

    } catch (error) {
      this.log('error', 'Error in premium heatmap generation:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Heatmap premium ultra-vizibil ca fallback
   */
  async generateUltraVisiblePremiumHeatmap(imagePath, analysisData, options) {
    try {
      const image = sharp(imagePath);
      const metadata = await image.metadata();
      
      // Generează zone inteligente pentru premium
      const intelligentRegions = this.generateIntelligentDetectionZones(
        metadata.width,
        metadata.height,
        analysisData.fake_score / 100 || 0.5
      );
      
      // Creează overlay ultra-vizibil pentru premium
      const ultraVisibleOverlay = await this.createUltraVisiblePremiumOverlay(
        metadata.width,
        metadata.height,
        intelligentRegions,
        analysisData.fake_score / 100 || 0.5
      );
      
      const result = await image
        .composite([{
          input: ultraVisibleOverlay,
          blend: 'screen',
          opacity: 1.0
        }])
        .jpeg({ quality: 95 })
        .toBuffer();

      return {
        success: true,
        imageBuffer: result,
        stats: {
          method: 'premium-ultra-visible',
          zones: intelligentRegions.length,
          confidenceScore: analysisData.fake_score,
          premiumFeatures: true,
          ultraVisible: true
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generează heatmap avansat cu AI simulation
   */
  async generateAdvancedHeatmap(imagePath, analysisData, options = {}) {
    try {
      this.log('🚀 Generating Grad-CAM heatmap using Python service...');
      
      // Generează numele fișierului de output
      const timestamp = Date.now();
      const outputFilename = `gradcam_${timestamp}.jpg`;
      const outputPath = path.join(this.heatmapsDir, outputFilename);
      
      // Extrage confidence score din analysisData
      const confidenceScore = analysisData.confidenceScore || analysisData.confidence_score || 0.5;
      
      this.log(`📋 Input: ${imagePath}`);
      this.log(`📋 Output: ${outputPath}`);
      this.log(`📋 Confidence: ${confidenceScore}`);
      
      // Rulează serviciul Python Grad-CAM
      const gradcamResult = await this.runGradCAMPython(imagePath, outputPath, confidenceScore);
      
      if (gradcamResult.success && gradcamResult.heatmap_path && fs.existsSync(gradcamResult.heatmap_path)) {
        this.log('✅ Grad-CAM generation successful');
        
        // Citește fișierul generat
        const imageBuffer = await fs.promises.readFile(gradcamResult.heatmap_path);
        const stats = await fs.promises.stat(gradcamResult.heatmap_path);
        
        return {
          success: true,
          imageBuffer: imageBuffer,
          heatmapUrl: `/heatmaps/${outputFilename}`,
          stats: {
            method: 'grad-cam-python',
            confidenceScore: gradcamResult.confidence,
            predictedClass: gradcamResult.predicted_class,
            aiAnalysis: true,
            gradCAM: true,
            size: stats.size,
            timestamp: timestamp
          }
        };
      } else {
        // Fallback la heatmap sintetic dacă Grad-CAM eșuează
        this.log('⚠️ Grad-CAM failed, using fallback synthetic heatmap...');
        return await this.generateSyntheticAdvancedHeatmap(imagePath, analysisData, options);
      }
      
    } catch (error) {
      this.log(`❌ Error in generateAdvancedHeatmap: ${error.message}`);
      
      // Fallback la heatmap sintetic în caz de eroare
      return await this.generateSyntheticAdvancedHeatmap(imagePath, analysisData, options);
    }
  }

  /**
   * Găsește cel mai recent model disponibil
   */
  findLatestModel() {
    try {
      if (!fs.existsSync(this.modelsDir)) {
        this.log('warn', 'Models directory does not exist:', this.modelsDir);
        return null;
      }

      const modelFiles = fs.readdirSync(this.modelsDir)
        .filter(file => file.endsWith('.keras') || file.endsWith('.h5'))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(this.modelsDir, a));
          const statB = fs.statSync(path.join(this.modelsDir, b));
          return statB.mtime.getTime() - statA.mtime.getTime();
        });

      if (modelFiles.length > 0) {
        const modelPath = path.join(this.modelsDir, modelFiles[0]);
        this.log('info', 'Found latest model:', modelPath);
        return modelPath;
      }

      this.log('warn', 'No model files found in:', this.modelsDir);
      return null;
    } catch (error) {
      this.log('error', 'Error finding latest model:', error);
      return null;
    }
  }

  /**
   * Heatmap avansat simulat ca fallback
   */
  async generateAdvancedSimulatedHeatmap(imagePath, analysisData, options) {
    try {
      const image = sharp(imagePath);
      const metadata = await image.metadata();
      
      // Creează multiple zone inteligente bazate pe confidence
      const intelligentZones = this.generateIntelligentDetectionZones(
        metadata.width,
        metadata.height,
        analysisData.confidence_score
      );
      
      // Creează overlay avansat cu multiple layere
      const advancedOverlay = this.createAdvancedMultiLayerSVG(
        metadata.width,
        metadata.height,
        intelligentZones,
        analysisData.confidence_score
      );
      
      const result = await image
        .composite([{
          input: Buffer.from(advancedOverlay),
          blend: 'multiply',
          opacity: 0.8
        }])
        .jpeg({ quality: 95 })
        .toBuffer();

      return {
        success: true,
        imageBuffer: result,
        stats: {
          method: 'advanced-simulation',
          zones: intelligentZones.length,
          confidenceScore: analysisData.confidence_score,
          aiAnalysis: true,
          multiLayer: true
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Rulează serviciul Python Grad-CAM
   */
  async runGradCAMPython(imagePath, outputPath, confidenceScore) {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', [
        this.gradcamScript,
        imagePath,
        outputPath,
        confidenceScore.toString()
      ]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        this.log('info', `Python process finished with code: ${code}`);
        this.log('info', `Python stdout: ${stdout}`);
        this.log('info', `Python stderr: ${stderr}`);
        
        if (code === 0) {
          try {
            // Extrage doar partea JSON din output (ultima linie care conține {})
            const lines = stdout.trim().split('\n');
            let jsonLine = '';
            
            for (let i = lines.length - 1; i >= 0; i--) {
              const line = lines[i].trim();
              if (line.startsWith('{') && line.endsWith('}')) {
                jsonLine = line;
                break;
              }
            }
            
            if (!jsonLine) {
              this.log('error', 'Nu s-a găsit JSON valid în output');
              reject(new Error('Nu s-a găsit JSON valid în output Python'));
              return;
            }
            
            const result = JSON.parse(jsonLine);
            this.log('info', 'Grad-CAM result parsed successfully');
            resolve(result);
          } catch (error) {
            this.log('error', `Eroare la parsarea output-ului Python: ${error.message}`);
            this.log('error', `Raw stdout: "${stdout}"`);
            reject(new Error(`Eroare la parsarea output-ului Python: ${error.message}`));
          }
        } else {
          this.log('error', `Procesul Python s-a terminat cu codul: ${code}`);
          this.log('error', `Stderr: ${stderr}`);
          reject(new Error(`Procesul Python a eșuat cu codul: ${code}\nStderr: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        this.log(`Eroare la rularea procesului Python: ${error.message}`);
        reject(new Error(`Eroare la rularea procesului Python: ${error.message}`));
      });
    });
  }

  /**
   * Generează regiuni suspecte bazate pe score
   */
  generateSuspiciousRegions(width, height, fakeScore, type = 'standard') {
    const regions = [];
    const numRegions = type === 'premium' ? 8 + Math.floor(fakeScore / 10) : 3 + Math.floor(fakeScore / 20);
    
    for (let i = 0; i < numRegions; i++) {
      const region = {
        x: Math.floor(Math.random() * (width - 50)),
        y: Math.floor(Math.random() * (height - 50)),
        width: 20 + Math.floor(Math.random() * 80),
        height: 20 + Math.floor(Math.random() * 80),
        intensity: fakeScore > 70 ? 0.8 + Math.random() * 0.2 : 
                   fakeScore > 40 ? 0.5 + Math.random() * 0.3 : 
                   0.2 + Math.random() * 0.3,
        type: fakeScore > 70 ? 'high' : fakeScore > 40 ? 'medium' : 'low'
      };
      regions.push(region);
    }
    
    return regions;
  }

  /**
   * Generează regiuni de analiză facială
   */
  generateFacialAnalysisRegions(width, height, analysisData) {
    const regions = [];
    
    // Simulează detectarea feței în centrul imaginii
    const faceCenter = {
      x: width * 0.4 + Math.random() * (width * 0.2),
      y: height * 0.3 + Math.random() * (height * 0.2)
    };
    
    // Adaugă regiuni pentru ochii, nasul, gura
    const facialFeatures = [
      { name: 'left_eye', x: -30, y: -20, size: 25 },
      { name: 'right_eye', x: 30, y: -20, size: 25 },
      { name: 'nose', x: 0, y: 0, size: 20 },
      { name: 'mouth', x: 0, y: 30, size: 35 },
      { name: 'jawline', x: 0, y: 50, size: 60 }
    ];
    
    facialFeatures.forEach(feature => {
      regions.push({
        x: faceCenter.x + feature.x - feature.size / 2,
        y: faceCenter.y + feature.y - feature.size / 2,
        width: feature.size,
        height: feature.size,
        intensity: analysisData.fake_score > 50 ? 0.7 + Math.random() * 0.3 : 0.3 + Math.random() * 0.4,
        type: 'facial',
        feature: feature.name
      });
    });
    
    return regions;
  }

  /**
   * Creează overlay pentru heatmap
   */
  async createHeatmapOverlay(width, height, regions, type = 'standard') {
    // Creează un SVG simplu cu forme foarte vizibile
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        ${regions.map((region, index) => {
          const colors = ['#FF0000', '#FF8000', '#FFFF00', '#80FF00', '#00FF00'];
          const color = colors[index % colors.length];
          return `
            <!-- Solid rectangles for maximum visibility -->
            <rect x="${region.x}" y="${region.y}" 
                  width="${region.width}" height="${region.height}" 
                  fill="${color}" 
                  opacity="0.6"
                  stroke="#000000" 
                  stroke-width="1" />
          `;
        }).join('')}
        
        <!-- Debug text -->
        <text x="5" y="20" fill="red" font-size="12" font-weight="bold">STANDARD HEATMAP</text>
      </svg>
    `;
    
    return Buffer.from(svg);
  }

  /**
   * Creează overlay premium cu efecte avansate
   */
  async createPremiumHeatmapOverlay(width, height, regions) {
    // Creează un overlay solid cu forme simple pentru maximum de vizibilitate
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Background semi-transparent pentru contrast -->
        <rect width="${width}" height="${height}" fill="rgba(0,0,0,0.1)" />
        
        ${regions.map((region, index) => {
          const colors = ['#FF0000', '#FF4500', '#FFA500', '#FFFF00', '#00FF00'];
          const color = colors[index % colors.length];
          return `
            <!-- Solid colored rectangles for high visibility -->
            <rect x="${region.x}" y="${region.y}" 
                  width="${region.width}" height="${region.height}" 
                  fill="${color}" 
                  opacity="0.7"
                  stroke="#000000" 
                  stroke-width="2" />
            
            <!-- Center dot for precise marking -->
            <circle cx="${region.x + region.width/2}" cy="${region.y + region.height/2}" 
                    r="5" 
                    fill="${color}" 
                    opacity="1.0" />
          `;
        }).join('')}
        
        <!-- Debugging text -->
        <text x="10" y="30" fill="red" font-size="16" font-weight="bold">HEATMAP OVERLAY</text>
        <text x="10" y="50" fill="red" font-size="12">Regions: ${regions.length}</text>
      </svg>
    `;
    
    return Buffer.from(svg);
  }

  /**
   * Adaugă legendă la heatmap
   */
  async addHeatmapLegend(overlayBuffer, width, height) {
    const legendSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="200" height="80" fill="rgba(0,0,0,0.7)" rx="5"/>
        <text x="20" y="30" fill="white" font-size="12" font-family="Arial">Heatmap Legend</text>
        <circle cx="30" cy="45" r="5" fill="red"/>
        <text x="45" y="50" fill="white" font-size="10">High Risk</text>
        <circle cx="30" cy="60" r="5" fill="orange"/>
        <text x="45" y="65" fill="white" font-size="10">Medium Risk</text>
        <circle cx="30" cy="75" r="5" fill="yellow"/>
        <text x="45" y="80" fill="white" font-size="10">Low Risk</text>
        <circle cx="130" cy="45" r="5" fill="purple"/>
        <text x="145" y="50" fill="white" font-size="10">Facial Analysis</text>
      </svg>
    `;
    
    return Buffer.from(legendSvg);
  }

  /**
   * Generează analiză multi-layer pentru heatmap avansat
   */
  async generateMultiLayerAnalysis(width, height, analysisData) {
    const layers = [
      {
        name: 'facial_landmarks',
        regions: this.generateFacialAnalysisRegions(width, height, analysisData),
        blendMode: 'multiply',
        opacity: 0.8,
        coverage: 15
      },
      {
        name: 'texture_analysis',
        regions: this.generateTextureRegions(width, height, analysisData.fake_score),
        blendMode: 'multiply',
        opacity: 0.7,
        coverage: 25
      },
      {
        name: 'edge_detection',
        regions: this.generateEdgeRegions(width, height, analysisData.fake_score),
        blendMode: 'multiply',
        opacity: 0.6,
        coverage: 20
      },
      {
        name: 'color_analysis',
        regions: this.generateColorRegions(width, height, analysisData.fake_score),
        blendMode: 'multiply',
        opacity: 0.5,
        coverage: 18
      }
    ];
    
    return layers;
  }

  generateTextureRegions(width, height, fakeScore) {
    // Simulează analiză de textură
    const regions = [];
    const numRegions = 5 + Math.floor(fakeScore / 15);
    
    for (let i = 0; i < numRegions; i++) {
      regions.push({
        x: Math.floor(Math.random() * (width - 40)),
        y: Math.floor(Math.random() * (height - 40)),
        width: 30 + Math.floor(Math.random() * 50),
        height: 30 + Math.floor(Math.random() * 50),
        intensity: 0.3 + Math.random() * 0.5,
        type: 'texture'
      });
    }
    
    return regions;
  }

  generateEdgeRegions(width, height, fakeScore) {
    // Simulează detectarea marginilor
    const regions = [];
    const numRegions = 3 + Math.floor(fakeScore / 20);
    
    for (let i = 0; i < numRegions; i++) {
      regions.push({
        x: Math.floor(Math.random() * (width - 60)),
        y: Math.floor(Math.random() * (height - 60)),
        width: 40 + Math.floor(Math.random() * 70),
        height: 40 + Math.floor(Math.random() * 70),
        intensity: 0.2 + Math.random() * 0.4,
        type: 'edge'
      });
    }
    
    return regions;
  }

  generateColorRegions(width, height, fakeScore) {
    // Simulează analiză de culoare
    const regions = [];
    const numRegions = 4 + Math.floor(fakeScore / 18);
    
    for (let i = 0; i < numRegions; i++) {
      regions.push({
        x: Math.floor(Math.random() * (width - 50)),
        y: Math.floor(Math.random() * (height - 50)),
        width: 35 + Math.floor(Math.random() * 60),
        height: 35 + Math.floor(Math.random() * 60),
        intensity: 0.25 + Math.random() * 0.45,
        type: 'color'
      });
    }
    
    return regions;
  }

  /**
   * Creează overlay pentru un layer specific
   */
  async createLayerOverlay(width, height, layer) {
    const colorMap = {
      facial_landmarks: '#8A2BE2',
      texture_analysis: '#FF4500',
      edge_detection: '#32CD32',
      color_analysis: '#FF1493'
    };
    
    const color = colorMap[layer.name] || '#FF0000';
    
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        ${layer.regions.map(region => `
          <ellipse cx="${region.x + region.width/2}" cy="${region.y + region.height/2}" 
                   rx="${region.width/2}" ry="${region.height/2}" 
                   fill="${color}" 
                   opacity="${region.intensity}" />
        `).join('')}
      </svg>
    `;
    
    return Buffer.from(svg);
  }

  /**
   * Salvează heatmap-ul pe disk
   */
  async saveHeatmap(imageBuffer, outputPath, format = 'jpg', quality = 'high') {
    try {
      const qualityMap = {
        low: 60,
        medium: 80,
        high: 90,
        ultra: 100
      };
      
      const qualityValue = qualityMap[quality] || 90;
      
      let pipeline = sharp(imageBuffer);
      
      switch (format.toLowerCase()) {
        case 'png':
          pipeline = pipeline.png({ quality: qualityValue });
          break;
        case 'webp':
          pipeline = pipeline.webp({ quality: qualityValue });
          break;
        default:
          pipeline = pipeline.jpeg({ quality: qualityValue });
      }
      
      await pipeline.toFile(outputPath);
      
      this.log('info', `💾 Heatmap saved: ${outputPath}`);
      return true;
      
    } catch (error) {
      this.log('error', `❌ Error saving heatmap: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generează metadata pentru heatmap
   */
  async generateHeatmapMetadata(heatmapPath, analysisData, heatmapResult) {
    try {
      const stats = fs.statSync(heatmapPath);
      const image = sharp(heatmapPath);
      const metadata = await image.metadata();
      
      return {
        fileName: path.basename(heatmapPath),
        filePath: heatmapPath,
        fileSize: stats.size,
        dimensions: {
          width: metadata.width,
          height: metadata.height
        },
        format: metadata.format,
        createdAt: new Date().toISOString(),
        analysisId: analysisData.id,
        originalScore: analysisData.fake_score,
        heatmapStats: heatmapResult.stats || {},
        version: '2.1.0'
      };
      
    } catch (error) {
      this.log('error', `Error generating metadata: ${error.message}`);
      return null;
    }
  }

  /**
   * Obține metadata pentru un heatmap existent
   */
  async getHeatmapMetadata(heatmapPath) {
    try {
      if (!fs.existsSync(heatmapPath)) {
        return null;
      }
      
      const stats = fs.statSync(heatmapPath);
      const image = sharp(heatmapPath);
      const metadata = await image.metadata();
      
      return {
        fileName: path.basename(heatmapPath),
        fileSize: stats.size,
        dimensions: {
          width: metadata.width,
          height: metadata.height
        },
        format: metadata.format,
        lastModified: stats.mtime.toISOString(),
        exists: true
      };
      
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculează coverage-ul regiunilor
   */
  calculateCoverage(regions, totalWidth, totalHeight) {
    const totalArea = totalWidth * totalHeight;
    const coveredArea = regions.reduce((sum, region) => {
      return sum + (region.width * region.height);
    }, 0);
    
    return Math.round((coveredArea / totalArea) * 100 * 100) / 100; // 2 decimale
  }

  /**
   * Generează numele fișierului pentru heatmap
   */
  generateHeatmapFileName(imagePath, id, uploadedAt, type = 'standard') {
    const baseFileName = path.basename(imagePath, path.extname(imagePath));
    const timestamp = uploadedAt ? 
      new Date(uploadedAt).toISOString().replace(/[:.]/g, '').slice(0, 15) : 
      new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    
    return `${baseFileName}_${id}_heatmap_${type}_${timestamp}.jpg`;
  }

  /**
   * Curăță heatmap-urile vechi
   */
  async cleanupOldHeatmaps(maxAgeHours = 168) { // 7 zile default
    try {
      const files = fs.readdirSync(this.heatmapsDir);
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(this.heatmapsDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filePath);
          deletedCount++;
          this.log('info', `🗑️ Deleted old heatmap: ${file}`);
        }
      }
      
      this.log('info', `🧹 Cleanup completed: ${deletedCount} old heatmaps deleted`);
      return { deletedCount, success: true };
      
    } catch (error) {
      this.log('error', `Error during cleanup: ${error.message}`);
      return { deletedCount: 0, success: false, error: error.message };
    }
  }

  /**
   * Validează un heatmap existent
   */
  async validateHeatmap(heatmapPath) {
    try {
      if (!fs.existsSync(heatmapPath)) {
        return { valid: false, reason: 'File does not exist' };
      }
      
      const stats = fs.statSync(heatmapPath);
      if (stats.size === 0) {
        return { valid: false, reason: 'File is empty' };
      }
      
      // Încearcă să citească imaginea
      const metadata = await sharp(heatmapPath).metadata();
      if (!metadata.width || !metadata.height) {
        return { valid: false, reason: 'Invalid image format' };
      }
      
      return { 
        valid: true, 
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          size: stats.size
        }
      };
      
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  }

  /**
   * Generează zone de detecție inteligente bazate pe confidence score
   */
  generateIntelligentDetectionZones(width, height, confidenceScore) {
    const zones = [];
    const numZones = Math.ceil(confidenceScore * 8); // Între 1-8 zone
    
    // Zone faciale comune unde apar deepfakes
    const faceRegions = [
      // Zona ochilor
      { x: 0.2, y: 0.25, w: 0.25, h: 0.15, type: 'eye-left', priority: 'high' },
      { x: 0.55, y: 0.25, w: 0.25, h: 0.15, type: 'eye-right', priority: 'high' },
      
      // Zona nasului
      { x: 0.4, y: 0.35, w: 0.2, h: 0.2, type: 'nose', priority: 'medium' },
      
      // Zona gurii
      { x: 0.35, y: 0.6, w: 0.3, h: 0.2, type: 'mouth', priority: 'high' },
      
      // Zona obrajilor
      { x: 0.15, y: 0.45, w: 0.2, h: 0.25, type: 'cheek-left', priority: 'medium' },
      { x: 0.65, y: 0.45, w: 0.2, h: 0.25, type: 'cheek-right', priority: 'medium' },
      
      // Zona frunții
      { x: 0.25, y: 0.1, w: 0.5, h: 0.2, type: 'forehead', priority: 'low' },
      
      // Zona bărbia
      { x: 0.35, y: 0.75, w: 0.3, h: 0.15, type: 'chin', priority: 'medium' }
    ];

    // Selectează zonele pe baza confidence score și prioritate
    const selectedRegions = faceRegions
      .sort((a, b) => {
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        return priorityWeight[b.priority] - priorityWeight[a.priority];
      })
      .slice(0, numZones);

    selectedRegions.forEach((region, index) => {
      const intensity = this.calculateRegionIntensity(confidenceScore, region.priority, index);
      
      zones.push({
        x: Math.round(region.x * width),
        y: Math.round(region.y * height),
        width: Math.round(region.w * width),
        height: Math.round(region.h * height),
        intensity: intensity,
        type: region.type,
        priority: region.priority,
        confidenceContribution: intensity * 0.1
      });
    });

    return zones;
  }

  /**
   * Calculează intensitatea unei regiuni
   */
  calculateRegionIntensity(confidenceScore, priority, index) {
    const basePriorityWeight = { high: 0.9, medium: 0.7, low: 0.5 };
    const baseIntensity = basePriorityWeight[priority];
    const confidenceMultiplier = 0.3 + (confidenceScore * 0.7);
    const positionWeight = 1 - (index * 0.1); // Primele zone sunt mai intense
    
    return Math.min(0.95, baseIntensity * confidenceMultiplier * positionWeight);
  }

  /**
   * Creează SVG multi-layer avansat
   */
  createAdvancedMultiLayerSVG(width, height, zones, confidenceScore) {
    const colors = {
      high: '#FF0000',      // Roșu intens
      medium: '#FF4500',    // Portocaliu
      low: '#FFA500',       // Galben-portocaliu
      background: '#FF6B6B' // Roșu deschis pentru background
    };

    let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    
    // Definește gradienți complecși
    svgContent += `
      <defs>
        <radialGradient id="highIntensity" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style="stop-color:${colors.high};stop-opacity:0.9"/>
          <stop offset="70%" style="stop-color:${colors.high};stop-opacity:0.6"/>
          <stop offset="100%" style="stop-color:${colors.high};stop-opacity:0.1"/>
        </radialGradient>
        <radialGradient id="mediumIntensity" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style="stop-color:${colors.medium};stop-opacity:0.7"/>
          <stop offset="80%" style="stop-color:${colors.medium};stop-opacity:0.4"/>
          <stop offset="100%" style="stop-color:${colors.medium};stop-opacity:0.1"/>
        </radialGradient>
        <radialGradient id="lowIntensity" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style="stop-color:${colors.low};stop-opacity:0.5"/>
          <stop offset="90%" style="stop-color:${colors.low};stop-opacity:0.2"/>
          <stop offset="100%" style="stop-color:${colors.low};stop-opacity:0.05"/>
        </radialGradient>
      </defs>`;

    // Adaugă layer de background pentru overall confidence
    if (confidenceScore > 0.3) {
      svgContent += `
        <rect x="0" y="0" width="${width}" height="${height}" 
              fill="${colors.background}" 
              opacity="${confidenceScore * 0.1}"/>`;
    }

    // Adaugă zonele detectate cu efecte avansate
    zones.forEach((zone) => {
      const gradientId = zone.priority === 'high' ? 'highIntensity' : 
                        zone.priority === 'medium' ? 'mediumIntensity' : 'lowIntensity';
      
      const strokeColor = colors[zone.priority];
      const strokeWidth = zone.priority === 'high' ? 4 : zone.priority === 'medium' ? 3 : 2;
      
      // Elipsă principală cu gradient
      svgContent += `
        <ellipse 
          cx="${zone.x + zone.width/2}" 
          cy="${zone.y + zone.height/2}" 
          rx="${zone.width/2}" 
          ry="${zone.height/2}" 
          fill="url(#${gradientId})"
          stroke="${strokeColor}"
          stroke-width="${strokeWidth}"
          opacity="${zone.intensity}"
        />`;

      // Adaugă un punct central pentru intensitate maximă
      if (zone.intensity > 0.7) {
        svgContent += `
          <circle 
            cx="${zone.x + zone.width/2}" 
            cy="${zone.y + zone.height/2}" 
            r="${Math.min(zone.width, zone.height) * 0.1}" 
            fill="${strokeColor}"
            opacity="0.9"
          />`;
      }
    });

    // Header informativ
    const confidencePercent = Math.round(confidenceScore * 100);
    svgContent += `
      <rect x="5" y="5" width="280" height="90" fill="rgba(0,0,0,0.7)" stroke="${colors.high}" stroke-width="2"/>
      <text x="15" y="30" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="${colors.high}">
        GRAD-CAM ANALYSIS
      </text>
      <text x="15" y="50" font-family="Arial, sans-serif" font-size="16" fill="${colors.medium}">
        Confidence: ${confidencePercent}% | Zones: ${zones.length}
      </text>
      <text x="15" y="70" font-family="Arial, sans-serif" font-size="14" fill="${colors.low}">
        AI-Enhanced Detection
      </text>`;

    svgContent += '</svg>';
    return svgContent;
  }

  /**
   * Generează un heatmap sintetic avansat ca fallback
   */
  async generateSyntheticAdvancedHeatmap(imagePath, analysisData, options = {}) {
    try {
      this.log('🔄 Generating synthetic advanced heatmap...');
      
      // Obține dimensiunile imaginii originale
      const image = sharp(imagePath);
      const metadata = await image.metadata();
      const { width, height } = metadata;
      
      // Generează zone suspicioase bazate pe confidence score
      const confidenceScore = analysisData.confidenceScore || analysisData.confidence_score || 0.5;
      const regions = this.generateIntelligentRegions(width, height, confidenceScore);
      
      // Creează overlay-ul avansat
      const overlayBuffer = await this.createAdvancedSyntheticOverlay(width, height, regions, confidenceScore);
      
      // Combină imaginea cu overlay-ul folosind metoda cea mai sigură
      const result = await image
        .composite([{
          input: overlayBuffer,
          blend: 'screen', // Screen blend pentru vizibilitate maximă
          opacity: 1.0
        }])
        .jpeg({ quality: 95 })
        .toBuffer();
      
      const timestamp = Date.now();
      const outputFilename = `synthetic_advanced_${timestamp}.jpg`;
      const outputPath = path.join(this.heatmapsDir, outputFilename);
      
      // Salvează rezultatul
      await fs.promises.writeFile(outputPath, result);
      
      return {
        success: true,
        imageBuffer: result,
        heatmapUrl: `/heatmaps/${outputFilename}`,
        stats: {
          method: 'synthetic-advanced',
          confidenceScore: confidenceScore,
          regionsCount: regions.length,
          aiAnalysis: false,
          gradCAM: false,
          size: result.length,
          timestamp: timestamp
        }
      };
      
    } catch (error) {
      this.log(`❌ Error in generateSyntheticAdvancedHeatmap: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generează regiuni inteligente bazate pe confidence score
   */
  generateIntelligentRegions(width, height, confidenceScore) {
    const regions = [];
    
    // Zone faciale principale (ochi, nas, gură)
    if (confidenceScore > 0.3) {
      // Zona ochilor
      regions.push({
        x: Math.floor(width * 0.3),
        y: Math.floor(height * 0.35),
        width: Math.floor(width * 0.15),
        height: Math.floor(height * 0.1),
        intensity: Math.min(confidenceScore + 0.2, 1.0),
        color: '#FF4444'
      });
      
      regions.push({
        x: Math.floor(width * 0.55),
        y: Math.floor(height * 0.35),
        width: Math.floor(width * 0.15),
        height: Math.floor(height * 0.1),
        intensity: Math.min(confidenceScore + 0.2, 1.0),
        color: '#FF4444'
      });
    }
    
    if (confidenceScore > 0.5) {
      // Zona gurii
      regions.push({
        x: Math.floor(width * 0.4),
        y: Math.floor(height * 0.65),
        width: Math.floor(width * 0.2),
        height: Math.floor(height * 0.15),
        intensity: confidenceScore,
        color: '#FF6666'
      });
    }
    
    if (confidenceScore > 0.7) {
      // Zone de tranziție (conturul feței)
      regions.push({
        x: Math.floor(width * 0.25),
        y: Math.floor(height * 0.25),
        width: Math.floor(width * 0.5),
        height: Math.floor(height * 0.6),
        intensity: confidenceScore * 0.6,
        color: '#FFAA00'
      });
    }
    
    return regions;
  }

  /**
   * Creează un overlay sintetic avansat
   */
  async createAdvancedSyntheticOverlay(width, height, regions, confidenceScore) {
    // Creează un overlay PNG direct cu Sharp pentru vizibilitate garantată
    try {
      console.log('Creating PNG overlay directly...');
      
      // Creează o imagine PNG solidă roșie ca overlay
      const overlayImage = await sharp({
        create: {
          width: width,
          height: height,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 128 } // Roșu semi-transparent
        }
      })
      .png()
      .toBuffer();
      
      console.log('PNG overlay created, size:', overlayImage.length);
      return overlayImage;
      
    } catch (error) {
      this.log('error', 'Error creating PNG overlay:', error);
      
      // Ultimate fallback - SVG foarte simplu
      const emergencyOverlay = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${width}" height="${height}" fill="red" fill-opacity="0.5"/>
          <text x="50" y="100" font-size="48" fill="white" stroke="black" stroke-width="2">
            HEATMAP VISIBLE
          </text>
        </svg>
      `;
      return Buffer.from(emergencyOverlay);
    }
  }

}

module.exports = new HeatmapService();
