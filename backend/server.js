process.env.TF_ENABLE_ONEDNN_OPTS = '0';

const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const path = require('path');
const winston = require('winston');
const fs = require('fs');
const db = require('./db');
const analysisRoutes = require('./routes/analysis');
const testRoutes = require('./routes/testEndpoint'); // Test endpoint pentru heatmap îmbunătățit
const contactRoutes = require('./routes/contactRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const reportRoutes = require('./routes/reportRoutes');
const authRoutes = require('./routes/auth');
const userDataRoutes = require('./routes/userData');
const statsRoutes = require('./routes/stats');
const advancedReportsRoutes = require('./routes/advancedReports');
const adminRoutes = require('./routes/admin');
const extensionRoutes = require('./routes/extension');
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
const PORT = process.env.PORT || 5000;

const createRequiredDirectories = () => {
  const dirs = [
    path.join(__dirname, 'logs'),
    path.join(__dirname, 'uploads'),
    path.join(__dirname, 'uploads/temp'),
    path.join(__dirname, 'public'),
    path.join(__dirname, 'public/uploads'),
    path.join(__dirname, 'public/heatmaps'),
    path.join(__dirname, 'exports'),
    path.join(__dirname, 'deepfakeDetector/models'),
    path.join(__dirname, 'deepfakeDetector/savedModel'),
    path.join(__dirname, 'config'),
    path.join(__dirname, 'services'),
    path.join(__dirname, 'temp')
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
};

createRequiredDirectories();

const logsDir = path.join(__dirname, 'logs');
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

app.use(cors({ 
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || 'http://localhost:3000' 
    : '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(fileUpload({
  limits: { 
    fileSize: 100 * 1024 * 1024
  },
  abortOnLimit: true,
  useTempFiles: true,
  tempFileDir: path.join(__dirname, 'uploads/temp'),
  createParentPath: true,
  parseNested: true
}));

// Servire statică pentru uploads și heatmaps cu debugging și CORS
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use('/heatmaps', express.static(path.join(__dirname, 'public/heatmaps')));

// Debug middleware pentru heatmaps
app.use('/heatmaps', (req, res, next) => {
  console.log(`🔥 Heatmap requested: ${req.path}`);
  const filePath = path.join(__dirname, 'public', 'heatmaps', req.path);
  console.log(`🔍 Looking for file at: ${filePath}`);
  
  if (fs.existsSync(filePath)) {
    console.log(`✅ File exists!`);
  } else {
    console.log(`❌ File not found!`);
    
    // Listează fișierele din directorul heatmaps
    const heatmapsDir = path.join(__dirname, 'public', 'heatmaps');
    if (fs.existsSync(heatmapsDir)) {
      const files = fs.readdirSync(heatmapsDir);
      console.log(`📁 Files in heatmaps directory:`, files);
    }
  }
  next();
});

// CORS pentru imaginile statice
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use('/heatmaps', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

db.getConnection((err, connection) => {
  if (err) {
    logger.error('Error connecting to database:', err);
  } else {
    logger.info('Successfully connected to database.');
    connection.release();
  }
});

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Deepfake Detection API',
      version: '2.0.0',
      description: 'API for detecting deepfake content with freemium tier system',
      contact: {
        name: 'Technical Support',
        email: 'support@deepfakedetector.com'
      }
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./routes/*.js']
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.locals.logger = logger;

app.use('/api/analysis', analysisRoutes);
app.use('/api/test', testRoutes); // Endpoint pentru testarea heatmap-ului îmbunătățit
app.use('/api/contact', contactRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user-data', userDataRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/advanced-reports', advancedReportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/extension', extensionRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

app.get('/api/tiers', (req, res) => {
  try {
    const { tierConfigurations } = require('./config/tiers');
    const publicTierInfo = {};
    
    Object.keys(tierConfigurations).forEach(tier => {
      const config = tierConfigurations[tier];
      publicTierInfo[tier] = {
        name: config.name,
        maxAnalysesPerDay: config.maxAnalysesPerDay,
        maxFileSize: config.maxFileSize,
        supportedFormats: config.supportedFormats,
        features: Object.keys(config.features).filter(f => config.features[f])
      };
    });
    
    res.json(publicTierInfo);
  } catch (error) {
    logger.error('Error loading tier configurations:', error);
    res.status(500).json({ error: 'Could not load tier configurations' });
  }
});

app.use((err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ 
      error: 'File too large',
      message: 'Fișierul este prea mare. Mărimea maximă acceptată este 100MB.',
      maxSize: '100MB'
    });
  }
  
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ 
      error: 'Invalid file field',
      message: 'Câmpul pentru fișier nu este valid.'
    });
  }
  
  res.status(err.status || 500).json({ 
    error: 'Server Error', 
    message: process.env.NODE_ENV === 'production' 
      ? 'A apărut o eroare pe server' 
      : err.message
  });
});

app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: 'Endpoint-ul cerut nu a fost găsit'
  });
});

const gracefulShutdown = () => {
  console.log('Received shutdown signal, shutting down gracefully...');
  
  if (db && db.end) {
    db.end(() => {
      console.log('Database connection closed');
    });
  }
  
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  logger.info(`API documentation available at http://localhost:${PORT}/api-docs`);
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
  console.log(`🔍 Health Check: http://localhost:${PORT}/health`);
  console.log(`📊 Tier Info: http://localhost:${PORT}/api/tiers`);
});

module.exports = { app, logger };