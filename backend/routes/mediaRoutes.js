const express = require('express');
const router = express.Router();
const db = require('../db');

let logger;

router.use((req, res, next) => {
  logger = req.app.locals.logger;
  next();
});

router.post('/upload-media', async (req, res) => {
  const { userId, filePath } = req.body;

  logger && logger.info(`Cerere de încărcare media: userId=${userId}, filePath=${filePath}`);

  try {
    if (!userId || !filePath) {
      logger && logger.warn('Cerere invalidă: userId sau filePath lipsă');
      return res.status(400).json({ message: 'userId și filePath sunt obligatorii.' });
    }

    const sql = 'INSERT INTO media_files (user_id, file_path, uploaded_at) VALUES (?, ?, NOW())';
    const result = await db.promise().execute(sql, [userId, filePath]);
    
    logger && logger.info(`Media încărcată cu succes: ID=${result[0].insertId}`);
    res.status(201).json({ message: 'Fișierul media a fost încărcat cu succes' });
  } catch (error) {
    logger && logger.error('Eroare la încărcarea fișierului media:', error);
    res.status(500).json({ message: 'A apărut o eroare la încărcarea fișierului media.', error });
  }
});

module.exports = router;
