const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

let logger;
router.use((req, res, next) => {
  logger = req.app.locals.logger;
  next();
});

router.get('/profile/:userId', async (req, res) => {
  const { userId } = req.params;
  
  logger && logger.info(`Cerere pentru obținerea profilului utilizatorului: userId=${userId}`);
  
  try {
    const [users] = await db.execute(`
      SELECT id, username, email, 
             first_name, last_name, phone, 
             address, city, county, postal_code, 
             company, position, newsletter,
             created_at, updated_at 
      FROM users 
      WHERE id = ?
    `, [userId]);
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'Utilizator negăsit' });
    }
    
    const [analysisStats] = await db.execute(`
      SELECT COUNT(*) as total_analyses, 
             COUNT(CASE WHEN fake_score > 50 THEN 1 END) as fake_count,
             COUNT(CASE WHEN fake_score <= 50 THEN 1 END) as real_count,
             AVG(fake_score) as avg_fake_score
      FROM reports
      WHERE user_id = ?
    `, [userId]);
    
    res.status(200).json({
      ...users[0],
      stats: analysisStats[0]
    });
  } catch (error) {
    logger && logger.error(`Eroare la obținerea profilului pentru userId=${userId}:`, error);
    res.status(500).json({ message: 'Eroare la obținerea profilului', error: error.message });
  }
});

router.put('/profile/:userId', async (req, res) => {
  const { userId } = req.params;
  const { 
    first_name, 
    last_name, 
    phone, 
    address, 
    city, 
    county, 
    postal_code, 
    company, 
    position, 
    newsletter 
  } = req.body;
  
  logger && logger.info(`Cerere de actualizare a profilului: userId=${userId}`);
  
  try {
    const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'Utilizator negăsit' });
    }
    
    const [result] = await db.execute(`
      UPDATE users 
      SET 
        first_name = ?, 
        last_name = ?, 
        phone = ?, 
        address = ?, 
        city = ?, 
        county = ?, 
        postal_code = ?, 
        company = ?, 
        position = ?, 
        newsletter = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [
      first_name || users[0].first_name,
      last_name || users[0].last_name,
      phone || users[0].phone,
      address || users[0].address,
      city || users[0].city,
      county || users[0].county,
      postal_code || users[0].postal_code,
      company || users[0].company,
      position || users[0].position,
      newsletter !== undefined ? newsletter : users[0].newsletter,
      userId
    ]);
    
    logger && logger.info(`Profil actualizat cu succes pentru userId=${userId}`);
    res.status(200).json({ message: 'Profil actualizat cu succes' });
  } catch (error) {
    logger && logger.error(`Eroare la actualizarea profilului pentru userId=${userId}:`, error);
    res.status(500).json({ message: 'Eroare la actualizarea profilului', error: error.message });
  }
});

router.get('/analyses', authenticateToken, async (req, res) => {
  try {
    const [analyses] = await db.execute(`
      SELECT id, file_name, fake_score, uploaded_at 
      FROM reports 
      WHERE user_id = ? 
      ORDER BY uploaded_at DESC
    `, [req.user.userId]);
    res.status(200).json(analyses);
  } catch (error) {
    logger.error('Eroare la obținerea istoricului scanărilor:', error);
    res.status(500).json({ message: 'Eroare la obținerea istoricului scanărilor' });
  }
});

router.get('/:userId/analyses', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  
  logger && logger.info(`Cerere pentru obținerea analizelor utilizatorului: userId=${userId}`);
  
  try {
    if (req.user.userId !== parseInt(userId) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Nu aveți permisiunea să accesați aceste analize' });
    }
    
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

router.get('/:userId/analyses/filter', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  const { minScore, maxScore, startDate, endDate } = req.query;
  
  logger && logger.info(`Cerere de filtrare analize pentru userId=${userId}`);
  
  try {
    if (req.user.userId !== parseInt(userId) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Nu aveți permisiunea să accesați aceste analize' });
    }
    
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

router.delete('/:userId/analyses/:analysisId', authenticateToken, async (req, res) => {
  const { userId, analysisId } = req.params;
  
  logger && logger.info(`Cerere de ștergere analiză: userId=${userId}, analysisId=${analysisId}`);
  
  try {
    if (req.user.userId !== parseInt(userId) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Nu aveți permisiunea să ștergeți această analiză' });
    }
    
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