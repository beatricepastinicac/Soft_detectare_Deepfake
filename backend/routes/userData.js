const express = require('express');
const router = express.Router();
const db = require('../db');

let logger;
router.use((req, res, next) => {
  logger = req.app.locals.logger;
  next();
});

router.get('/:userId/analyses', async (req, res) => {
  const { userId } = req.params;
  
  logger && logger.info(`Cerere pentru obținerea analizelor utilizatorului: userId=${userId}`);
  
  try {
    const [analyses] = await db.execute(`
      SELECT * FROM reports 
      WHERE user_id = ? 
      ORDER BY uploaded_at DESC
    `, [userId]);
    
    logger && logger.info(`S-au găsit ${analyses.length} analize pentru utilizatorul ${userId}`);
    res.status(200).json(analyses);
  } catch (error) {
    logger && logger.error(`Eroare la obținerea analizelor pentru userId=${userId}:`, error);
    res.status(500).json({ message: 'Eroare la obținerea analizelor', error: error.message });
  }
});

router.get('/:userId/analyses/filter', async (req, res) => {
  const { userId } = req.params;
  const { minScore, maxScore, startDate, endDate } = req.query;
  
  logger && logger.info(`Cerere de filtrare analize pentru userId=${userId}`);
  
  try {
    let sql = 'SELECT * FROM reports WHERE user_id = ?';
    const params = [userId];
    
    if (minScore) {
      sql += ' AND fake_score >= ?';
      params.push(minScore);
    }
    
    if (maxScore) {
      sql += ' AND fake_score <= ?';
      params.push(maxScore);
    }
    
    if (startDate) {
      sql += ' AND uploaded_at >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      sql += ' AND uploaded_at <= ?';
      params.push(endDate);
    }
    
    sql += ' ORDER BY uploaded_at DESC';
    
    const [analyses] = await db.execute(sql, params);
    
    logger && logger.info(`S-au găsit ${analyses.length} analize filtrate pentru utilizatorul ${userId}`);
    res.status(200).json(analyses);
  } catch (error) {
    logger && logger.error(`Eroare la filtrarea analizelor pentru userId=${userId}:`, error);
    res.status(500).json({ message: 'Eroare la filtrarea analizelor', error: error.message });
  }
});

router.delete('/:userId/analyses/:analysisId', async (req, res) => {
  const { userId, analysisId } = req.params;
  
  logger && logger.info(`Cerere de ștergere analiză: userId=${userId}, analysisId=${analysisId}`);
  
  try {
    const [analyses] = await db.execute('SELECT * FROM reports WHERE id = ? AND user_id = ?', [analysisId, userId]);
    
    if (analyses.length === 0) {
      logger && logger.warn(`Încercare de ștergere neautorizată: userId=${userId}, analysisId=${analysisId}`);
      return res.status(404).json({ message: 'Analiza nu a fost găsită sau nu aparține acestui utilizator' });
    }
    
    await db.execute('DELETE FROM reports WHERE id = ?', [analysisId]);
    
    logger && logger.info(`Analiză ștearsă cu succes: analysisId=${analysisId}`);
    res.status(200).json({ message: 'Analiza a fost ștearsă cu succes' });
  } catch (error) {
    logger && logger.error(`Eroare la ștergerea analizei: userId=${userId}, analysisId=${analysisId}`, error);
    res.status(500).json({ message: 'Eroare la ștergerea analizei', error: error.message });
  }
});

module.exports = router;