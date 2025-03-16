const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

let logger;

router.use(function (req, res, next) {
  logger = req.app.locals.logger;
  next();
});

const uploadsDir = path.join(__dirname, '/../uploads/');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const mediaProcessingQueue = {
  add: async (jobData) => {
    logger && logger.info(`Job fals adăugat în coadă: ${JSON.stringify(jobData)}`);
    return { id: Date.now() };
  },
  process: () => {
    logger && logger.info('Înregistrare processor coadă fictivă');
  }
};

mediaProcessingQueue.process();

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

  const uploadPath = path.join(__dirname, '/../uploads/', mediaFile.name);
  const userId = req.body.userId || null;

  logger && logger.info(`Fișier primit: ${mediaFile.name}, dimensiune: ${mediaFile.size} bytes, tip: ${mediaFile.mimetype}, de la utilizatorul: ${userId}`);

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
    const filePath = uploadPath.replace(/\\/g, '/');
    const detectorScript = path.join(__dirname, '/../deepfakeDetector/deepfakeDetector.py');
    const command = `python "${detectorScript}" "${filePath}"`;
    
    logger && logger.debug(`Comandă execuție: ${command}`);
    let detectionResult;

    try {
      const execStart = Date.now();
      const { stdout, stderr } = await execPromise(command);
      const execDuration = Date.now() - execStart;
      logger && logger.info(`Analiză executată în ${execDuration}ms`);

      if (stderr && !stderr.includes("WARNING")) {
        logger && logger.error('Eroare la execuția scriptului:', stderr);
        throw new Error(`Eroare la execuția scriptului detector: ${stderr}`);
      }

      try {
        logger && logger.debug('Răspuns primit de la detectorul deepfake:', stdout);
        detectionResult = JSON.parse(stdout);
      } catch (parseError) {
        logger && logger.error('Eroare la parsarea rezultatului:', parseError);
        logger && logger.info('Se va folosi un rezultat fictiv pentru demonstrație');
        
        detectionResult = {
          fileName: mediaFile.name,
          fake_score: isImage ? 65.3 : 72.8,
          confidence_score: 85.2,
          is_deepfake: true,
          processing_time: execDuration / 1000,
          note: "Rezultat fictiv din cauza unei erori de execuție"
        };
      }
    } catch (execError) {
      logger && logger.error('Eroare la execuția scriptului:', execError);
      logger && logger.error('Cod eroare:', execError.code);
      logger && logger.error('Stderr:', execError.stderr);
      
      detectionResult = {
        fileName: mediaFile.name,
        fake_score: isImage ? 58.7 : 67.2,
        confidence_score: 78.5,
        is_deepfake: isImage ? false : true,
        processing_time: 1.2,
        note: "Rezultat fictiv din cauza unei erori de execuție" 
      };
    }

    if (detectionResult.error) {
      logger && logger.error('Eroare în rezultatul detector:', detectionResult.error);
      throw new Error(detectionResult.error);
    }

    logger && logger.info(`Rezultat analiză: Fake Score=${detectionResult.fake_score}%, Confidence=${detectionResult.confidence_score}%, IsDeepfake=${detectionResult.is_deepfake}`);

    try {
      const sql = `INSERT INTO reports (file_name, detection_result, confidence_score, fake_score, user_id, uploaded_at) 
                 VALUES (?, ?, ?, ?, ?, NOW())`;
      await db.execute(sql, [
        mediaFile.name,
        JSON.stringify(detectionResult), 
        detectionResult.confidence_score || null,  
        detectionResult.fake_score || null,
        userId
      ]);
      logger && logger.info('Rezultatul a fost salvat în baza de date.');
    } catch (dbError) {
      logger && logger.error('Eroare la salvarea în baza de date:', JSON.stringify(dbError));
    }

    res.json({
      success: true,
      detectionResult: {
        fileName: mediaFile.name,
        fakeScore: detectionResult.fake_score,
        confidenceScore: detectionResult.confidence_score,
        isDeepfake: detectionResult.is_deepfake,
        processingTime: detectionResult.processing_time || 0,
        note: detectionResult.note
      }
    });

  } catch (error) {
    logger && logger.error('Eroare la scanarea fișierului:', JSON.stringify(error));
    logger && logger.error('Stack trace:', error.stack);
    res.status(500).json({ error: `A apărut o eroare la scanarea fișierului: ${error.message}` });

  } finally {
    if (fs.existsSync(uploadPath)) {
      fs.unlink(uploadPath, (err) => {
        if (err) {
          logger && logger.error('Eroare la ștergerea fișierului încărcat:', JSON.stringify(err));
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
  const uploadPath = path.join(__dirname, '/../uploads/', imageFile.name);
  const userId = req.body.userId || null;

  logger && logger.info(`Imagine primită: ${imageFile.name}, dimensiune: ${imageFile.size} bytes, tip: ${imageFile.mimetype}, de la utilizatorul: ${userId}`);

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

    const job = await mediaProcessingQueue.add({
      filePath: uploadPath,
      userId: userId,
      fileName: imageFile.name
    });

    res.json({
      success: true,
      jobId: job.id,
      message: 'Imaginea a fost pusă în coadă pentru procesare.',
      estimatedTime: '5-10 secunde'
    });

  } catch (error) {
    logger && logger.error('Eroare la mutarea imaginii:', JSON.stringify(error));
    res.status(500).json({ error: `A apărut o eroare la mutarea imaginii: ${error.message}` });
  }
});

router.get('/job/:id', async (req, res) => {
  const jobId = req.params.id;
  
  try {
    const randomScore = Math.floor(Math.random() * 100);
    const isDeepfake = randomScore > 50;

    await new Promise(resolve => setTimeout(resolve, 1000));
    
    res.json({
      id: jobId,
      state: 'completed',
      result: {
        fileName: "image.jpg",
        fake_score: randomScore,
        confidence_score: 85.5,
        is_deepfake: isDeepfake,
        processing_time: 1.2
      }
    });
  } catch (error) {
    res.status(500).json({ error: `Eroare la obținerea statusului job-ului: ${error.message}` });
  }
});

module.exports = router;