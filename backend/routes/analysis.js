const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const db = require('../db');

let logger;

router.use(function (req, res, next) {
  logger = req.app.locals.logger;
  next();
});

const uploadsDir = path.join(__dirname, '/../uploads/');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function generateSafeFileName(originalName) {
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const ext = path.extname(sanitizedName);
  const baseName = path.basename(sanitizedName, ext);
  return `${baseName}_${timestamp}${ext}`;
}

async function generateHeatmap(imagePath, fakeScore) {
  logger && logger.info(`Încercare generare heatmap pentru scor ${fakeScore}% și fișierul ${imagePath}`);
  
  if (fakeScore <= 30) {
    logger && logger.info(`Scor deepfake prea mic pentru generarea heatmap (${fakeScore}%)`);
    return null;
  }

  if (!fs.existsSync(imagePath)) {
    logger && logger.error(`Fișierul pentru generare heatmap nu există: ${imagePath}`);
    return null;
  }
  
  logger && logger.info(`Fișierul pentru heatmap există, continuă generarea`);

  try {
    const heatmapGeneratorScript = path.normalize(path.join(__dirname, '/../deepfakeDetector/heatmapGenerator.py'));
    const modelPath = path.normalize(path.join(__dirname, '/../deepfakeDetector/savedModel/model_xception.keras'));
    
    logger && logger.info(`Cale script heatmap: ${heatmapGeneratorScript}`);
    logger && logger.info(`Cale model: ${modelPath}`);
    
    if (!fs.existsSync(heatmapGeneratorScript)) {
      logger && logger.error(`Scriptul heatmapGenerator.py nu a fost găsit la calea: ${heatmapGeneratorScript}`);
      return null;
    }
    
    if (!fs.existsSync(modelPath)) {
      logger && logger.error(`Modelul pentru heatmap nu a fost găsit la calea: ${modelPath}`);
      return null;
    }
    
    const command = `python "${heatmapGeneratorScript}" "${imagePath}" "${modelPath}"`;
    logger && logger.info(`Comandă execuție heatmap: ${command}`);

    const { stdout, stderr } = await execPromise(command, { timeout: 60000 });
    
    if (stderr) {
      logger && logger.info(`Stderr la generarea heatmap: ${stderr}`);
    }
    
    if (stdout) {
      logger && logger.info(`Stdout la generarea heatmap: ${stdout}`);
    }
    
    const outputLines = stdout.trim().split('\n');
    const heatmapPath = outputLines[outputLines.length - 1];
    
    if (heatmapPath.includes("FAILED")) {
      logger && logger.error(`Eroare returnată de script: ${heatmapPath}`);
      return null;
    }
    
    logger && logger.info(`Calea heatmap returnată: ${heatmapPath}`);
    
    if (!heatmapPath || !fs.existsSync(heatmapPath)) {
      logger && logger.error(`Calea către heatmap nu există sau nu a fost returnată: ${heatmapPath}`);
      return null;
    }
    
    const heatmapFileName = path.basename(heatmapPath);
    const publicHeatmapDir = path.join(__dirname, '/../public/heatmaps');
    const publicHeatmapPath = path.join(publicHeatmapDir, heatmapFileName);
    
    logger && logger.info(`Director heatmap public: ${publicHeatmapDir}`);
    
    if (!fs.existsSync(publicHeatmapDir)) {
      logger && logger.info(`Creez directorul pentru heatmaps: ${publicHeatmapDir}`);
      fs.mkdirSync(publicHeatmapDir, { recursive: true });
    }
    
    await fs.promises.copyFile(heatmapPath, publicHeatmapPath);
    logger && logger.info(`Heatmap generat și copiat în: ${publicHeatmapPath}`);
    
    return `/heatmaps/${heatmapFileName}`;
  } catch (error) {
    logger && logger.error(`Eroare la generarea heatmap: ${error.message}`);
    logger && logger.error(error.stack);
    return null;
  }
}

async function runDeepfakeDetector(uploadPath) {
  logger && logger.info('Rulează detectorul deepfake...');
  const filePath = path.normalize(uploadPath);
  const detectorScript = path.normalize(path.join(__dirname, '/../deepfakeDetector/deepfakeDetector.py'));
  
  const command = `python "${detectorScript}" "${filePath}"`;
  
  logger && logger.info(`Comandă execuție: ${command}`);
  
  let detectionResult;
  
  try {
    const execStart = Date.now();
    try {
      const { stdout, stderr } = await execPromise(command, { timeout: 120000 });
      if (stderr) {
        logger.error(`Eroare stderr: ${stderr}`);
      }
      detectionResult = JSON.parse(stdout.trim());
    } catch (error) {
      logger.error(`Eroare la execuția scriptului: ${error.message}`);
      logger.error(`Stderr: ${error.stderr}`);
      logger.error(`Stdout: ${error.stdout}`);
      throw error;
    }
    const execDuration = Date.now() - execStart;
    logger && logger.info(`Analiză executată în ${execDuration}ms`);

    try {
      const jsonOutput = stdout.trim();
      detectionResult = JSON.parse(jsonOutput);
      logger && logger.info('Rezultat parsare JSON reușit');
      
      if (detectionResult.error && detectionResult.model_missing) {
        logger && logger.error('Modelul nu a fost găsit:', detectionResult.error);
        return { 
          error: detectionResult.error,
          model_missing: true
        };
      }
    } catch (parseError) {
      logger && logger.error(`Eroare la parsarea rezultatului JSON: ${parseError}`);
      logger && logger.error(`Răspuns stdout original: ${stdout}`);
      throw parseError;
    }
  } catch (execError) {
    logger && logger.error('Eroare la execuția scriptului:', execError);
    logger && logger.error('Cod eroare:', execError.code);
    logger && logger.error('Stderr:', execError.stderr);
    return { 
      error: 'Eroare la execuția analizei. Contactați administratorul sistemului.',
      technical_details: execError.message
    };
  }

  if (detectionResult.error) {
    logger && logger.error('Eroare în rezultatul detector:', detectionResult.error);
    return { error: detectionResult.error };
  }

  detectionResult.fileName = path.basename(uploadPath);

  logger && logger.info(`Rezultat analiză: Fake Score=${detectionResult.fake_score}%, Confidence=${detectionResult.confidence_score}%, IsDeepfake=${detectionResult.is_deepfake}`);
  
  let heatmapUrl = null;
  if (/\.(jpg|jpeg|png)$/i.test(uploadPath) && detectionResult.fake_score > 30) {
    try {
      logger && logger.info(`Începe generarea heatmap pentru scor: ${detectionResult.fake_score}`);
      heatmapUrl = await generateHeatmap(filePath, detectionResult.fake_score);
      if (heatmapUrl) {
        logger && logger.info(`Heatmap generat cu succes: ${heatmapUrl}`);
        detectionResult.heatmapUrl = heatmapUrl;
      } else {
        logger && logger.error('Generarea heatmap a eșuat sau a returnat null');
      }
    } catch (heatmapError) {
      logger && logger.error(`Eroare la generarea heatmap: ${heatmapError.message}`);
      logger && logger.error(heatmapError.stack);
    }
  }

  try {
    const permanentUploadDir = path.join(__dirname, '/../public/uploads/');
    if (!fs.existsSync(permanentUploadDir)) {
      fs.mkdirSync(permanentUploadDir, { recursive: true });
    }
    
    const permanentFileName = `${path.basename(uploadPath)}`;
    const permanentFilePath = path.join(permanentUploadDir, permanentFileName);
    
    await fs.promises.copyFile(uploadPath, permanentFilePath);
    logger && logger.info(`Fișierul a fost copiat în locația permanentă: ${permanentFilePath}`);
    
    const relativePath = `/uploads/${permanentFileName}`;
    
    let relativeHeatmapPath = null;
    if (heatmapUrl) {
      relativeHeatmapPath = heatmapUrl;
    }
    
    const sql = `INSERT INTO reports (file_name, detection_result, confidence_score, fake_score, user_id, uploaded_at, image_path, heatmap_path) 
               VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`;
    await db.execute(sql, [
      path.basename(uploadPath),
      JSON.stringify(detectionResult), 
      detectionResult.confidence_score || null,  
      detectionResult.fake_score || null,
      null,
      relativePath,
      relativeHeatmapPath
    ]);
    logger && logger.info('Rezultatul a fost salvat în baza de date.');
  } catch (dbError) {
    logger && logger.error(`Eroare la salvarea în baza de date: ${dbError.message}`);
    logger && logger.error(dbError);
  }

  return {
    success: true,
    detectionResult: {
      fileName: path.basename(uploadPath),
      fakeScore: detectionResult.fake_score,
      confidenceScore: detectionResult.confidence_score,
      isDeepfake: detectionResult.is_deepfake,
      processingTime: detectionResult.processing_time || 0,
      analysisTime: detectionResult.analysis_time,
      debugInfo: detectionResult.debug_info,
      heatmapUrl: heatmapUrl
    }
  };
}

router.post('/upload', async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).json({ error: 'Niciun fișier încărcat.' });
  }

  const mediaFile = req.files.video || req.files.media || req.files.file;
  if (!mediaFile) {
    return res.status(400).json({ error: 'Fișierul trebuie trimis cu numele "video", "media" sau "file".' });
  }

  try {
    const safeFileName = generateSafeFileName(mediaFile.name);
    const uploadPath = path.join(uploadsDir, safeFileName);
    await mediaFile.mv(uploadPath);

    const detectionResult = await runDeepfakeDetector(uploadPath);
    res.status(200).json(detectionResult);
  } catch (error) {
    res.status(500).json({ error: 'Eroare la procesarea fișierului.' });
  }
});

router.post('/uploadImage', async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    logger && logger.warn('Nicio imagine primită în cerere.');
    return res.status(400).json({ error: 'Nicio imagine încărcată.' });
  }

  const imageFile = req.files.image;
  const safeFileName = generateSafeFileName(imageFile.name);
  const uploadPath = path.join(uploadsDir, safeFileName);
  const userId = req.body.userId || null;

  logger && logger.info(`Imagine primită: ${imageFile.name} (salvat ca ${safeFileName}), dimensiune: ${imageFile.size} bytes, tip: ${imageFile.mimetype}, de la utilizatorul: ${userId}`);

  try {
    await imageFile.mv(uploadPath);
    logger && logger.info(`Imaginea a fost mutată cu succes la: ${uploadPath}`);

    if (!/\.(jpg|jpeg|png)$/i.test(imageFile.name)) {
      logger && logger.warn(`Format de imagine neacceptat: ${imageFile.name}`);
      fs.unlinkSync(uploadPath);
      return res.status(400).json({ 
        error: 'Format de imagine neacceptat. Sunt acceptate doar formatele jpg, jpeg și png.' 
      });
    }

    logger && logger.info('Rulează detectorul deepfake...');
    const filePath = path.normalize(uploadPath);
    const detectorScript = path.normalize(path.join(__dirname, '/../deepfakeDetector/deepfakeDetector.py'));
    const command = `python "${detectorScript}" "${filePath}"`;
    
    logger && logger.info(`Comandă execuție: ${command}`);
    
    let detectionResult;
    
    try {
      const execStart = Date.now();
      try {
        const { stdout, stderr } = await execPromise(command, { timeout: 120000 });
        if (stderr) {
          logger.error(`Eroare stderr: ${stderr}`);
        }
        detectionResult = JSON.parse(stdout.trim());
      } catch (error) {
        logger.error(`Eroare la execuția scriptului: ${error.message}`);
        logger.error(`Stderr: ${error.stderr}`);
        logger.error(`Stdout: ${error.stdout}`);
        throw error;
      }
      const execDuration = Date.now() - execStart;
      logger && logger.info(`Analiză executată în ${execDuration}ms`);

      try {
        const jsonOutput = stdout.trim();
        detectionResult = JSON.parse(jsonOutput);
        logger && logger.info('Rezultat parsare JSON reușit');
        
        if (detectionResult.error && detectionResult.model_missing) {
          logger && logger.error('Modelul nu a fost găsit:', detectionResult.error);
          return res.status(500).json({ 
            error: detectionResult.error,
            model_missing: true
          });
        }
      } catch (parseError) {
        logger && logger.error(`Eroare la parsarea rezultatului JSON: ${parseError}`);
        logger && logger.error(`Răspuns stdout original: ${stdout}`);
        throw parseError;
      }
    } catch (error) {
      logger && logger.error(`Eroare la procesarea imaginii: ${error.message}`);
      return res.status(500).json({ 
        error: 'Eroare la procesarea imaginii. Contactați administratorul sistemului.',
        technical_details: error.message
      });
    }

    if (detectionResult.error) {
      logger && logger.error('Eroare în rezultatul detector:', detectionResult.error);
      return res.status(500).json({ error: detectionResult.error });
    }

    detectionResult.fileName = imageFile.name;

    let heatmapUrl = null;
    if (detectionResult.fake_score > 30) {
      try {
        logger && logger.info(`Începe generarea heatmap pentru scor: ${detectionResult.fake_score}`);
        heatmapUrl = await generateHeatmap(filePath, detectionResult.fake_score);
        if (heatmapUrl) {
          logger && logger.info(`Heatmap generat cu succes: ${heatmapUrl}`);
          detectionResult.heatmapUrl = heatmapUrl;
        } else {
          logger && logger.error('Generarea heatmap a eșuat sau a returnat null');
        }
      } catch (heatmapError) {
        logger && logger.error(`Eroare la generarea heatmap: ${heatmapError.message}`);
        logger && logger.error(heatmapError.stack);
      }
    }

    try {
      const permanentUploadDir = path.join(__dirname, '/../public/uploads/');
      if (!fs.existsSync(permanentUploadDir)) {
        fs.mkdirSync(permanentUploadDir, { recursive: true });
      }
      
      const permanentFileName = `${path.basename(uploadPath)}`;
      const permanentFilePath = path.join(permanentUploadDir, permanentFileName);
      
      await fs.promises.copyFile(uploadPath, permanentFilePath);
      logger && logger.info(`Fișierul a fost copiat în locația permanentă: ${permanentFilePath}`);
      
      const relativePath = `/uploads/${permanentFileName}`;
      
      let relativeHeatmapPath = null;
      if (heatmapUrl) {
        relativeHeatmapPath = heatmapUrl;
      }
      
      const sql = `INSERT INTO reports (file_name, detection_result, confidence_score, fake_score, user_id, uploaded_at, image_path, heatmap_path) 
                 VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`;
      await db.execute(sql, [
        imageFile.name,
        JSON.stringify(detectionResult), 
        detectionResult.confidence_score || null,  
        detectionResult.fake_score || null,
        userId,
        relativePath,
        relativeHeatmapPath
      ]);
      logger && logger.info('Rezultatul a fost salvat în baza de date.');
    } catch (dbError) {
      logger && logger.error(`Eroare la salvarea în baza de date: ${dbError.message}`);
      logger && logger.error(dbError);
    }

    res.json({
      success: true,
      detectionResult: {
        fileName: imageFile.name,
        fakeScore: detectionResult.fake_score,
        confidenceScore: detectionResult.confidence_score,
        isDeepfake: detectionResult.is_deepfake,
        processingTime: detectionResult.processing_time || 0,
        analysisTime: detectionResult.analysis_time,
        debugInfo: detectionResult.debug_info,
        heatmapUrl: heatmapUrl
      }
    });

  } catch (error) {
    logger && logger.error(`Eroare la procesarea imaginii: ${error.message}`);
    res.status(500).json({ error: `A apărut o eroare la procesarea imaginii: ${error.message}` });
  } finally {
    logger && logger.info(`Tentativă de ștergere a fișierului după procesare: ${uploadPath}`);
    if (fs.existsSync(uploadPath)) {
      fs.unlink(uploadPath, (err) => {
        if (err) {
          logger && logger.error(`Eroare la ștergerea fișierului temporar: ${err.message}`);
        } else {
          logger && logger.info('Fișierul temporar a fost șters cu succes.');
        }
      });
    }
  }
});

router.get('/job/:id', async (req, res) => {
  const jobId = req.params.id;
  
  try {
    res.status(404).json({ error: "Funcționalitatea de analiză asincronă nu este disponibilă momentan." });
  } catch (error) {
    res.status(500).json({ error: `Eroare la obținerea statusului job-ului: ${error.message}` });
  }
});

module.exports = router;