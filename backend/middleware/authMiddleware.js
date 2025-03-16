const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'b14b24'; 

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Acces neautorizat', error: 'Token lipsă' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Eroare verificare token:', err);
      return res.status(403).json({ message: 'Token invalid sau expirat', error: err.message });
    }

    console.log('Token verificat cu succes, user:', user);
    req.user = user;
    next();
  });
}

module.exports = { authenticateToken };