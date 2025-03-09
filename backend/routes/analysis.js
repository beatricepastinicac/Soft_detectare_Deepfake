const express = require('express');
const router = express.Router();
const db = require('../db');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const Queue = require('bull');
const execPromise = promisify(exec);

let logger;

router.once('mount', function(parent) {
  logger = parent.locals.logger;
});

const uploadsDir = path.join(__dirname, '/../uploads/');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const mediaProcessingQueue = new Queue('media-processing', {
  redis: {
    host: 'localhost',
    port: 6379
  }
});

/**
 * @swagger
 * /api/analysis/upload:
 *   post:
 *     summary: Analizează un fișier pentru deepfake
 *     description: Încarcă și analizează o imagine sau un videoclip pentru a detecta deepfake
 *     tags:
 *       - Analiză
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *                 description: Fișierul media (imagine sau video)
 *               userId:
 *                 type: string
 *                 description: ID-ul utilizatorului (opțional)
 *     responses:
 *       200:
 *         description: Analiză completată cu succes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 detectionResult:
 *                   type: object
 *                   properties:
 *                     fileName:
 *                       type: string
 *                       example: test.jpg
 *                     fakeScore:
 *                       type: number
 *                       example: 85.7
 *                     confidenceScore:
 *                       type: number
 *                       example: 95.2
 *                     isDeepfake:
 *                       type: boolean
 *                       example: true
 *                     processingTime:
 *                       type: number
 *                       example: 1.5
 *       400:
 *         description: Cerere invalidă
 *       500:
 *         description: Eroare de server
 */
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

    logger && logger.info('Rulează detectorul deepfake...');
    const filePath = uploadPath.replace(/\\/g, '/');
    const detectorScript = path.join(__dirname, '/../deepfakeDetector/deepfake_detector.py');
    const command = `python "${detectorScript}" "${filePath}"`;
    
    logger && logger.debug(`Comandă execuție: ${command}`);
    const execStart = Date.now();
    const { stdout, stderr } = await execPromise(command);
    const execDuration = Date.now() - execStart;
    logger && logger.info(`Analiză executată în ${execDuration}ms`);

    if (stderr && !stderr.includes("WARNING")) {
      logger && logger.error('Eroare la rularea detectorului deepfake:', stderr);
      throw new Error('A apărut o eroare la rularea detectorului deepfake.');
    }

    logger && logger.debug('Răspuns primit de la detectorul deepfake:', stdout);
    const detectionResult = JSON.parse(stdout);

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
      logger && logger.error('Eroare la salvarea în baza de date:', dbError);
    }

    res.json({
      success: true,
      detectionResult: {
        fileName: mediaFile.name,
        fakeScore: detectionResult.fake_score,
        confidenceScore: detectionResult.confidence_score,
        isDeepfake: detectionResult.is_deepfake,
        processingTime: detectionResult.processing_time || 0
      }
    });

  } catch (error) {
    logger && logger.error('Eroare la scanarea fișierului: ', error.message, error.stack);
    res.status(500).json({ error: `A apărut o eroare la scanarea fișierului: ${error.message}` });

  } finally {
    if (fs.existsSync(uploadPath)) {
      fs.unlink(uploadPath, (err) => {
        if (err) {
          logger && logger.error('Eroare la ștergerea fișierului încărcat:', err);
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
    logger && logger.error('Eroare la mutarea imaginii: ', error.message);
    res.status(500).json({ error: `A apărut o eroare la mutarea imaginii: ${error.message}` });
  }
});

mediaProcessingQueue.process(async (job) => {
  const { filePath, userId, fileName } = job.data;
  
  try {
    const { stdout, stderr } = await execPromise(`python "${path.join(__dirname, '/../deepfakeDetector/deepfake_detector.py')}" "${filePath}"`);
    
    if (stderr && !stderr.includes("WARNING")) {
      logger && logger.error('Eroare la rularea detectorului deepfake:', stderr);
      throw new Error('A apărut o eroare la rularea detectorului deepfake.');
    }

    const detectionResult = JSON.parse(stdout);

    if (detectionResult.error) {
      logger && logger.error('Eroare în rezultatul detector:', detectionResult.error);
      throw new Error(detectionResult.error);
    }

    const isImage = /\.(jpg|jpeg|png)$/i.test(fileName);
    if (isImage && detectionResult.fake_score > 30) {
      try {
        const modelPath = path.join(__dirname, '/../deepfakeDetector/savedModel/model_xception.keras');
        const heatmapResult = await execPromise(`python "${path.join(__dirname, '/../deepfakeDetector/heatmap_generator.py')}" "${filePath}" "${modelPath}"`);
        
        if (heatmapResult.stdout) {
          const heatmapPath = heatmapResult.stdout.trim();
          const heatmapFileName = path.basename(heatmapPath);
          const publicHeatmapPath = path.join(__dirname, '/../public/heatmaps/', heatmapFileName);
          
          await fs.promises.mkdir(path.dirname(publicHeatmapPath), { recursive: true });
          await fs.promises.copyFile(heatmapPath, publicHeatmapPath);
          
          detectionResult.heatmapUrl = `/heatmaps/${heatmapFileName}`;
        }
      } catch (heatmapError) {
        logger && logger.error('Eroare la generarea heatmap-ului:', heatmapError);
      }
    }

    const isVideo = /\.(mp4|avi|mov|mkv)$/i.test(fileName);
    if (isVideo) {
      try {
        const audioAnalysisCommand = `python "${path.join(__dirname, '/../deepfakeDetector/audio_analyzer.py')}" "${filePath}"`;
        const audioResult = await execPromise(audioAnalysisCommand);
        
        if (audioResult.stdout) {
          const audioAnalysis = JSON.parse(audioResult.stdout);
          
          if (!audioAnalysis.error) {
            const videoScore = detectionResult.fake_score;
            const audioScore = audioAnalysis.audio_fake_score;
            const combinedScore = (videoScore * 0.7) + (audioScore * 0.3);
            
            detectionResult.original_fake_score = videoScore;
            detectionResult.audio_fake_score = audioScore;
            detectionResult.fake_score = combinedScore;
            detectionResult.audio_features = audioAnalysis.features;
          } else {
            logger && logger.warn('Avertisment la analiza audio:', audioAnalysis.error);
            detectionResult.audio_error = audioAnalysis.error;
          }
        }
      } catch (audioError) {
        logger && logger.error('Eroare la analiza audio:', audioError);
      }
    }

    try {
      const sql = `INSERT INTO reports (file_name, detection_result, confidence_score, fake_score, user_id, uploaded_at) 
                   VALUES (?, ?, ?, ?, ?, NOW())`;
      await db.execute(sql, [
        fileName,
        JSON.stringify(detectionResult), 
        detectionResult.confidence_score || null,  
        detectionResult.fake_score || null,
        userId
      ]);
      logger && logger.info('Rezultatul a fost salvat în baza de date.');
    } catch (dbError) {
      console.error('Eroare la salvarea în baza de date:', dbError);
    }

    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) console.error('Eroare la ștergerea fișierului încărcat:', err);
        else console.log('Fișierul a fost șters cu succes.');
      });
    }

    return detectionResult;

  } catch (error) {
    logger && logger.error('Eroare la procesarea job-ului:', error);
    throw error;
  }
});

router.get('/job/:id', async (req, res) => {
  const jobId = req.params.id;
  
  try {
    const job = await mediaProcessingQueue.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job-ul nu a fost găsit.' });
    }
    
    const state = await job.getState();
    const result = job.returnvalue;
    
    res.json({
      id: job.id,
      state,
      result: state === 'completed' ? result : null
    });
  } catch (error) {
    res.status(500).json({ error: `Eroare la obținerea statusului job-ului: ${error.message}` });
  }
});

module.exports = router;