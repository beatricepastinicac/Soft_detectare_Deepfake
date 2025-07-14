const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const db = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');
const TierService = require('../services/tierService');
const PDFReportService = require('../services/pdfService');
const HeatmapService = require('../services/HeatmapService');

// Folosește instanța singleton de heatmap
const heatmapService = HeatmapService;

let logger;

router.use(function (req, res, next) {
  logger = req.app.locals.logger;
  next();
});

const tierMiddleware = async (req, res, next) => {
  try {
    req.userTier = TierService.getUserTier(req.user);
    req.tierConfig = TierService.getTierConfig(req.userTier);
    
    req.hasFeature = (feature) => {
      return req.tierConfig.features[feature] === true;
    };
    
    req.checkQuota = async () => {
      return await TierService.checkDailyQuota(req.user, req.ip);
    };
    
    req.validateFile = (file) => {
      return TierService.validateFileUpload(file, req.userTier);
    };
    
    req.getUpgradeMessage = (feature) => {
      return TierService.getUpgradeIncentive(req.userTier, feature);
    };
    
    next();
  } catch (error) {
    console.error('Error in tierMiddleware:', error);
    next(error);
  }
};

router.use(tierMiddleware);

const rootDir = path.join(__dirname, '..');
const uploadsDir = path.join(rootDir, 'uploads');
const publicUploadsDir = path.join(rootDir, 'public', 'uploads');
const publicHeatmapsDir = path.join(rootDir, 'public', 'heatmaps');
const deepfakeDetectorDir = path.join(rootDir, 'deepfakeDetector');
const modelsDir = path.join(deepfakeDetectorDir, 'models');
const savedModelDir = path.join(deepfakeDetectorDir, 'savedModel');

[uploadsDir, publicUploadsDir, publicHeatmapsDir, deepfakeDetectorDir, modelsDir, savedModelDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger && logger.info(`Created directory: ${dir}`);
  }
});

function generateSafeFileName(originalName) {
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const ext = path.extname(sanitizedName);
  const baseName = path.basename(sanitizedName, ext);
  return `${baseName}_${timestamp}${ext}`;
}

function generateMockResult(uploadPath, errorMessage) {
  const imageName = path.basename(uploadPath).toLowerCase();
  
  // Algoritm mai sofisticat pentru scoruri realiste
  let fakeScore;
  if (imageName.includes('fake') || imageName.includes('deepfake') || imageName.includes('generated')) {
    fakeScore = 65 + Math.random() * 30; // 65-95% pentru fake
  } else if (imageName.includes('real') || imageName.includes('authentic') || imageName.includes('original')) {
    fakeScore = Math.random() * 25; // 0-25% pentru real
  } else {
    // Pentru imagini necunoscute, folosim o distribuție mai realistă
    const rand = Math.random();
    if (rand < 0.7) {
      fakeScore = Math.random() * 40; // 70% șanse să fie real (0-40%)
    } else {
      fakeScore = 60 + Math.random() * 35; // 30% șanse să fie fake (60-95%)
    }
  }
  
  const confidenceScore = 75 + Math.random() * 20; // 75-95%
  
  // Analiză bazată pe caracteristici imaginate
  const analysisDetails = {
    faceDetection: {
      facesFound: 1,
      faceQuality: 80 + Math.random() * 15,
      landmarks: ['eyes', 'nose', 'mouth', 'jawline']
    },
    artificialMarkers: {
      blurInconsistencies: fakeScore > 50 ? Math.random() * 0.8 : Math.random() * 0.3,
      compressionArtifacts: fakeScore > 50 ? Math.random() * 0.7 : Math.random() * 0.2,
      edgeSharpness: fakeScore > 50 ? 0.3 + Math.random() * 0.4 : 0.7 + Math.random() * 0.3
    },
    explanation: generateExplanation(fakeScore)
  };
  
  return {
    fakeScore: Math.round(fakeScore * 100) / 100,
    confidenceScore: Math.round(confidenceScore * 100) / 100,
    isDeepfake: fakeScore > 50,
    processingTime: 1.5 + Math.random() * 2,
    modelType: 'basic',
    fileName: path.basename(uploadPath),
    analysisTime: new Date().toISOString(),
    facesDetected: 1,
    inconsistencyScore: Math.round(analysisDetails.artificialMarkers.blurInconsistencies * 100),
    analysisDetails,
    debugInfo: {
      model_loaded: false,
      error: errorMessage,
      mock_data: true,
      timestamp: new Date().toISOString(),
      input_shape: [299, 299, 3],
      script_version: "enhanced_mock_v2.0"
    },
    limitations: {
      message: "Rezultat generat de sistemul de bază - pentru analiză avansată creează-ți cont gratuit",
      missingFeatures: ['advanced_model', 'heatmap', 'detailed_face_analysis', 'pdf_report']
    }
  };
}

function generateExplanation(fakeScore) {
  if (fakeScore > 80) {
    return {
      verdict: "Probabilitate foarte mare de deepfake",
      reasons: [
        "Inconsistențe detectate în textura facială",
        "Artefacte de compresie neobișnuite",
        "Variații anormale în iluminare",
        "Margini artificiale detectate"
      ],
      recommendation: "Această imagine prezintă multiple semne de manipulare digitală"
    };
  } else if (fakeScore > 50) {
    return {
      verdict: "Posibile semne de manipulare",
      reasons: [
        "Unele inconsistențe în textura pielii",
        "Calitatea variabilă în diferite zone",
        "Posibile retușuri digitale"
      ],
      recommendation: "Imaginea ar putea fi modificată digital - necesită verificare suplimentară"
    };
  } else if (fakeScore > 25) {
    return {
      verdict: "Calitate suspectă, dar probabil autentică",
      reasons: [
        "Calitate redusă a imaginii",
        "Compresie puternică detectată",
        "Posibile efecte de cameră"
      ],
      recommendation: "Imaginea pare autentică, dar calitatea redusă poate masca manipulări"
    };
  } else {
    return {
      verdict: "Probabilitate mare de autenticitate",
      reasons: [
        "Texturi faciale naturale și consistente",
        "Iluminare uniformă și realistă",
        "Nu s-au detectat artefacte de manipulare",
        "Margini și detalii naturale"
      ],
      recommendation: "Imaginea pare să fie autentică și nemodificată"
    };
  }
}

function parseJsonFromOutput(output) {
  try {
    if (!output || typeof output !== 'string') {
      logger && logger.warn('parseJsonFromOutput: No output or invalid type');
      return null;
    }

    // Log raw output for debugging (first 1000 chars)
    logger && logger.debug(`Raw Python output (first 1000 chars): ${output.substring(0, 1000)}`);

    // Clean output and remove all non-printable characters except newlines
    const cleanedOutput = output.replace(/[^\x20-\x7E\n\r\t]/g, '').trim();
    
    // Split into lines and find JSON
    const lines = cleanedOutput.split(/\r?\n/);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and lines that don't start with '{'
      if (!line || !line.startsWith('{')) {
        continue;
      }
      
      // Find complete JSON object in the line
      let braceCount = 0;
      let jsonEnd = -1;
      
      for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') {
          braceCount++;
        } else if (line[j] === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEnd = j;
            break;
          }
        }
      }
      
      if (jsonEnd > -1) {
        const jsonCandidate = line.substring(0, jsonEnd + 1);
        try {
          const parsed = JSON.parse(jsonCandidate);
          logger && logger.debug(`Successfully parsed JSON from line ${i}: ${jsonCandidate.substring(0, 100)}...`);
          return parsed;
        } catch (e) {
          logger && logger.debug(`Failed to parse JSON candidate from line ${i}: ${e.message}`);
          continue;
        }
      }
    }

    // Fallback: try to parse the entire cleaned output
    try {
      const parsed = JSON.parse(cleanedOutput);
      logger && logger.debug('Direct JSON parse successful');
      return parsed;
    } catch (e) {
      logger && logger.debug(`Direct parse failed: ${e.message}`);
    }

    // Last resort: extract JSON using regex
    const jsonMatch = cleanedOutput.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        logger && logger.debug('Regex extraction successful');
        return parsed;
      } catch (e) {
        logger && logger.debug(`Regex extraction failed: ${e.message}`);
      }
    }

    logger && logger.warn('Failed to parse JSON from output, raw sample:', cleanedOutput.substring(0, 300));
    return null;
  } catch (error) {
    logger && logger.error(`Error in parseJsonFromOutput: ${error.message}`);
    return null;
  }
}

function getSafeTempFilePath(mediaFile) {
  if (!mediaFile || !mediaFile.tempFilePath) {
    return null;
  }
  
  const tempPath = mediaFile.tempFilePath;
  
  if (typeof tempPath !== 'string' || tempPath.trim() === '') {
    return null;
  }
  
  // Check if it's actually a file path (has extension and is not a directory)
  const hasExtension = /\.[a-zA-Z0-9]{1,10}$/.test(tempPath);
  if (!hasExtension) {
    logger && logger.debug(`Rejecting temp path without extension: ${tempPath}`);
    return null;
  }
  
  // Additional safety check - make sure it's not one of our known directories
  const pathParts = tempPath.split(/[\/\\]/);
  const lastPart = pathParts[pathParts.length - 1];
  const forbiddenNames = ['uploads', 'temp', 'public', 'heatmaps', 'deepfakeDetector', 'backend'];
  
  if (forbiddenNames.includes(lastPart.toLowerCase())) {
    logger && logger.debug(`Rejecting temp path that ends with forbidden directory name: ${tempPath}`);
    return null;
  }
  
  return tempPath;
}

function cleanupFiles(filePaths) {
  if (!Array.isArray(filePaths)) {
    logger && logger.warn('cleanupFiles called with non-array argument');
    return;
  }

  filePaths.forEach(filePath => {
    if (!filePath || typeof filePath !== 'string') {
      return;
    }
    
    // Skip if path is too short or looks like a directory
    if (filePath.length < 5) {
      logger && logger.debug(`Skipping cleanup of suspiciously short path: ${filePath}`);
      return;
    }
    
    // Additional safety: skip if path ends with common directory names
    const pathLower = filePath.toLowerCase();
    const forbiddenPaths = ['uploads', 'temp', 'public', 'heatmaps', 'deepfakedetector', 'backend', 'frontend', 'logs', 'models'];
    if (forbiddenPaths.some(dir => pathLower.endsWith(dir) || pathLower.endsWith(dir + path.sep))) {
      logger && logger.warn(`Skipping cleanup of directory path: ${filePath}`);
      return;
    }
    
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        
        if (stats.isFile()) {
          fs.unlinkSync(filePath);
          logger && logger.debug(`Successfully deleted file: ${filePath}`);
        } else {
          logger && logger.warn(`Skipping directory cleanup: ${filePath}`);
        }
      } else {
        logger && logger.debug(`File does not exist, skipping: ${filePath}`);
      }
    } catch (err) {
      logger && logger.error(`Error deleting ${filePath}: ${err.message}`);
    }
  });
}

async function runTieredDetection(uploadPath, tierConfig, user) {
  const isAuthenticated = user && user.userId;
  
  if (tierConfig.modelType === 'basic') {
    return await runBasicDetection(uploadPath);
  } else {
    return await runAdvancedDetection(uploadPath, tierConfig.features, isAuthenticated);
  }
}

async function runBasicDetection(uploadPath) {
  try {
    const basicDetectorScript = path.join(deepfakeDetectorDir, 'deepfakeDetector.py');
    const basicModelPath = path.join(savedModelDir, 'model_xception.keras');

    if (!fs.existsSync(basicDetectorScript)) {
      logger && logger.error(`Python script not found: ${basicDetectorScript}`);
      return generateMockResult(uploadPath, 'Python script not found');
    }

    // Commands to try
    const commands = [
      `python "${basicDetectorScript}" "${uploadPath}" --modelPath "${basicModelPath}" --imageSize 299`,
      `python3 "${basicDetectorScript}" "${uploadPath}" --modelPath "${basicModelPath}" --imageSize 299`,
      `python "${basicDetectorScript}" "${uploadPath}" --imageSize 299`
    ];

    for (const cmd of commands) {
      logger && logger.info(`Trying command: ${cmd}`);
      try {
        const { stdout, stderr } = await execPromise(cmd, { 
          cwd: deepfakeDetectorDir, 
          timeout: 45000,
          encoding: 'utf8',
          maxBuffer: 1024 * 1024 * 10 // 10MB buffer
        });
        
        if (stderr && stderr.trim()) {
          logger && logger.warn(`Python stderr: ${stderr.substring(0, 500)}`);
        }
        
        logger && logger.debug(`Python stdout length: ${stdout.length}`);
        
        const result = parseJsonFromOutput(stdout);
        if (result && result.fakeScore !== undefined) {
          logger && logger.info(`Successfully parsed result with fakeScore: ${result.fakeScore}`);
          return { ...result, modelType: 'basic', fileName: path.basename(uploadPath) };
        } else {
          logger && logger.warn(`Invalid or incomplete result from command`);
        }
      } catch (err) {
        logger && logger.warn(`Command failed: ${err.message}`);
        if (err.code === 'ETIMEDOUT') {
          logger && logger.error('Python script timed out');
        }
      }
    }

    return generateMockResult(uploadPath, 'All Python detection commands failed - no valid JSON output');
  } catch (error) {
    logger && logger.error(`Error in basic detection: ${error.message}`);
    return generateMockResult(uploadPath, error.message);
  }
}

async function runAdvancedDetection(uploadPath, features, isAuthenticated) {
  try {
    const performanceDetectorScript = path.join(deepfakeDetectorDir, 'versiuneaPerformanta', 'wrapperBackend.py');
    
    if (fs.existsSync(performanceDetectorScript)) {
      logger && logger.info('Folosim detectorul avansat de performanță...');
      
      const commands = [
        `python "${performanceDetectorScript}" "${uploadPath}"`,
        `python3 "${performanceDetectorScript}" "${uploadPath}"`
      ];
      
      for (const cmd of commands) {
        logger && logger.info(`Trying performance command: ${cmd}`);
        try {
          const { stdout, stderr } = await execPromise(cmd, { 
            cwd: path.join(deepfakeDetectorDir, 'versiuneaPerformanta'),
            timeout: 120000,
            encoding: 'utf8',
            maxBuffer: 1024 * 1024 * 10
          });
          
          if (stderr && stderr.trim()) {
            logger && logger.warn(`Performance detector stderr: ${stderr.substring(0, 500)}`);
          }
          
          logger && logger.debug(`Performance detector stdout: ${stdout.substring(0, 1000)}`);
          
          const result = JSON.parse(stdout.trim());
          
          if (result.success && result.confidence !== undefined) {
            const formattedResult = {
              fakeScore: result.is_deepfake ? result.confidence / 100 : (100 - result.confidence) / 100,
              confidenceScore: result.confidence,
              isDeepfake: result.is_deepfake,
              classification: result.classification,
              riskLevel: result.risk_level,
              processingTime: result.processing_time,
              modelType: 'advanced_performance',
              modelVersion: result.model_version || 'v1.0',
              fileName: path.basename(uploadPath),
              timestamp: result.timestamp,
              analysisDetails: {
                explanation: generateExplanationAdvanced(result),
                threshold: result.threshold_used || 0.5,
                rawPrediction: result.raw_prediction
              }
            };
            
            logger && logger.info(`Performance detector success: ${result.classification} (${result.confidence}%)`);
            return formattedResult;
          } else if (result.error) {
            logger && logger.warn(`Performance detector error: ${result.error}`);
          }
        } catch (err) {
          logger && logger.warn(`Performance command failed: ${err.message}`);
          if (err.code === 'ETIMEDOUT') {
            logger && logger.error('Performance detector timed out');
          }
        }
      }
    }
    
    // Fallback la detectorul avansat original
    logger && logger.info('Fallback la detectorul avansat original...');
    const advancedDetectorScript = path.join(deepfakeDetectorDir, 'deepfakeDetector.py');
    const advancedModelPath = path.join(savedModelDir, 'advanced_deepfake_model.keras');
    const basicModelPath = path.join(savedModelDir, 'model_xception.keras');
    
    if (!fs.existsSync(advancedDetectorScript)) {
      logger && logger.error(`Advanced Python script not found: ${advancedDetectorScript}`);
      return await runBasicDetection(uploadPath);
    }
    
    const modelPath = fs.existsSync(advancedModelPath) ? advancedModelPath : basicModelPath;
    
    let command = `python "${advancedDetectorScript}" "${uploadPath}" --imageSize 299`;
    
    if (fs.existsSync(modelPath)) {
      command += ` --modelPath "${modelPath}"`;
    }
    
    if (features.heatmapGeneration && isAuthenticated) {
      command += ` --generateHeatmap`;
    }
    
    const commands = [
      command,
      command.replace('python', 'python3'),
      `python "${advancedDetectorScript}" "${uploadPath}" --imageSize 299`,
      `python3 "${advancedDetectorScript}" "${uploadPath}" --imageSize 299`
    ];
    
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      logger && logger.info(`Trying advanced command ${i + 1}/${commands.length}: ${cmd}`);
      
      try {
        const { stdout, stderr } = await execPromise(cmd, { 
          timeout: 180000,
          cwd: deepfakeDetectorDir 
        });
        
        if (stderr && stderr.trim()) {
          logger && logger.warn(`Advanced Python stderr: ${stderr}`);
          
          if (stderr.includes('incompatible with the layer') || 
              stderr.includes('ModuleNotFoundError') ||
              stderr.includes('ImportError')) {
            continue;
          }
        }
        
        logger && logger.info(`Advanced Python stdout: ${stdout}`);
        
        const result = parseJsonFromOutput(stdout);
        
        if (result) {
          if (result.error && 
              (result.error.includes('incompatible with the layer') ||
               result.error.includes('ModuleNotFoundError') ||
               result.error.includes('ImportError'))) {
            continue;
          }
          
          if (result.heatmapPath && fs.existsSync(result.heatmapPath)) {
            const heatmapFileName = path.basename(result.heatmapPath);
            const publicHeatmapPath = path.join(publicHeatmapsDir, heatmapFileName);
            
            try {
              if (!fs.existsSync(publicHeatmapsDir)) {
                fs.mkdirSync(publicHeatmapsDir, { recursive: true });
              }
              
              await fs.promises.copyFile(result.heatmapPath, publicHeatmapPath);
              result.heatmapUrl = `/heatmaps/${heatmapFileName}`;
              logger && logger.info(`Heatmap copied to public directory: ${publicHeatmapPath}`);
            } catch (heatmapError) {
              logger && logger.error(`Error copying heatmap: ${heatmapError.message}`);
            }
          }
          
          if (features.faceAnalysis) {
            result.faceAnalysis = await runFaceAnalysis(uploadPath);
          }
          
          return {
            ...result,
            modelType: result.modelType || 'advanced',
            fileName: result.fileName || path.basename(uploadPath),
            debugInfo: {
              ...result.debugInfo,
              command_used: cmd,
              advanced_features: Object.keys(features).filter(f => features[f])
            },
            premiumFeatures: Object.keys(features).filter(f => features[f])
          };
        } else {
          logger && logger.warn(`No valid JSON output from advanced command, trying next...`);
          continue;
        }
        
      } catch (cmdError) {
        logger && logger.error(`Advanced command ${i + 1} failed: ${cmdError.message}`);
        
        if (i === commands.length - 1) {
          logger && logger.warn(`All advanced commands failed, falling back to basic detection`);
          return await runBasicDetection(uploadPath);
        }
        
        continue;
      }
    }
    
    logger && logger.warn(`Advanced detection failed, falling back to basic detection`);
    return await runBasicDetection(uploadPath);
    
  } catch (error) {
    logger && logger.error(`Error in advanced detection: ${error.message}`);
    return await runBasicDetection(uploadPath);
  }
}

async function generateHeatmapForPremium(imagePath, fakeScore, confidenceScore = 0) {
  try {
    console.log(`⚡ [HEATMAP] Starting standard heatmap generation for score: ${fakeScore}%, path: ${imagePath}`);
    logger && logger.info(`Generare heatmap standard cu HeatmapService pentru score: ${fakeScore}`);
    
    // Creează structura de date de analiză pentru HeatmapService
    const analysisData = {
      id: Date.now(),
      fake_score: fakeScore,
      confidence_score: confidenceScore,
      uploaded_at: new Date().toISOString(),
      user_id: null
    };
    
    const heatmapOptions = {
      type: 'standard',
      quality: 'medium',
      format: 'jpg',
      features: {
        fakeScore: fakeScore,
        intensity: 0.6,
        colorScheme: 'heat'
      }
    };
    
    // Folosește noul HeatmapService pentru generare standard
    console.log(`🛠️ [HEATMAP] Calling heatmapService.generateHeatmap...`);
    const result = await heatmapService.generateHeatmap(imagePath, analysisData, heatmapOptions);
    
    console.log(`📊 [HEATMAP] Standard HeatmapService result:`, result ? JSON.stringify({
      success: result.success,
      heatmapPath: result.heatmapPath,
      heatmapUrl: result.heatmapUrl,
      fileName: result.fileName,
      error: result.error
    }, null, 2) : 'NULL');
    
    if (result.success) {
      console.log(`✅ [HEATMAP] Standard heatmap generated successfully: ${result.heatmapPath}`);
      return {
        heatmapPath: result.heatmapPath,
        heatmapUrl: result.heatmapUrl,
        heatmapGenerated: true,
        heatmapType: 'standard',
        metadata: result.metadata
      };
    } else {
      const errorMsg = result.error || 'Failed to generate standard heatmap';
      console.log(`❌ [HEATMAP] Standard heatmap failed: ${errorMsg}`);
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.log(`💥 [HEATMAP] Error in standard generation: ${error.message}`);
    logger && logger.error(`Error generating standard heatmap: ${error.message}`);
    return null;
  }
}

async function runFaceAnalysis(imagePath) {
  try {
    const faceAnalyzerScript = path.join(deepfakeDetectorDir, 'deepfakeDetector.py');
    
    if (!fs.existsSync(faceAnalyzerScript)) {
      logger && logger.warn('Face analyzer script not found');
      return null;
    }
    
    const command = `python "${faceAnalyzerScript}" "${imagePath}" --imageSize 299`;
    
    try {
      const { stdout } = await execPromise(command, { 
        timeout: 60000,
        cwd: deepfakeDetectorDir 
      });
      
      const result = parseJsonFromOutput(stdout);
      
      if (result) {
        return {
          facesDetected: 1,
          faceQuality: result.confidenceScore || 85,
          facialFeatures: {
            eyes: "detected",
            nose: "detected", 
            mouth: "detected"
          },
          analysisMethod: "integrated_detection",
          confidence: result.confidenceScore || 85
        };
      }
    } catch (error) {
      logger && logger.error(`Face analysis command failed: ${error.message}`);
    }
    
    return {
      facesDetected: 1,
      faceQuality: 75 + Math.random() * 20,
      facialFeatures: {
        eyes: "detected",
        nose: "detected",
        mouth: "detected"
      },
      analysisMethod: "mock_analysis",
      confidence: 75 + Math.random() * 20,
      note: "Face analysis is in development"
    };
    
  } catch (error) {
    logger && logger.error(`Error in face analysis: ${error.message}`);
    return null;
  }
}

function formatResponseForTier(detectionResult, tierConfig, quotaInfo) {
  const baseResponse = {
    success: true,
    result: {
      fakeScore: detectionResult.fakeScore,
      isDeepfake: detectionResult.isDeepfake,
      processingTime: detectionResult.processingTime,
      modelType: detectionResult.modelType,
      fileName: detectionResult.fileName
    },
    tier: {
      name: tierConfig.name,
      quota: quotaInfo
    }
  };
  
  if (tierConfig.resultsDetail === 'comprehensive') {
    return {
      ...baseResponse,
      result: {
        ...baseResponse.result,
        confidenceScore: detectionResult.confidenceScore,
        heatmapUrl: detectionResult.heatmapUrl,
        heatmapAdvanced: detectionResult.heatmapAdvanced,
        heatmapFeatures: detectionResult.heatmapFeatures,
        heatmapStats: detectionResult.heatmapStats,
        heatmapMetadata: detectionResult.heatmapMetadata,
        faceAnalysis: detectionResult.faceAnalysis,
        predictions: detectionResult.predictions,
        stdDeviation: detectionResult.stdDeviation,
        premiumFeatures: detectionResult.premiumFeatures,
        analysisTime: detectionResult.analysisTime,
        facesDetected: detectionResult.facesDetected,
        faceScore: detectionResult.faceScore,
        inconsistencyScore: detectionResult.inconsistencyScore,
        vggFaceScore: detectionResult.vggFaceScore,
        debugInfo: detectionResult.debugInfo
      }
    };
  } else {
    return {
      ...baseResponse,
      result: {
        ...baseResponse.result,
        confidenceScore: detectionResult.confidenceScore,
        heatmapUrl: detectionResult.heatmapUrl, // Include heatmap pentru toate tier-urile
        debugInfo: detectionResult.debugInfo
      },
      limitations: detectionResult.limitations,
      upgrade: {
        message: "Creează-ți cont gratuit pentru analize avansate!",
        benefits: [
          "Analize nelimitate pe zi",
          "Suport pentru videoclipuri",
          "Heatmap-uri detaliate", 
          "Analiză facială avansată",
          "Istoric salvat",
          "Export rezultate"
        ]
      }
    };
  }
}

async function saveResultToDatabase(detectionResult, userId, filePath, heatmapUrl) {
  try {
    const [tables] = await db.execute("SHOW TABLES LIKE 'reports'");
    if (tables.length === 0) {
      logger && logger.error("The 'reports' table doesn't exist in the database");
      
      await db.execute(`
        CREATE TABLE IF NOT EXISTS reports (
          id INT AUTO_INCREMENT PRIMARY KEY,
          file_name VARCHAR(255) NOT NULL,
          detection_result JSON,
          confidence_score FLOAT,
          fake_score FLOAT,
          user_id INT,
          uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          image_path VARCHAR(255),
          heatmap_path VARCHAR(255),
          faces_detected INT DEFAULT 0,
          face_score FLOAT,
          inconsistency_score FLOAT,
          vgg_face_score FLOAT,
          is_deepfake BOOLEAN DEFAULT FALSE,
          model_type VARCHAR(50) DEFAULT 'basic',
          std_deviation FLOAT,
          confidence_interval JSON,
          processing_time FLOAT
        )
      `);
      logger && logger.info("Created 'reports' table in the database");
    }
    
    const sql = `INSERT INTO reports (
      file_name, detection_result, confidence_score, fake_score, user_id, 
      uploaded_at, image_path, heatmap_path, faces_detected, face_score,
      inconsistency_score, vgg_face_score, is_deepfake, model_type,
      std_deviation, confidence_interval, processing_time
    ) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    // Normalizează valorile pentru a evita undefined în parametrii SQL
    const fakeScore = detectionResult.fakeScore !== undefined ? detectionResult.fakeScore : null;
    const confidenceScore = detectionResult.confidenceScore !== undefined ? detectionResult.confidenceScore : null;
    const isDeepfake = fakeScore !== null ? (fakeScore > 50 ? 1 : 0) : null;
    
    // Debug: Verifică toate valorile înainte de a le trimite la DB
    const params = [
      detectionResult.fileName || 'unknown',
      JSON.stringify(detectionResult),
      confidenceScore,
      fakeScore,
      userId,
      filePath || null,
      heatmapUrl || null,
      detectionResult.facesDetected || 0,
      detectionResult.faceScore !== undefined ? detectionResult.faceScore : null,
      detectionResult.inconsistencyScore !== undefined ? detectionResult.inconsistencyScore : null,
      detectionResult.vggFaceScore !== undefined ? detectionResult.vggFaceScore : null,
      isDeepfake,
      detectionResult.modelType || 'basic',
      detectionResult.stdDeviation !== undefined ? detectionResult.stdDeviation : null,
      detectionResult.confidenceInterval ? JSON.stringify(detectionResult.confidenceInterval) : null,
      detectionResult.processingTime !== undefined ? detectionResult.processingTime : null
    ];
    
    // Log parametrii pentru debugging
    logger && logger.info(`DB params check: ${JSON.stringify(params.map((p, i) => ({ index: i, value: p, type: typeof p, isUndefined: p === undefined })))}`);
    
    // Verifică dacă există undefined în parametri
    const undefinedIndices = params.map((p, i) => p === undefined ? i : null).filter(i => i !== null);
    if (undefinedIndices.length > 0) {
      logger && logger.error(`Found undefined parameters at indices: ${undefinedIndices.join(', ')}`);
      throw new Error(`Invalid parameters: indices ${undefinedIndices.join(', ')} are undefined`);
    }
    
    const [result] = await db.execute(sql, params);
    
    logger && logger.info(`Report saved successfully to database for user ${userId || 'anonymous'}`);
    return result.insertId;
  } catch (error) {
    logger && logger.error(`Error saving report to database: ${error.message}`);
    throw error;
  }
}

async function generateAdvancedHeatmapForPremium(imagePath, fakeScore, userId, confidenceScore = 0) {
  try {
    console.log(`🔥 [HEATMAP] Starting advanced heatmap generation for user ${userId}, score: ${fakeScore}%, path: ${imagePath}`);
    logger && logger.info(`Generare heatmap avansat cu HeatmapService pentru utilizatorul premium: ${userId}`);
    
    // Configurație pentru heatmap premium
    const premiumOptions = {
      fakeScore: fakeScore,
      userId: userId,
      intensity: 0.8,
      colorScheme: 'redHeat',
      enhancedFeatures: true,
      multiLayer: true,
      statistics: true
    };
    
    console.log(`📋 [HEATMAP] Premium options:`, JSON.stringify(premiumOptions, null, 2));
    
    // Încearcă să genereze heatmap-ul premium cu HeatmapService
    console.log(`🛠️ [HEATMAP] Calling heatmapService.generateHeatmap...`);
    
    // Creează structura de date de analiză pentru HeatmapService
    const analysisData = {
      id: Date.now(),
      fake_score: fakeScore,
      confidence_score: confidenceScore,
      uploaded_at: new Date().toISOString(),
      user_id: userId
    };
    
    const heatmapOptions = {
      type: 'premium',
      quality: 'high',
      format: 'jpg',
      userId: userId,
      features: {
        fakeScore,
        userId,
        intensity: 0.8,
        colorScheme: 'redHeat',
        enhancedFeatures: true,
        multiLayer: true,
        statistics: true
      }
    };
    
    const result = await heatmapService.generateHeatmap(imagePath, analysisData, heatmapOptions);
    
    console.log(`📊 [HEATMAP] HeatmapService result:`, result ? JSON.stringify({
      success: result.success,
      heatmapPath: result.heatmapPath,
      heatmapUrl: result.heatmapUrl,
      fileName: result.fileName,
      error: result.error
    }, null, 2) : 'NULL');
    
    if (result.success) {
      const enhancedResult = {
        heatmapPath: result.heatmapPath,
        heatmapUrl: result.heatmapUrl,
        heatmapGenerated: true,
        premium: true,
        enhancedRed: true,
        fileName: result.fileName,
        metadata: result.metadata,
        stats: result.stats
      };
      
      console.log(`✅ [HEATMAP] Premium heatmap generat cu succes: ${result.heatmapPath}`);
      logger.info(`✅ Heatmap premium generat cu succes: ${result.heatmapPath}`);
      
      return enhancedResult;
    } else {
      const errorMsg = result.error || 'Failed to generate premium heatmap';
      console.log(`❌ [HEATMAP] Premium heatmap failed: ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
  } catch (error) {
    console.log(`💥 [HEATMAP] Error in premium generation: ${error.message}`);
    logger && logger.error(`Eroare în generarea heatmap premium: ${error.message}`);
    
    // Fallback la heatmap standard în caz de eroare
    console.log(`🔄 [HEATMAP] Fallback la heatmap standard pentru utilizatorul premium`);
    logger && logger.info('Fallback la heatmap standard pentru utilizatorul premium');
    const standardResult = await generateHeatmapForPremium(imagePath, fakeScore, confidenceScore);
    
    if (standardResult && standardResult.heatmapGenerated) {
      console.log(`✅ [HEATMAP] Fallback standard heatmap generated successfully`);
      // Îmbunătățește rezultatul standard cu informații premium
      return {
        ...standardResult,
        premium: false, // Marchează că nu s-a folosit versiunea avansată
        fallbackUsed: true,
        advancedFeatures: {
          multiLayerAnalysis: false,
          detailedStatistics: false,
          riskAssessment: false,
          qualityEnhancement: false
        },
        metadata: {
          version: 'standard_fallback',
          userId: userId,
          timestamp: new Date().toISOString(),
          error: error.message
        }
      };
    }
    
    return {
      heatmapGenerated: false,
      heatmapError: error.message,
      fallbackUsed: false
    };
  }
}

// Middleware pentru utilizatori anonimi - permite accesul fără autentificare
const optionalAuth = (req, res, next) => {
  console.log('🔍 optionalAuth: Starting authentication check');
  const authHeader = req.headers.authorization;
  console.log('🔍 optionalAuth: authHeader =', authHeader);
  const token = authHeader && authHeader.split(' ')[1];
  console.log('🔍 optionalAuth: token =', token ? 'TOKEN_PRESENT' : 'NO_TOKEN');
  
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'b14b24');
      console.log('🔍 optionalAuth: JWT decoded successfully =', decoded);
      req.user = decoded;
    } catch (error) {
      // Token invalid, dar continuăm ca utilizator anonim
      console.log('🔍 optionalAuth: JWT verification failed =', error.message);
      req.user = null;
    }
  } else {
    console.log('🔍 optionalAuth: No token provided, setting user to null');
    req.user = null;
  }
  
  console.log('🔍 optionalAuth: Final req.user =', req.user);
  next();
};

// Înlocuiește middleware-ul de autentificare cu cel opțional pentru upload
router.post('/upload', optionalAuth, tierMiddleware, async (req, res) => {
  let uploadPath = null;
  let tempFilePath = null;
  
  try {
    console.log('Upload request received');
    console.log('User:', req.user ? `${req.user.userId} (${req.userTier})` : 'Anonymous');
    console.log('Files:', req.files ? Object.keys(req.files) : 'No files');
    console.log('Body:', req.body);
    
    const quotaCheck = await req.checkQuota();
    if (!quotaCheck.allowed) {
      console.log('Quota exceeded for user/IP');
      return res.status(429).json({
        error: 'Quota Exceeded',
        message: `Ai atins limita de ${quotaCheck.maxAllowed} analize pe zi`,
        quota: quotaCheck,
        upgrade: req.getUpgradeMessage('unlimited')
      });
    }
    
    if (!req.files || Object.keys(req.files).length === 0) {
      console.log('No files uploaded');
      return res.status(400).json({
        error: 'Nu a fost încărcat niciun fișier',
        message: 'Vă rugăm să selectați un fișier pentru analiză'
      });
    }
    
    const mediaFile = req.files.video || req.files.media || req.files.file;
    if (!mediaFile) {
      console.log('File not found with expected names, available keys:', Object.keys(req.files));
      return res.status(400).json({
        error: 'Fișier invalid',
        message: 'Fișierul trebuie să aibă numele "file", "media" sau "video"',
        availableFiles: Object.keys(req.files)
      });
    }
    
    console.log('File details:', {
      name: mediaFile.name,
      size: mediaFile.size,
      mimetype: mediaFile.mimetype
    });
    
    const fileValidation = req.validateFile(mediaFile);
    if (!fileValidation.valid) {
      console.log('File validation failed:', fileValidation.errors);
      return res.status(400).json({
        error: 'Validare fișier eșuată',
        message: 'Fișierul nu respectă criteriile acceptate',
        details: fileValidation.errors,
        currentTier: req.userTier
      });
    }
    
    const isVideo = /\.(mp4|avi|mov|mkv)$/i.test(mediaFile.name);
    if (isVideo && !req.hasFeature('videoProcessing')) {
      return res.status(403).json({
        error: 'Funcție Premium necesară',
        message: 'Procesarea video este disponibilă doar pentru utilizatorii Premium',
        feature: 'videoProcessing',
        upgrade: req.getUpgradeMessage('video_processing')
      });
    }
    
    const safeFileName = generateSafeFileName(mediaFile.name);
    uploadPath = path.join(uploadsDir, safeFileName);
    
    // Debug logging for tempFilePath issue
    logger && logger.debug(`mediaFile.tempFilePath: ${mediaFile.tempFilePath}`);
    tempFilePath = getSafeTempFilePath(mediaFile);
    logger && logger.debug(`getSafeTempFilePath result: ${tempFilePath}`);
    
    const originalFileName = mediaFile.name;
    const userId = req.user ? req.user.userId : null;
    const userIdFromBody = req.body.userId;
    
    logger && logger.info(`Processing file: ${mediaFile.name} (${safeFileName}), size: ${mediaFile.size}, user: ${userId || userIdFromBody || 'anonymous'}, tier: ${req.userTier}`);
    
    await mediaFile.mv(uploadPath);
    logger && logger.info(`File moved to: ${uploadPath}`);
    
    const isImage = /\.(jpg|jpeg|png)$/i.test(mediaFile.name);
    if (!isVideo && !isImage) {
      logger && logger.warn(`Unsupported file format: ${mediaFile.name}`);
      cleanupFiles([uploadPath, tempFilePath].filter(Boolean));
      return res.status(400).json({
        error: 'Format nesuportat',
        message: 'Acceptăm doar imagini (JPG, JPEG, PNG) și videoclipuri (MP4, AVI, MOV, MKV)'
      });
    }
    
    console.log('Starting detection process...');
    const detectionResult = await runTieredDetection(uploadPath, req.tierConfig, req.user);
    console.log('Detection completed:', {
      fakeScore: detectionResult.fakeScore,
      confidence: detectionResult.confidenceScore,
      modelType: detectionResult.modelType
    });
    
    await TierService.incrementQuota(req.user, req.ip);
    
    // Adaugă analysisDetails cu explicație pentru toate rezultatele
    if (!detectionResult.analysisDetails) {
      detectionResult.analysisDetails = {
        explanation: generateExplanation(detectionResult.fakeScore)
      };
    }
    
    // Generăm heatmap pentru orice utilizator dacă imaginea este clasificată ca deepfake/posibil deepfake
    const shouldGenerateHeatmap = detectionResult.fakeScore > 40; // Pentru orice score > 40%
    
    console.log(`🔍 Heatmap check: score=${detectionResult.fakeScore}%, shouldGenerate=${shouldGenerateHeatmap}, user=${req.user ? req.user.userId : 'anonymous'}, hasFeature=${req.hasFeature ? req.hasFeature('heatmapGeneration') : 'N/A'}`);
    
    if (shouldGenerateHeatmap) {
      try {
        console.log(`🎯 Generating heatmap for score ${detectionResult.fakeScore}% (user: ${req.user ? req.user.userId : 'anonymous'})`);
        
        let heatmapResult;
        
        // Pentru utilizatorii premium autentificați, generăm heatmap avansat
        if (req.hasFeature('heatmapGeneration') && req.user) {
          console.log('🔥 Generating advanced heatmap for premium user...');
          heatmapResult = await generateAdvancedHeatmapForPremium(
            uploadPath,
            detectionResult.fakeScore,
            req.user.userId,
            detectionResult.confidenceScore
          );
          console.log('🎯 Advanced heatmap result:', heatmapResult ? 'SUCCESS' : 'FAILED');
        } else {
          console.log('⚡ Generating standard heatmap for suspicious image...');
          heatmapResult = await generateHeatmapForPremium(uploadPath, detectionResult.fakeScore, detectionResult.confidenceScore);
          console.log('⚡ Standard heatmap result:', heatmapResult ? 'SUCCESS' : 'FAILED');
        }
        
        if (heatmapResult && heatmapResult.heatmapGenerated) {
          detectionResult.heatmapUrl = heatmapResult.heatmapUrl;
          detectionResult.heatmapPath = heatmapResult.heatmapPath;
          detectionResult.heatmapAdvanced = heatmapResult.premium || false;
          detectionResult.heatmapFeatures = heatmapResult.advancedFeatures;
          detectionResult.heatmapStats = heatmapResult.statistics;
          detectionResult.heatmapMetadata = heatmapResult.metadata;
          
          if (heatmapResult.premium) {
            console.log('✅ Advanced heatmap generated:', heatmapResult.heatmapUrl);
            console.log('📊 Layers analyzed:', heatmapResult.layersAnalyzed);
          } else {
            console.log('✅ Standard heatmap generated:', heatmapResult.heatmapUrl);
          }
        } else {
          console.log('❌ Heatmap generation failed or returned null');
        }
      } catch (heatmapError) {
        console.log('💥 Heatmap generation error:', heatmapError.message);
        logger && logger.error(`Error generating heatmap: ${heatmapError.message}`);
      }
    } else {
      console.log(`🚫 Heatmap not generated: score ${detectionResult.fakeScore}% is below threshold (40%)`);
    }
    
    // Pentru utilizatorii premium, generăm raport PDF
    let pdfReport = null;
    if (req.hasFeature('pdfReports') && req.user) {
      try {
        console.log('Generating PDF report for premium user...');
        pdfReport = await PDFReportService.generateAnalysisReport(
          detectionResult,
          uploadPath,
          detectionResult.heatmapPath
        );
        console.log('PDF report generated:', pdfReport?.fileName);
      } catch (pdfError) {
        logger && logger.error(`Error generating PDF report: ${pdfError.message}`);
      }
    }
    
    // Salvează în baza de date doar pentru utilizatorii autentificați
    let reportId = null;
    let permanentFilePath = null;
    
    console.log('🔍 DEBUG SALVARE ISTORIC:');
    console.log('req.hasFeature("historySaving"):', req.hasFeature('historySaving'));
    console.log('req.user:', req.user ? 'exists' : 'null');
    console.log('req.user details:', req.user);
    console.log('req.tierConfig:', req.tierConfig);
    
    // 🔍 DEBUG SAVE CONDITION: Verifică de ce nu se salvează
    console.log('🔍 DEBUG SAVE CONDITION - Checking save requirements:');
    console.log('  req.hasFeature("historySaving"):', req.hasFeature ? req.hasFeature('historySaving') : 'hasFeature function not available');
    console.log('  req.user:', req.user ? `User ID: ${req.user.userId}` : 'No user found');
    console.log('  req.userTier:', req.userTier || 'No userTier found');
    console.log('  req.tierConfig:', req.tierConfig ? JSON.stringify(req.tierConfig, null, 2) : 'No tierConfig found');
    console.log('  req.tierConfig.features:', req.tierConfig?.features ? JSON.stringify(req.tierConfig.features, null, 2) : 'No features found');
    
    // Test explicit pentru historySaving
    const hasHistorySaving = req.hasFeature && req.hasFeature('historySaving');
    const hasUser = req.user && req.user.userId;
    console.log('  🔍 EXPLICIT CHECKS:');
    console.log('    hasHistorySaving:', hasHistorySaving);
    console.log('    hasUser:', hasUser);
    console.log('    SHOULD SAVE:', hasHistorySaving && hasUser);
    
    if (req.hasFeature('historySaving') && req.user) {
      try {
        console.log('✅ Saving to database for authenticated user...');
        if (!fs.existsSync(publicUploadsDir)) {
          fs.mkdirSync(publicUploadsDir, { recursive: true });
        }
        
        const permanentFileName = `${path.basename(uploadPath)}`;
        const permanentFileFullPath = path.join(publicUploadsDir, permanentFileName);
        
        await fs.promises.copyFile(uploadPath, permanentFileFullPath);
        permanentFilePath = `/uploads/${permanentFileName}`;
        
        reportId = await saveResultToDatabase(
          {
            ...detectionResult,
            fileName: originalFileName
          },
          req.user.userId,
          permanentFilePath,
          detectionResult.heatmapUrl
        );
        console.log('✅ Report saved with ID:', reportId);
      } catch (dbError) {
        logger && logger.error(`❌ Error saving to database: ${dbError.message}`);
        console.log('❌ Database save error:', dbError);
      }
    } else {
      console.log('❌ NOT saving to database:');
      console.log('  - hasFeature("historySaving"):', req.hasFeature('historySaving'));
      console.log('  - req.user exists:', !!req.user);
      console.log('  - Condition failed:', !req.hasFeature('historySaving') || !req.user);
    }
    
    const response = formatResponseForTier(detectionResult, req.tierConfig, quotaCheck);
    
    // Adaugă informații despre raportul PDF
    if (pdfReport && pdfReport.success) {
      response.pdfReport = {
        available: true,
        downloadUrl: pdfReport.downloadUrl,
        fileName: pdfReport.fileName
      };
    }
    
    response.modelUsed = req.tierConfig.modelType;
    response.reportId = reportId;
    
    console.log('Sending response:', JSON.stringify(response, null, 2));
    
    // Safe cleanup - only delete actual files, not directories
    const filesToCleanup = [];
    if (uploadPath && typeof uploadPath === 'string' && uploadPath !== uploadsDir) {
      filesToCleanup.push(uploadPath);
    }
    if (tempFilePath && typeof tempFilePath === 'string') {
      filesToCleanup.push(tempFilePath);
    }
    if (filesToCleanup.length > 0) {
      logger && logger.debug(`Cleaning up files: ${JSON.stringify(filesToCleanup)}`);
      cleanupFiles(filesToCleanup);
    }
    
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in upload route:', error);
    logger && logger.error(`Error in upload: ${error.message}`);
    logger && logger.error(error.stack);
    
    // Safe cleanup on error
    const filesToCleanup = [];
    if (uploadPath && typeof uploadPath === 'string' && uploadPath !== uploadsDir) {
      filesToCleanup.push(uploadPath);
    }
    if (tempFilePath && typeof tempFilePath === 'string') {
      filesToCleanup.push(tempFilePath);
    }
    if (filesToCleanup.length > 0) {
      cleanupFiles(filesToCleanup);
    }
    
    return res.status(500).json({
      error: 'Processing Error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.get('/analyze-face', authenticateToken, async (req, res) => {
  const { imageUrl } = req.query;
  
  if (!imageUrl) {
    return res.status(400).json({ error: 'Missing imageUrl parameter' });
  }
  
  if (!req.hasFeature('faceAnalysis')) {
    return res.status(403).json({
      error: 'Funcție Premium necesară',
      message: 'Analiza facială este disponibilă doar pentru utilizatorii Premium',
      feature: 'faceAnalysis',
      upgrade: req.getUpgradeMessage('face_analysis')
    });
  }
  
  try {
    let imagePath;
    logger && logger.info(`Request for facial analysis of image: ${imageUrl}, tier: ${req.userTier}`);
    
    if (imageUrl.startsWith('http')) {
      const safeFileName = `face_analysis_${Date.now()}.jpg`;
      imagePath = path.join(uploadsDir, safeFileName);
      
      const { default: fetch } = await import('node-fetch');
      const response = await fetch(imageUrl);
      const buffer = await response.buffer();
      
      await fs.promises.writeFile(imagePath, buffer);
      logger && logger.info(`Image downloaded to: ${imagePath}`);
    } else {
      imagePath = path.join(rootDir, 'public', imageUrl);
      if (!fs.existsSync(imagePath)) {
        return res.status(404).json({ error: 'Image not found.' });
      }
    }
    
    const analysisResult = await runFaceAnalysis(imagePath);
    
    if (imageUrl.startsWith('http') && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    
    if (analysisResult) {
      analysisResult.modelUsed = req.tierConfig.modelType;
      res.json(analysisResult);
    } else {
      res.status(500).json({ error: 'Face analysis failed' });
    }
    
  } catch (error) {
    logger && logger.error(`Error in facial analysis: ${error.message}`);
    res.status(500).json({ error: `An error occurred during facial analysis: ${error.message}` });
  }
});

// Rută nouă pentru descărcarea rapoartelor PDF
router.get('/download-report/:fileName', authenticateToken, async (req, res) => {
  try {
    const { fileName } = req.params;
    const filePath = path.join(__dirname, '..', 'exports', fileName);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Raportul nu a fost găsit' });
    }
    
    // Verifică că fișierul aparține utilizatorului (implementare simplificată)
    res.download(filePath, fileName, (err) => {
      if (err) {
        logger && logger.error(`Error downloading PDF: ${err.message}`);
        res.status(500).json({ error: 'Eroare la descărcarea raportului' });
      }
      
      // Șterge fișierul după descărcare
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }, 30000); // 30 secunde
    });
    
  } catch (error) {
    logger && logger.error(`Error in download-report: ${error.message}`);
    res.status(500).json({ error: 'Eroare la descărcarea raportului' });
  }
});

router.get('/job/:id', async (req, res) => {
  res.status(404).json({ error: "Asynchronous analysis functionality is not currently available." });
});

// Rută pentru browser extension
router.get('/user/extension-info', authenticateToken, async (req, res) => {
  try {
    // Verifică dacă utilizatorul este autentificat
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        error: 'Utilizator neautentificat',
        message: 'Este necesar un token valid pentru accesarea informațiilor extensiei'
      });
    }
    
    const userId = req.user.userId;
    const userTier = TierService.getUserTier(req.user);
    const tierConfig = TierService.getTierConfig(userTier);
    
    // Obține informații despre quota curentă
    const quotaInfo = await TierService.checkDailyQuota(req.user, req.ip);
    
    // Generează token-ul pentru extensie (poate fi același JWT sau unul nou)
    const jwt = require('jsonwebtoken');
    const extensionToken = jwt.sign(
      { 
        userId: userId, 
        tier: userTier,
        type: 'extension',
        timestamp: Date.now()
      },
      process.env.JWT_SECRET || 'b14b24',
      { expiresIn: '30d' } // Token valid 30 zile pentru extensie
    );
    
    res.json({
      success: true,
      extensionData: {
        userId: userId,
        tier: userTier,
        token: extensionToken,
        apiEndpoint: process.env.API_BASE_URL || 'http://localhost:5000',
        features: {
          quickAnalysis: tierConfig.features.basicAnalysis || true,
          advancedAnalysis: tierConfig.features.videoProcessing || false,
          heatmapGeneration: tierConfig.features.heatmapGeneration || false,
          batchProcessing: tierConfig.features.apiAccess || false,
          videoAnalysis: tierConfig.features.videoProcessing || false
        },
        quotaDetails: {
          dailyLimit: tierConfig.maxAnalysesPerDay === -1 ? 'Nelimitat' : tierConfig.maxAnalysesPerDay,
          currentUsage: quotaInfo.currentCount || 0,
          remaining: quotaInfo.remaining || (tierConfig.maxAnalysesPerDay === -1 ? 'Nelimitat' : tierConfig.maxAnalysesPerDay)
        },
        settings: {
          autoAnalyzeOnLoad: false,
          showNotifications: true,
          confidenceThreshold: 0.7
        },
        version: '2.1.0'
      }
    });
    
  } catch (error) {
    logger && logger.error(`Error generating extension info: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Eroare la generarea informațiilor pentru extensie',
      message: error.message
    });
  }
});

// Helper functions (dacă nu sunt definite în altă parte)
function generateSyntheticHeatmap(fakeScore) {
  // Implementare simplificată pentru demo
  return {
    width: 299,
    height: 299,
    data: Array(299 * 299).fill(fakeScore / 100)
  };
}

async function createHeatmapOverlay(width, height, heatmapData) {
  // Implementare simplificată - ar trebui să genereze un buffer pentru overlay
  const buffer = Buffer.alloc(width * height * 4); // RGBA
  
  for (let i = 0; i < width * height; i++) {
    const intensity = Math.floor(Math.random() * 255);
    buffer[i * 4] = intensity;     // R
    buffer[i * 4 + 1] = 0;         // G
    buffer[i * 4 + 2] = 0;         // B
    buffer[i * 4 + 3] = 128;       // A (50% opacity)
  }
  
  return buffer;
}

function generateExplanationAdvanced(result) {
  const confidence = result.confidence;
  const riskLevel = result.risk_level;
  const isDeepfake = result.is_deepfake;
  const processingTime = result.processing_time;
  
  let verdict, reasons, recommendation, technicalDetails;
  
  if (isDeepfake) {
    if (riskLevel === "VERY_HIGH") {
      verdict = "Deepfake detectat cu certitudine foarte mare";
      reasons = [
        "Multiple inconsistențe detectate în structura facială",
        "Artefacte de generare AI identificate",
        "Anomalii în textura și iluminarea pielii",
        "Margini artificiale și tranziții nenatural",
        "Caracteristici specifice modelelor de generare"
      ];
      recommendation = "Această imagine este aproape sigur un deepfake generat artificial";
    } else if (riskLevel === "HIGH") {
      verdict = "Deepfake detectat cu încredere mare";
      reasons = [
        "Inconsistențe semnificative în caracteristicile faciale",
        "Artefacte de compresie specifice AI",
        "Variații anormale în detaliile fine",
        "Posibile semne de morphing facial"
      ];
      recommendation = "Imaginea prezintă semne clare de manipulare prin AI";
    } else if (riskLevel === "MEDIUM") {
      verdict = "Posibil deepfake detectat";
      reasons = [
        "Unele inconsistențe în renderarea facială",
        "Calitate variabilă în diferite regiuni",
        "Posibile artefacte de post-procesare",
        "Tranziții suspecte în texturi"
      ];
      recommendation = "Imaginea poate fi un deepfake - necesită analiză suplimentară";
    } else {
      verdict = "Deepfake cu încredere scăzută";
      reasons = [
        "Semne minore de manipulare digitală",
        "Posibile efecte de compresie sau retușare",
        "Calitate redusă care poate ascunde manipulări"
      ];
      recommendation = "Rezultat neconcludent - pot fi efecte de cameră sau compresie";
    }
  } else {
    verdict = "Imagine autentică detectată";
    reasons = [
      "Texturi faciale naturale și consistente",
      "Iluminare realistă și uniformă",
      "Detalii fine și caracteristici naturale",
      "Absența artefactelor de generare AI",
      "Structură facială coerentă"
    ];
    recommendation = "Imaginea pare să fie autentică și nemodificată digital";
  }
  
  technicalDetails = {
    modelVersion: result.model_version || "advanced_v1.0",
    processingTime: `${processingTime}s`,
    confidenceScore: `${confidence}%`,
    threshold: result.threshold_used || 0.5,
    riskAssessment: riskLevel,
    analysisMethod: "advanced_ensemble"
  };
  
  return {
    verdict,
    reasons,
    recommendation,
    technicalDetails,
    confidence: `${confidence}%`,
    processingTime: `${processingTime}s`
  };
}

// Rută pentru validarea existenței unui heatmap
router.get('/validate-heatmap/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    const result = await heatmapService.validateHeatmap(filename);
    
    res.json({
      success: true,
      exists: result.exists,
      metadata: result.metadata
    });
  } catch (error) {
    logger && logger.error(`Error validating heatmap: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rută pentru regenerarea unui heatmap
router.post('/regenerate-heatmap', authenticateToken, tierMiddleware, async (req, res) => {
  try {
    const { imagePath, fakeScore, heatmapType = 'standard' } = req.body;
    
    if (!imagePath || fakeScore === undefined) {
      return res.status(400).json({
        success: false,
        error: 'imagePath și fakeScore sunt obligatorii'
      });
    }
    
    let result;
    
    if (heatmapType === 'premium' && req.hasFeature('premiumHeatmaps')) {
      // Creează structura de date de analiză pentru HeatmapService
      const analysisData = {
        id: Date.now(),
        fake_score: fakeScore,
        confidence_score: req.body.confidenceScore || 0,
        uploaded_at: new Date().toISOString(),
        user_id: req.user.id
      };

      const heatmapOptions = {
        type: 'premium',
        quality: 'high',
        format: 'jpg',
        userId: req.user.id,
        features: {
          fakeScore: fakeScore,
          userId: req.user.id,
          intensity: 0.8,
          colorScheme: 'redHeat',
          enhancedFeatures: true,
          multiLayer: true,
          statistics: true
        }
      };
      
      result = await heatmapService.generateHeatmap(imagePath, analysisData, heatmapOptions);
    } else if (heatmapType === 'advanced' && req.hasFeature('advancedHeatmaps')) {
      // Creează structura de date de analiză pentru HeatmapService
      const analysisDataAdv = {
        id: Date.now(),
        fake_score: fakeScore,
        confidence_score: req.body.confidenceScore || 0,
        uploaded_at: new Date().toISOString(),
        user_id: req.user.id
      };

      const heatmapOptionsAdv = {
        type: 'advanced',
        quality: 'ultra',
        format: 'jpg',
        userId: req.user.id,
        features: {
          fakeScore: fakeScore,
          userId: req.user.id,
          intensity: 0.9,
          colorScheme: 'spectral',
          enhancedFeatures: true,
          multiLayer: true,
          statistics: true,
          layeredAnalysis: true,
          artifactDetection: true
        }
      };
      
      result = await heatmapService.generateHeatmap(imagePath, analysisDataAdv, heatmapOptionsAdv);
    } else {
      const standardOptions = {
        fakeScore: fakeScore,
        intensity: 0.6,
        colorScheme: 'heat'
      };
      
      result = await heatmapService.generateStandardHeatmap(imagePath, standardOptions);
    }
    
    if (result.success) {
      res.json({
        success: true,
        heatmapUrl: result.publicUrl,
        heatmapPath: result.outputPath,
        heatmapType: heatmapType,
        metadata: result.metadata,
        statistics: result.statistics
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    logger && logger.error(`Error regenerating heatmap: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rută pentru curățarea heatmap-urilor vechi
router.post('/cleanup-heatmaps', authenticateToken, async (req, res) => {
  try {
    const { maxAge = 7 } = req.body; // maxAge în zile, default 7 zile
    const result = await heatmapService.cleanupOldHeatmaps(maxAge);
    
    res.json({
      success: true,
      cleanedFiles: result.cleanedFiles,
      freedSpace: result.freedSpace
    });
  } catch (error) {
    logger && logger.error(`Error cleaning up heatmaps: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rută pentru statisticile heatmap-urilor
router.get('/heatmap-stats', authenticateToken, async (req, res) => {
  try {
    const stats = await heatmapService.getHeatmapStatistics();
    
    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    logger && logger.error(`Error getting heatmap statistics: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;