const db = require('../db');


const createMediaFile = async (userId, filePath) => {
  try {
    const sql = `INSERT INTO media_files (user_id, file_path, uploaded_at) VALUES (?, ?, NOW())`;
    const [result] = await db.execute(sql, [userId, filePath]);
    return result;
  } catch (error) {
    console.error('Eroare la crearea înregistrării fișierului media:', error);
    throw new Error('A apărut o eroare la crearea înregistrării fișierului media.');
  }
};


const getMediaFilesByUserId = async (userId) => {
  try {
    const sql = `SELECT * FROM media_files WHERE user_id = ?`;
    const [rows] = await db.execute(sql, [userId]);

    if (rows.length === 0) {
      throw new Error('Nu au fost găsite fișiere media pentru acest utilizator.');
    }

    return rows;
  } catch (error) {
    console.error(`Eroare la obținerea fișierelor media pentru user_id ${userId}:`, error);
    throw new Error('A apărut o eroare la obținerea fișierelor media.');
  }
};

module.exports = { createMediaFile, getMediaFilesByUserId };
