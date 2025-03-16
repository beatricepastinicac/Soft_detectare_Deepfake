const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/authMiddleware');

let logger;
router.use((req, res, next) => {
  logger = req.app.locals.logger;
  next();
});

function sanitizeParams(params) {
  return params.map(param => param === undefined ? null : param);
}

router.post('/register', async (req, res) => {
  const { 
    email, 
    password, 
    username,
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
  
  logger && logger.info(`Cerere de înregistrare pentru: ${email}`);
  logger && logger.info(`Date primite: ${JSON.stringify(req.body)}`);
  
  try {
    const [existingUsers] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ message: 'Un utilizator cu acest email există deja' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const params = [
      username || email, 
      email, 
      hashedPassword, 
      first_name || null, 
      last_name || null, 
      phone || null, 
      address || null, 
      city || null, 
      county || null, 
      postal_code || null, 
      company || null, 
      position || null, 
      newsletter === true ? 1 : (newsletter === false ? 0 : null)
    ];

    const [result] = await db.execute(
      `INSERT INTO users (
        username, 
        email, 
        password, 
        first_name, 
        last_name, 
        phone, 
        address, 
        city, 
        county, 
        postal_code, 
        company, 
        position, 
        newsletter,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      sanitizeParams(params)
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
    
    const JWT_SECRET = process.env.JWT_SECRET || 'b14b24';
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    const { password: userPassword, ...userWithoutPassword } = user;
    
    logger && logger.info(`Autentificare reușită pentru: ${email}, ID: ${user.id}`);
    res.status(200).json({ 
      message: 'Autentificare reușită', 
      user: userWithoutPassword,
      token: token
    });
  } catch (error) {
    logger && logger.error('Eroare la autentificarea utilizatorului:', error);
    res.status(500).json({ message: 'Eroare la autentificarea utilizatorului', error: error.message });
  }
});

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    logger && logger.info(`Preluare profil pentru userId=${req.user.userId}`);
    
    const [users] = await db.execute(`
      SELECT id, username, email, 
             first_name, last_name, phone, 
             address, city, county, postal_code, 
             company, position, newsletter,
             created_at, updated_at 
      FROM users WHERE id = ?`, 
      [req.user.userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'Utilizator negăsit' });
    }
    
    logger && logger.info(`Profil preluat cu succes pentru userId=${req.user.userId}`);
    res.status(200).json({ user: users[0] });
  } catch (error) {
    logger && logger.error(`Eroare la obținerea profilului:`, error);
    res.status(500).json({ message: 'Eroare la obținerea profilului', error: error.message });
  }
});

router.get('/profile/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    logger && logger.info(`Preluare profil pentru userId=${userId}`);
    
    const [users] = await db.execute(`
      SELECT id, username, email, 
             first_name, last_name, phone, 
             address, city, county, postal_code, 
             company, position, newsletter,
             created_at, updated_at 
      FROM users WHERE id = ?`, 
      [userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'Utilizator negăsit' });
    }
    
    res.status(200).json(users[0]);
  } catch (error) {
    logger && logger.error(`Eroare la obținerea profilului pentru userId=${userId}:`, error);
    res.status(500).json({ message: 'Eroare la obținerea profilului', error: error.message });
  }
});

router.put('/profile/:userId', async (req, res) => {
  const { userId } = req.params;
  const { 
    username, 
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
  
  logger && logger.info(`Cerere de actualizare profil pentru userId=${userId}`);
  
  try {
    const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ message: 'Utilizator negăsit' });
    }
    
    const params = [
      username || users[0].username, 
      first_name || users[0].first_name, 
      last_name || users[0].last_name, 
      phone || users[0].phone, 
      address || users[0].address, 
      city || users[0].city, 
      county || users[0].county, 
      postal_code || users[0].postal_code, 
      company || users[0].company, 
      position || users[0].position, 
      newsletter !== undefined ? (newsletter ? 1 : 0) : users[0].newsletter,
      userId
    ];
    
    const [result] = await db.execute(
      `UPDATE users SET 
        username = ?, 
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
      WHERE id = ?`,
      sanitizeParams(params)
    );
    
    logger && logger.info(`Profil actualizat cu succes pentru userId=${userId}`);
    res.status(200).json({ message: 'Profil actualizat cu succes' });
  } catch (error) {
    logger && logger.error(`Eroare la actualizarea profilului pentru userId=${userId}:`, error);
    res.status(500).json({ message: 'Eroare la actualizarea profilului', error: error.message });
  }
});

router.post('/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  logger && logger.info(`Cerere de schimbare parolă pentru userId=${req.user.userId}`);
  
  try {
    const [users] = await db.execute('SELECT * FROM users WHERE id = ?', [req.user.userId]);
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'Utilizator negăsit' });
    }
    
    const user = users[0];
    
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Parola actuală este incorectă' });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await db.execute(
      'UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?',
      [hashedPassword, req.user.userId]
    );
    
    logger && logger.info(`Parola schimbată cu succes pentru userId=${req.user.userId}`);
    res.status(200).json({ message: 'Parola a fost schimbată cu succes' });
  } catch (error) {
    logger && logger.error(`Eroare la schimbarea parolei pentru userId=${req.user.userId}:`, error);
    res.status(500).json({ message: 'Eroare la schimbarea parolei', error: error.message });
  }
});

router.post('/logout', (req, res) => {
  res.status(200).json({ message: 'Deconectat cu succes' });
});

module.exports = router;