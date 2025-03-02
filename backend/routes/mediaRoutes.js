const express = require('express');
const router = express.Router();
const db = require('../db');


router.post('/upload-media', async (req, res) => {
  const { userId, filePath } = req.body;

  try {
   
    if (!userId || !filePath) {
      return res.status(400).json({ message: 'userId și filePath sunt obligatorii.' });
    }

   
    const sql = 'INSERT INTO media_files (user_id, file_path, uploaded_at) VALUES (?, ?, NOW())';
    await db.promise().execute(sql, [userId, filePath]);

    res.status(201).json({ message: 'Fișierul media a fost încărcat cu succes' });
  } catch (error) {
    console.error('Eroare la încărcarea fișierului media:', error);
    res.status(500).json({ message: 'A apărut o eroare la încărcarea fișierului media.', error });
  }
});

module.exports = router;
