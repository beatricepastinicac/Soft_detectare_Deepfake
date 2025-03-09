const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const path = require('path');
const winston = require('winston');
const fs = require('fs');
const db = require('./db');
const analysisRoutes = require('./routes/analysis');
const contactRoutes = require('./routes/contactRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const reportRoutes = require('./routes/reportRoutes');
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
const PORT = process.env.PORT || 5000;

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'deepfake-detector' },
  transports: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log') 
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  });
  next();
});

app.use(cors({ origin: 'http://localhost:3000' })); 
app.use(express.json());  
app.use(express.urlencoded({ extended: true }));  
app.use(fileUpload());  
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

db.getConnection((err, connection) => {
  if (err) {
    logger.error('Eroare la conectarea la baza de date:', err);
    process.exit(1);  
  } else {
    logger.info('Conexiune reușită la baza de date.');
    connection.release();  
  }
});

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Detecție Deepfake',
      version: '1.0.0',
      description: 'API pentru detectarea conținutului deepfake în imagini și videoclipuri',
      contact: {
        name: 'Suport Tehnic',
        email: 'support@example.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Server de dezvoltare'
      }
    ]
  },
  apis: ['./routes/*.js']
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.locals.logger = logger;

app.use('/api/analysis', analysisRoutes);  
app.use('/api/contact', contactRoutes);    
app.use('/api/media', mediaRoutes);       
app.use('/api/report', reportRoutes);      

app.use((err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method
  });
  res.status(500).json({ error: 'A apărut o eroare la server' });
});

app.listen(PORT, () => {
  logger.info(`Serverul rulează pe http://localhost:${PORT}`);
});

module.exports.logger = logger;
