const db = require('../db');

const createReport = async (fileName, detectionResult, confidenceScore, fakeScore, userId, filePath, heatmapPath, facesDetected, faceScore, inconsistencyScore, vggFaceScore, isDeepfake, modelType, stdDeviation, confidenceInterval, processingTime) => {
  try {
    const sql = `INSERT INTO reports (
      file_name, detection_result, confidence_score, fake_score, user_id, 
      image_path, heatmap_path, faces_detected, face_score, inconsistency_score, 
      vgg_face_score, is_deepfake, model_type, std_deviation, confidence_interval, 
      processing_time, uploaded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`;
    
    const [result] = await db.execute(sql, [
      fileName, 
      JSON.stringify(detectionResult), 
      confidenceScore, 
      fakeScore, 
      userId, 
      filePath,
      heatmapPath,
      facesDetected || 0,
      faceScore,
      inconsistencyScore,
      vggFaceScore,
      isDeepfake ? 1 : 0,
      modelType || 'basic',
      stdDeviation,
      confidenceInterval ? JSON.stringify(confidenceInterval) : null,
      processingTime
    ]);
    return result;
  } catch (error) {
    console.error('Eroare la crearea raportului:', error);
    throw new Error('A apărut o eroare la crearea raportului.');
  }
};

const getAllReports = async () => {
  try {
    const sql = `SELECT * FROM reports ORDER BY uploaded_at DESC`;
    const [rows] = await db.execute(sql);
    return rows;
  } catch (error) {
    console.error('Eroare la obținerea tuturor rapoartelor:', error);
    throw new Error('A apărut o eroare la obținerea rapoartelor.');
  }
};

const getReportsByUserId = async (userId) => {
  try {
    const sql = `SELECT * FROM reports WHERE user_id = ? ORDER BY uploaded_at DESC`;
    const [rows] = await db.execute(sql, [userId]);
    return rows;
  } catch (error) {
    console.error(`Eroare la obținerea rapoartelor pentru user_id ${userId}:`, error);
    throw new Error('A apărut o eroare la obținerea rapoartelor.');
  }
};

const getReportById = async (id) => {
  try {
    const sql = `SELECT * FROM reports WHERE id = ?`;
    const [rows] = await db.execute(sql, [id]);
    if (rows.length === 0) {
      throw new Error(`Raportul cu ID-ul ${id} nu a fost găsit.`);
    }
    return rows[0];
  } catch (error) {
    console.error(`Eroare la obținerea raportului cu ID-ul ${id}:`, error);
    throw new Error('A apărut o eroare la obținerea raportului.');
  }
};

const deleteReportById = async (id) => {
  try {
    const sql = `DELETE FROM reports WHERE id = ?`;
    const [result] = await db.execute(sql, [id]);
    if (result.affectedRows === 0) {
      throw new Error(`Raportul cu ID-ul ${id} nu a fost găsit.`);
    }
    return { message: `Raportul cu ID-ul ${id} a fost șters cu succes.` };
  } catch (error) {
    console.error(`Eroare la ștergerea raportului cu ID-ul ${id}:`, error);
    throw new Error('A apărut o eroare la ștergerea raportului.');
  }
};

const updateReport = async (id, updateData) => {
  try {
    const fields = [];
    const values = [];
    
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    });
    
    if (fields.length === 0) {
      throw new Error('Nu au fost furnizate date pentru actualizare.');
    }
    
    values.push(id);
    const sql = `UPDATE reports SET ${fields.join(', ')} WHERE id = ?`;
    const [result] = await db.execute(sql, values);
    
    if (result.affectedRows === 0) {
      throw new Error(`Raportul cu ID-ul ${id} nu a fost găsit.`);
    }
    
    return { message: `Raportul cu ID-ul ${id} a fost actualizat cu succes.` };
  } catch (error) {
    console.error(`Eroare la actualizarea raportului cu ID-ul ${id}:`, error);
    throw new Error('A apărut o eroare la actualizarea raportului.');
  }
};

module.exports = { 
  createReport, 
  getAllReports, 
  getReportsByUserId, 
  getReportById, 
  deleteReportById, 
  updateReport 
};