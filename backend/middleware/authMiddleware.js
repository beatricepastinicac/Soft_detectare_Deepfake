const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'b14b24';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    req.userTier = 'free';
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      req.user = null;
      req.userTier = 'free';
      return next();
    }

    req.user = user;
    req.userTier = 'premium';
    next();
  });
}

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      message: 'Acces neautorizat', 
      error: 'Token lipsă',
      needsLogin: true,
      tier: 'free',
      upgrade: 'Înregistrează-te pentru funcții premium'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          message: 'Token expirat', 
          error: 'Token expirat',
          needsLogin: true,
          expired: true,
          tier: 'free'
        });
      } else {
        return res.status(403).json({ 
          message: 'Token invalid', 
          error: err.message,
          needsLogin: true,
          tier: 'free'
        });
      }
    }

    req.user = user;
    req.userTier = 'premium';
    next();
  });
}

function authenticateOptional(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  req.user = null;
  req.userTier = 'free';

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) {
        req.user = user;
        req.userTier = 'premium';
      }
    });
  }

  next();
}

function requirePremium(req, res, next) {
  authenticateToken(req, res, (err) => {
    if (err) return next(err);
    
    if (!req.user || req.userTier !== 'premium') {
      return res.status(403).json({
        error: 'Premium Required',
        message: 'Această funcție este disponibilă doar pentru utilizatorii Premium',
        currentTier: req.userTier || 'free',
        needsUpgrade: true,
        benefits: [
          'Analize nelimitate',
          'Heatmap-uri avansate',
          'Suport video',
          'Istoric salvat',
          'Export rezultate'
        ]
      });
    }
    
    next();
  });
}

function getUserTier(req) {
  if (req.user && req.user.userId) {
    return 'premium';
  }
  return 'free';
}

function attachTierInfo(req, res, next) {
  req.userTier = getUserTier(req);
  req.isPremium = req.userTier === 'premium';
  req.isFree = req.userTier === 'free';
  next();
}

module.exports = { 
  authenticateToken,
  requireAuth,
  authenticateOptional,
  requirePremium,
  getUserTier,
  attachTierInfo
};