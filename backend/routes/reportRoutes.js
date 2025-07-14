const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

let logger;

router.use((req, res, next) => {
  logger = req.app.locals.logger;
  next();
});

router.post('/report', async (req, res) => {
  const { fileName, detectionResult, confidenceScore, fakeScore, userId, filePath } = req.body;

  logger && logger.info(`Cerere de creare raport: fileName=${fileName}, userId=${userId}, fakeScore=${fakeScore}`);

  try {
    if (!fileName || !detectionResult || !fakeScore || !userId || !filePath) {
      logger && logger.warn('Cerere invalidă: câmpuri obligatorii lipsă');
      return res.status(400).json({ 
        message: 'Toate câmpurile sunt obligatorii: fileName, detectionResult, fakeScore, userId și filePath.' 
      });
    }

    const sql = `
      INSERT INTO reports (file_name, detection_result, confidence_score, fake_score, user_id, image_path, uploaded_at) 
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `;
    
    const [result] = await db.execute(sql, [
      fileName, 
      JSON.stringify(detectionResult), 
      confidenceScore, 
      fakeScore, 
      userId, 
      filePath
    ]);
    
    logger && logger.info(`Raport creat cu succes: ID=${result.insertId}`);
    res.status(201).json({ message: 'Raportul a fost salvat cu succes', reportId: result.insertId });
  } catch (error) {
    logger && logger.error('Eroare la salvarea raportului:', error);
    res.status(500).json({ message: 'A apărut o eroare la salvarea raportului.', error: error.message });
  }
});

router.get('/reports', async (req, res) => {
  logger && logger.info('Cerere pentru obținerea tuturor rapoartelor');

  try {
    const [rows] = await db.execute('SELECT * FROM reports ORDER BY uploaded_at DESC');
    
    logger && logger.info(`S-au găsit ${rows.length} rapoarte`);
    res.status(200).json(rows);
  } catch (error) {
    logger && logger.error('Eroare la obținerea rapoartelor:', error);
    res.status(500).json({ message: 'A apărut o eroare la obținerea rapoartelor.', error: error.message });
  }
});

router.get('/reports/user/:userId', async (req, res) => {
  const { userId } = req.params;
  
  logger && logger.info(`Cerere pentru obținerea rapoartelor utilizatorului: userId=${userId}`);

  try {
    const [rows] = await db.execute('SELECT * FROM reports WHERE user_id = ? ORDER BY uploaded_at DESC', [userId]);
    
    logger && logger.info(`S-au găsit ${rows.length} rapoarte pentru utilizatorul ${userId}`);
    res.status(200).json(rows);
  } catch (error) {
    logger && logger.error(`Eroare la obținerea rapoartelor pentru user_id ${userId}:`, error);
    res.status(500).json({ message: 'A apărut o eroare la obținerea rapoartelor pentru utilizator.', error: error.message });
  }
});

// Adaugă această rută pentru istoricul utilizatorului
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const [reports] = await db.execute(`
      SELECT 
        id,
        file_name,
        fake_score,
        confidence_score,
        uploaded_at,
        image_path,
        heatmap_path,
        is_deepfake,
        model_type,
        processing_time
      FROM reports 
      WHERE user_id = ? 
      ORDER BY uploaded_at DESC 
      LIMIT 50
    `, [userId]);
    
    res.json({
      success: true,
      reports: reports
    });
    
  } catch (error) {
    logger && logger.error(`Error fetching user history: ${error.message}`);
    res.status(500).json({
      error: 'Database Error',
      message: 'Nu s-a putut încărca istoricul'
    });
  }
});

module.exports = router;