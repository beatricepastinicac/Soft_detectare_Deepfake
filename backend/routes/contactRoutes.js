const express = require('express');
const router = express.Router();
const db = require('../db');


router.post('/', async (req, res) => {
  const { name, email, message } = req.body;
  
  console.log(req.body); 

  try {
    if (!name || !email || !message) {
      return res.status(400).json({ message: 'Toate câmpurile sunt necesare.' });
    }

    
    const sql = 'INSERT INTO contacts (name, email, message, created_at) VALUES (?, ?, ?, NOW())';
    await db.execute(sql, [name, email, message]);

    res.status(201).json({ message: 'Mesajul de contact a fost trimis cu succes' });
  } catch (error) {
    console.error('Eroare la trimiterea mesajului de contact:', error);
    res.status(500).json({ message: 'A apărut o eroare la trimiterea mesajului de contact.', error });
  }
});


router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM contacts');
    res.status(200).json(rows);
  } catch (error) {
    console.error('Eroare la obținerea mesajelor de contact:', error);
    res.status(500).json({ message: 'A apărut o eroare la obținerea mesajelor de contact.', error });
  }
});

module.exports = router;
