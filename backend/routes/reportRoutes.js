const express = require('express');
const router = express.Router();
const db = require('../db');

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
      INSERT INTO reports (file_name, detection_result, confidence_score, fake_score, user_id, file_path, uploaded_at) 
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `;
    const result = await db.promise().execute(sql, [
      fileName, 
      JSON.stringify(detectionResult), 
      confidenceScore, 
      fakeScore, 
      userId, 
      filePath
    ]);
    
    logger && logger.info(`Raport creat cu succes: ID=${result[0].insertId}`);
    res.status(201).json({ message: 'Raportul a fost salvat cu succes' });
  } catch (error) {
    logger && logger.error('Eroare la salvarea raportului:', error);
    res.status(500).json({ message: 'A apărut o eroare la salvarea raportului.', error });
  }
});

router.get('/reports', async (req, res) => {
  logger && logger.info('Cerere pentru obținerea tuturor rapoartelor');

  try {
    const [rows] = await db.promise().execute('SELECT * FROM reports');
    
    if (rows.length === 0) {
      logger && logger.info('Nu s-au găsit rapoarte');
      return res.status(404).json({ message: 'Nu s-au găsit rapoarte.' });
    }
    
    logger && logger.info(`S-au găsit ${rows.length} rapoarte`);
    res.status(200).json(rows);
  } catch (error) {
    logger && logger.error('Eroare la obținerea rapoartelor:', error);
    res.status(500).json({ message: 'A apărut o eroare la obținerea rapoartelor.', error });
  }
});

router.get('/reports/user/:userId', async (req, res) => {
  const { userId } = req.params;
  
  logger && logger.info(`Cerere pentru obținerea rapoartelor utilizatorului: userId=${userId}`);

  try {
    const [rows] = await db.promise().execute('SELECT * FROM reports WHERE user_id = ?', [userId]);
    
    if (rows.length === 0) {
      logger && logger.info(`Nu s-au găsit rapoarte pentru utilizatorul ${userId}`);
      return res.status(404).json({ message: 'Nu s-au găsit rapoarte pentru acest utilizator.' });
    }
    
    logger && logger.info(`S-au găsit ${rows.length} rapoarte pentru utilizatorul ${userId}`);
    res.status(200).json(rows);
  } catch (error) {
    logger && logger.error(`Eroare la obținerea rapoartelor pentru user_id ${userId}:`, error);
    res.status(500).json({ message: 'A apărut o eroare la obținerea rapoartelor pentru utilizator.', error });
  }
});

module.exports = router;
