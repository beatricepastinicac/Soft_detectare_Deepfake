const express = require('express');
const router = express.Router();
const db = require('../db');


router.post('/report', async (req, res) => {
  const { fileName, detectionResult, confidenceScore, fakeScore, userId, filePath } = req.body;

  try {
    if (!fileName || !detectionResult || !fakeScore || !userId || !filePath) {
      return res.status(400).json({ 
        message: 'Toate câmpurile sunt obligatorii: fileName, detectionResult, fakeScore, userId și filePath.' 
      });
    }

    
    const sql = `
      INSERT INTO reports (file_name, detection_result, confidence_score, fake_score, user_id, file_path, uploaded_at) 
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `;
    await db.promise().execute(sql, [fileName, JSON.stringify(detectionResult), confidenceScore, fakeScore, userId, filePath]);

    res.status(201).json({ message: 'Raportul a fost salvat cu succes' });
  } catch (error) {
    console.error('Eroare la salvarea raportului:', error);
    res.status(500).json({ message: 'A apărut o eroare la salvarea raportului.', error });
  }
});


router.get('/reports', async (req, res) => {
  try {
    const [rows] = await db.promise().execute('SELECT * FROM reports');
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Nu s-au găsit rapoarte.' });
    }
    res.status(200).json(rows);
  } catch (error) {
    console.error('Eroare la obținerea rapoartelor:', error);
    res.status(500).json({ message: 'A apărut o eroare la obținerea rapoartelor.', error });
  }
});


router.get('/reports/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const [rows] = await db.promise().execute('SELECT * FROM reports WHERE user_id = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Nu s-au găsit rapoarte pentru acest utilizator.' });
    }
    res.status(200).json(rows);
  } catch (error) {
    console.error(`Eroare la obținerea rapoartelor pentru user_id ${userId}:`, error);
    res.status(500).json({ message: 'A apărut o eroare la obținerea rapoartelor pentru utilizator.', error });
  }
});

module.exports = router;
