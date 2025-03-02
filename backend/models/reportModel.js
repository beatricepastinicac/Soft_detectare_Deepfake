const db = require('../db');


const createReport = async (fileName, detectionResult, confidenceScore, fakeScore, userId, filePath) => {
  try {
    const sql = `INSERT INTO reports (file_name, detection_result, confidence_score, fake_score, user_id, file_path, uploaded_at) 
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`;
    const [result] = await db.execute(sql, [fileName, detectionResult, confidenceScore, fakeScore, userId, filePath]);
    return result;
  } catch (error) {
    console.error('Eroare la crearea raportului:', error);
    throw new Error('A apărut o eroare la crearea raportului.');
  }
};


const getAllReports = async () => {
  try {
    const sql = `SELECT * FROM reports`;
    const [rows] = await db.execute(sql);
    return rows;
  } catch (error) {
    console.error('Eroare la obținerea tuturor rapoartelor:', error);
    throw new Error('A apărut o eroare la obținerea rapoartelor.');
  }
};


const getReportsByUserId = async (userId) => {
  try {
    const sql = `SELECT * FROM reports WHERE user_id = ?`;
    const [rows] = await db.execute(sql, [userId]);

    if (rows.length === 0) {
      throw new Error('Nu au fost găsite rapoarte pentru acest utilizator.');
    }

    return rows;
  } catch (error) {
    console.error(`Eroare la obținerea rapoartelor pentru user_id ${userId}:`, error);
    throw new Error('A apărut o eroare la obținerea rapoartelor.');
  }
};

module.exports = { createReport, getAllReports, getReportsByUserId };
