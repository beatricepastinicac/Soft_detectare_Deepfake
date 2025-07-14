const express = require('express');
const router = express.Router();
const db = require('../db');

let logger;

router.use((req, res, next) => {
  logger = req.app.locals.logger;
  next();
});

router.post('/upload-media', async (req, res) => {
  const { userId, filePath, fileName, fileSize, mimeType } = req.body;

  logger && logger.info(`Cerere de încărcare media: userId=${userId}, filePath=${filePath}`);

  try {
    if (!userId || !filePath) {
      logger && logger.warn('Cerere invalidă: userId sau filePath lipsă');
      return res.status(400).json({ message: 'userId și filePath sunt obligatorii.' });
    }

    const sql = 'INSERT INTO media_files (user_id, file_path, file_name, file_size, mime_type, uploaded_at) VALUES (?, ?, ?, ?, ?, NOW())';
    
    const [result] = await db.execute(sql, [userId, filePath, fileName, fileSize, mimeType]);
    
    logger && logger.info(`Media încărcată cu succes: ID=${result.insertId}`);
    res.status(201).json({ 
      message: 'Fișierul media a fost încărcat cu succes', 
      mediaId: result.insertId 
    });
  } catch (error) {
    logger && logger.error('Eroare la încărcarea fișierului media:', error);
    res.status(500).json({ message: 'A apărut o eroare la încărcarea fișierului media.', error: error.message });
  }
});

router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  
  logger && logger.info(`Cerere pentru obținerea fișierelor media ale utilizatorului: userId=${userId}`);

  try {
    const [rows] = await db.execute('SELECT * FROM media_files WHERE user_id = ? ORDER BY uploaded_at DESC', [userId]);
    
    logger && logger.info(`S-au găsit ${rows.length} fișiere media pentru utilizatorul ${userId}`);
    res.status(200).json(rows);
  } catch (error) {
    logger && logger.error(`Eroare la obținerea fișierelor media pentru user_id ${userId}:`, error);
    res.status(500).json({ message: 'A apărut o eroare la obținerea fișierelor media pentru utilizator.', error: error.message });
  }
});

module.exports = router;