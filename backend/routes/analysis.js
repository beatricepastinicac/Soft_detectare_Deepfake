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

router.post('/upload', async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    logger && logger.warn('Niciun fișier primit în cerere.');
    return res.status(400).json({ error: 'Niciun fișier încărcat.' });
  }

  const mediaFile = req.files.video || req.files.media || req.files.file;
  if (!mediaFile) {
    logger && logger.warn('Fișierul trebuie trimis cu numele "video", "media" sau "file".');
    return res.status(400).json({ error: 'Fișierul trebuie trimis cu numele "video", "media" sau "file".' });
  }

  const safeFileName = generateSafeFileName(mediaFile.name);
  const uploadPath = path.join(uploadsDir, safeFileName);
  const originalFileName = mediaFile.name;
  const userId = req.body.userId || null;

  logger && logger.info(`Fișier primit: ${mediaFile.name} (salvat ca ${safeFileName}), dimensiune: ${mediaFile.size} bytes, tip: ${mediaFile.mimetype}, de la utilizatorul: ${userId}`);

  try {
    await mediaFile.mv(uploadPath);
    logger && logger.info(`Fișierul a fost mutat cu succes la: ${uploadPath}`);

    const isVideo = /\.(mp4|avi|mov|mkv)$/i.test(mediaFile.name);
    const isImage = /\.(jpg|jpeg|png)$/i.test(mediaFile.name);

    if (!isVideo && !isImage) {
      logger && logger.warn(`Format de fișier neacceptat: ${mediaFile.name}`);
      fs.unlinkSync(uploadPath);
      return res.status(400).json({ 
        error: 'Format de fișier neacceptat. Sunt acceptate doar videoclipuri (mp4, avi, mov, mkv) și imagini (jpg, jpeg, png).' 
      });
    }

    try {
      fs.accessSync(uploadPath, fs.constants.R_OK);
      logger && logger.info(`Fișier salvat: ${uploadPath}, dimensiune: ${mediaFile.size} bytes`);
      logger && logger.info(`Fișierul are permisiuni de citire`);
    } catch (err) {
      logger && logger.error(`Eroare la verificarea permisiunilor fișierului: ${err}`);
      return res.status(500).json({ error: `Nu se poate accesa fișierul încărcat: ${err.message}` });
    }

    logger && logger.info('Rulează detectorul deepfake...');
    const filePath = path.normalize(uploadPath);
    const detectorScript = path.normalize(path.join(__dirname, '/../deepfakeDetector/deepfakeDetector.py'));
    
    const command = `python "${detectorScript}" "${filePath}"`;
    
    logger && logger.info(`Comandă execuție: ${command}`);
    
    let detectionResult;
    
    try {
      const execStart = Date.now();
      const { stdout, stderr } = await execPromise(command, { timeout: 120000 });
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
    } catch (execError) {
      logger && logger.error('Eroare la execuția scriptului:', execError);
      logger && logger.error('Cod eroare:', execError.code);
      logger && logger.error('Stderr:', execError.stderr);
      return res.status(500).json({ 
        error: 'Eroare la execuția analizei. Contactați administratorul sistemului.',
        technical_details: execError.message
      });
    }

    if (detectionResult.error) {
      logger && logger.error('Eroare în rezultatul detector:', detectionResult.error);
      return res.status(500).json({ error: detectionResult.error });
    }

    detectionResult.fileName = originalFileName;

    logger && logger.info(`Rezultat analiză: Fake Score=${detectionResult.fake_score}%, Confidence=${detectionResult.confidence_score}%, IsDeepfake=${detectionResult.is_deepfake}`);

    try {
      const sql = `INSERT INTO reports (file_name, detection_result, confidence_score, fake_score, user_id, uploaded_at) 
                 VALUES (?, ?, ?, ?, ?, NOW())`;
      await db.execute(sql, [
        originalFileName,
        JSON.stringify(detectionResult), 
        detectionResult.confidence_score || null,  
        detectionResult.fake_score || null,
        userId
      ]);
      logger && logger.info('Rezultatul a fost salvat în baza de date.');
    } catch (dbError) {
      logger && logger.error(`Eroare la salvarea în baza de date: ${dbError.message}`);
      logger && logger.error(dbError);
    }

    res.json({
      success: true,
      detectionResult: {
        fileName: originalFileName,
        fakeScore: detectionResult.fake_score,
        confidenceScore: detectionResult.confidence_score,
        isDeepfake: detectionResult.is_deepfake,
        processingTime: detectionResult.processing_time || 0,
        analysisTime: detectionResult.analysis_time,
        debugInfo: detectionResult.debug_info
      }
    });

  } catch (error) {
    logger && logger.error(`Eroare la scanarea fișierului: ${error.message}`);
    logger && logger.error('Stack trace:', error.stack);
    res.status(500).json({ error: `A apărut o eroare la scanarea fișierului: ${error.message}` });

  } finally {
    if (fs.existsSync(uploadPath)) {
      fs.unlink(uploadPath, (err) => {
        if (err) {
          logger && logger.error(`Eroare la ștergerea fișierului încărcat: ${err.message}`);
        } else {
          logger && logger.info('Fișierul a fost șters cu succes.');
        }
      });
    }
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
      const { stdout, stderr } = await execPromise(command, { timeout: 120000 });
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

    try {
      const sql = `INSERT INTO reports (file_name, detection_result, confidence_score, fake_score, user_id, uploaded_at) 
                 VALUES (?, ?, ?, ?, ?, NOW())`;
      await db.execute(sql, [
        imageFile.name,
        JSON.stringify(detectionResult), 
        detectionResult.confidence_score || null,  
        detectionResult.fake_score || null,
        userId
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
        debugInfo: detectionResult.debug_info
      }
    });

  } catch (error) {
    logger && logger.error(`Eroare la procesarea imaginii: ${error.message}`);
    res.status(500).json({ error: `A apărut o eroare la procesarea imaginii: ${error.message}` });
  } finally {
    if (fs.existsSync(uploadPath)) {
      fs.unlink(uploadPath, (err) => {
        if (err) {
          logger && logger.error(`Eroare la ștergerea fișierului încărcat: ${err.message}`);
        } else {
          logger && logger.info('Fișierul a fost șters cu succes.');
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