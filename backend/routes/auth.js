// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt'); 

let logger;
router.use((req, res, next) => {
  logger = req.app.locals.logger;
  next();
});

// Înregistrare utilizator
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  logger && logger.info(`Cerere de înregistrare pentru: ${email}`);
  
  try {
    const [existingUsers] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ message: 'Un utilizator cu acest email există deja' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password, created_at) VALUES (?, ?, ?, NOW())',
      [username, email, hashedPassword]
    );
    
    logger && logger.info(`Utilizator înregistrat cu succes: ${email}, ID: ${result.insertId}`);
    res.status(201).json({ message: 'Utilizator înregistrat cu succes', userId: result.insertId });
  } catch (error) {
    logger && logger.error('Eroare la înregistrarea utilizatorului:', error);
    res.status(500).json({ message: 'Eroare la înregistrarea utilizatorului', error: error.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  logger && logger.info(`Cerere de autentificare pentru: ${email}`);
  
  try {
    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ message: 'Email sau parolă incorectă' });
    }
    
    const user = users[0];
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Email sau parolă incorectă' });
    }
    
    const { password: userPassword, ...userWithoutPassword } = user;
    
    logger && logger.info(`Autentificare reușită pentru: ${email}, ID: ${user.id}`);
    res.status(200).json({ 
      message: 'Autentificare reușită', 
      user: userWithoutPassword
    });
  } catch (error) {
    logger && logger.error('Eroare la autentificarea utilizatorului:', error);
    res.status(500).json({ message: 'Eroare la autentificarea utilizatorului', error: error.message });
  }
});

router.get('/profile/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    const [users] = await db.execute('SELECT id, username, email, created_at FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ message: 'Utilizator negăsit' });
    }
    
    res.status(200).json(users[0]);
  } catch (error) {
    logger && logger.error(`Eroare la obținerea profilului pentru userId=${userId}:`, error);
    res.status(500).json({ message: 'Eroare la obținerea profilului', error: error.message });
  }
});

module.exports = router;