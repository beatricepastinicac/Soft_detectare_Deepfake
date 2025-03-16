const express = require('express');
const router = express.Router();
const adminModel = require('../models/adminModel');
const db = require('../db');

let logger;
router.use((req, res, next) => {
  logger = req.app.locals.logger;
  next();
});

router.get('/dashboard', async (req, res) => {
  try {
    logger && logger.info('Cerere pentru datele dashboard-ului de administrare');
    const dashboardData = await adminModel.getDashboardData();
    res.status(200).json(dashboardData);
  } catch (error) {
    logger && logger.error('Eroare la obținerea datelor pentru dashboard:', JSON.stringify(error));
    res.status(500).json({ message: 'Eroare la obținerea datelor pentru dashboard', error: error.message });
  }
});

router.post('/maintenance/clean-old-reports', async (req, res) => {
  const { days = 30 } = req.body;
  
  if (isNaN(days) || days < 1) {
    return res.status(400).json({ message: 'Valoarea pentru zile trebuie să fie un număr pozitiv' });
  }
  
  logger && logger.info(`Cerere pentru ștergerea rapoartelor vechi (${days} zile)`);
  
  try {
    await db.execute('CALL delete_old_guest_reports(?)', [days]);
    
    res.status(200).json({ message: `Rapoartele vechi (> ${days} zile) au fost șterse cu succes` });
  } catch (error) {
    logger && logger.error('Eroare la ștergerea rapoartelor vechi:', error);
    res.status(500).json({ message: 'Eroare la ștergerea rapoartelor vechi', error: error.message });
  }
});

router.post('/contacts/mark-read', async (req, res) => {
  const { contactIds } = req.body;
  
  if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
    return res.status(400).json({ message: 'Este necesară o listă de ID-uri de contacte' });
  }
  
  logger && logger.info(`Cerere pentru marcarea contactelor ca citite: ${contactIds.join(', ')}`);
  
  try {
    const placeholders = contactIds.map(() => '?').join(', ');
    const [result] = await db.execute(
      `UPDATE contacts SET is_read = 1 WHERE id IN (${placeholders})`,
      contactIds
    );
    
    res.status(200).json({ 
      message: 'Contactele au fost marcate ca citite', 
      updatedCount: result.affectedRows 
    });
  } catch (error) {
    logger && logger.error('Eroare la marcarea contactelor ca citite:', JSON.stringify(error));
    res.status(500).json({ message: 'Eroare la marcarea contactelor ca citite', error: error.message });
  }
});

router.post('/maintenance/analyze-tables', async (req, res) => {
  logger && logger.info('Cerere pentru analiza tabelelor');
  
  try {
    await db.execute('ANALYZE TABLE reports, media_files, users, contacts, statistics');
    res.status(200).json({ message: 'Tabelele au fost analizate cu succes' });
  } catch (error) {
    logger && logger.error('Eroare la analiza tabelelor:', JSON.stringify(error));
    res.status(500).json({ message: 'Eroare la analiza tabelelor', error: error.message });
  }
});

module.exports = router;