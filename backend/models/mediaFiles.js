const db = require('../db');

const createMediaFile = async (userId, filePath, fileName, fileSize, mimeType) => {
  try {
    const sql = `INSERT INTO media_files (user_id, file_path, file_name, file_size, mime_type, uploaded_at) VALUES (?, ?, ?, ?, ?, NOW())`;
    const [result] = await db.execute(sql, [userId, filePath, fileName, fileSize, mimeType]);
    return result;
  } catch (error) {
    console.error('Eroare la crearea înregistrării fișierului media:', error);
    throw new Error('A apărut o eroare la crearea înregistrării fișierului media.');
  }
};

const getMediaFilesByUserId = async (userId) => {
  try {
    const sql = `SELECT * FROM media_files WHERE user_id = ? ORDER BY uploaded_at DESC`;
    const [rows] = await db.execute(sql, [userId]);
    return rows;
  } catch (error) {
    console.error(`Eroare la obținerea fișierelor media pentru user_id ${userId}:`, error);
    throw new Error('A apărut o eroare la obținerea fișierelor media.');
  }
};

const getAllMediaFiles = async () => {
  try {
    const sql = `SELECT * FROM media_files ORDER BY uploaded_at DESC`;
    const [rows] = await db.execute(sql);
    return rows;
  } catch (error) {
    console.error('Eroare la obținerea tuturor fișierelor media:', error);
    throw new Error('A apărut o eroare la obținerea fișierelor media.');
  }
};

const deleteMediaFileById = async (id) => {
  try {
    const sql = `DELETE FROM media_files WHERE id = ?`;
    const [result] = await db.execute(sql, [id]);
    if (result.affectedRows === 0) {
      throw new Error(`Fișierul media cu ID-ul ${id} nu a fost găsit.`);
    }
    return { message: `Fișierul media cu ID-ul ${id} a fost șters cu succes.` };
  } catch (error) {
    console.error(`Eroare la ștergerea fișierului media cu ID-ul ${id}:`, error);
    throw new Error('A apărut o eroare la ștergerea fișierului media.');
  }
};

module.exports = { 
  createMediaFile, 
  getMediaFilesByUserId, 
  getAllMediaFiles, 
  deleteMediaFileById 
};