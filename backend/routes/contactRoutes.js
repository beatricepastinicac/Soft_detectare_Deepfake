const express = require('express');
const router = express.Router();
const db = require('../db');

let logger;

router.once('mount', function(parent) {
  logger = parent.locals.logger;
});

router.post('/', async (req, res) => {
  const { name, email, message } = req.body;
  
  logger && logger.info(`Mesaj de contact primit de la: ${name}, email: ${email}`);

  try {
    if (!name || !email || !message) {
      logger && logger.warn('Cerere de contact incompletă');
      return res.status(400).json({ message: 'Toate câmpurile sunt necesare.' });
    }

    const sql = 'INSERT INTO contacts (name, email, message, created_at) VALUES (?, ?, ?, NOW())';
    await db.execute(sql, [name, email, message]);

    logger && logger.info(`Mesajul de contact de la ${email} a fost salvat cu succes`);
    res.status(201).json({ message: 'Mesajul de contact a fost trimis cu succes' });
  } catch (error) {
    logger && logger.error('Eroare la trimiterea mesajului de contact:', error);
    res.status(500).json({ message: 'A apărut o eroare la trimiterea mesajului de contact.', error });
  }
});

router.get('/', async (req, res) => {
  try {
    logger && logger.info('Cerere pentru obținerea tuturor mesajelor de contact');
    const [rows] = await db.execute('SELECT * FROM contacts');
    logger && logger.info(`${rows.length} mesaje de contact obținute`);
    res.status(200).json(rows);
  } catch (error) {
    logger && logger.error('Eroare la obținerea mesajelor de contact:', error);
    res.status(500).json({ message: 'A apărut o eroare la obținerea mesajelor de contact.', error });
  }
});

module.exports = router;
