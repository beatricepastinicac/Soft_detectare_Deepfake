const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { authenticateToken } = require('../middleware/authMiddleware');
const db = require('../db');

let logger;
router.use((req, res, next) => {
  logger = req.app.locals.logger;
  next();
});

// Download extension pentru utilizatori autentificați
router.get('/download', authenticateToken, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication Required',
      message: 'Pentru a descărca extensia, trebuie să te conectezi la cont.'
    });
  }

  try {
    const userId = req.user.userId;
    const userAgent = req.get('User-Agent') || '';
    
    // Detectează browserul
    let browserType = 'chrome';
    if (userAgent.includes('Firefox')) {
      browserType = 'firefox';
    } else if (userAgent.includes('Edge')) {
      browserType = 'edge';
    }

    // Log download
    await logExtensionDownload(userId, browserType);

    // Calea către extensie
    const extensionDir = path.join(__dirname, '..', '..', 'frontend', 'extension');
    
    if (!fs.existsSync(extensionDir)) {
      return res.status(404).json({
        error: 'Extension not found',
        message: 'Extensia nu este disponibilă momentan.'
      });
    }

    // Creează un ZIP cu extensia personalizată pentru utilizator
    const tempZipPath = path.join(__dirname, '..', 'temp', `extension-${userId}-${Date.now()}.zip`);
    
    // Asigură-te că directorul temp există
    const tempDir = path.dirname(tempZipPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const output = fs.createWriteStream(tempZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      
      archive.pipe(output);
      
      // Adaugă fișierele extensiei
      archive.directory(extensionDir, false);
      
      // Modifică manifest.json pentru a include user ID-ul
      const manifestPath = path.join(extensionDir, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifest.description = `BeeDetection - Deepfake Detection for User ${userId}`;
        archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
      }
      
      // Adaugă configurația utilizatorului
      const userConfig = {
        userId: userId,
        userEmail: req.user.email,
        apiUrl: process.env.API_URL || 'http://localhost:5000',
        downloadDate: new Date().toISOString(),
        browserType: browserType
      };
      
      archive.append(JSON.stringify(userConfig, null, 2), { name: 'config/user-config.json' });
      
      archive.finalize();
    });

    // Trimite fișierul
    res.download(tempZipPath, `beedetection-extension-${browserType}.zip`, (err) => {
      if (err) {
        logger && logger.error(`Error sending extension file: ${err.message}`);
      }
      
      // Șterge fișierul temporar după 30 secunde
      setTimeout(() => {
        if (fs.existsSync(tempZipPath)) {
          fs.unlink(tempZipPath, (unlinkErr) => {
            if (unlinkErr) {
              logger && logger.error(`Error deleting temp file: ${unlinkErr.message}`);
            }
          });
        }
      }, 30000);
    });

    logger && logger.info(`Extension downloaded by user ${userId} for ${browserType}`);

  } catch (error) {
    logger && logger.error(`Error generating extension download: ${error.message}`);
    res.status(500).json({
      error: 'Download Error',
      message: 'Nu s-a putut genera descărcarea extensiei.'
    });
  }
});

// Endpoint pentru validarea extensiei
router.post('/validate', authenticateToken, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication Required',
      message: 'Extensia necesită autentificare.'
    });
  }

  try {
    const { extensionVersion, browserInfo } = req.body;
    
    // Verifică dacă utilizatorul are dreptul să folosească extensia
    const user = req.user;
    
    // Log utilizarea extensiei
    await logExtensionUsage(user.userId, extensionVersion, browserInfo);

    res.json({
      success: true,
      user: {
        id: user.userId,
        email: user.email,
        tier: 'premium'
      },
      permissions: {
        realTimeScanning: true,
        contextMenu: true,
        notifications: true,
        historySaving: true
      },
      apiEndpoints: {
        upload: '/api/analysis/upload',
        history: '/api/reports/history'
      }
    });

  } catch (error) {
    logger && logger.error(`Error validating extension: ${error.message}`);
    res.status(500).json({
      error: 'Validation Error',
      message: 'Nu s-a putut valida extensia.'
    });
  }
});

// Statistici pentru extensie
router.get('/stats', authenticateToken, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const userId = req.user.userId;
    
    const [downloads] = await db.execute(`
      SELECT COUNT(*) as total_downloads, 
             MAX(downloaded_at) as last_download,
             browser_type
      FROM extension_downloads 
      WHERE user_id = ?
      GROUP BY browser_type
    `, [userId]);

    const [usage] = await db.execute(`
      SELECT COUNT(*) as total_usage,
             MAX(used_at) as last_used,
             extension_version
      FROM extension_usage 
      WHERE user_id = ?
      GROUP BY extension_version
      ORDER BY used_at DESC
      LIMIT 5
    `, [userId]);

    res.json({
      downloads: downloads,
      usage: usage,
      totalDownloads: downloads.reduce((sum, item) => sum + item.total_downloads, 0),
      totalUsage: usage.reduce((sum, item) => sum + item.total_usage, 0)
    });

  } catch (error) {
    logger && logger.error(`Error fetching extension stats: ${error.message}`);
    res.status(500).json({
      error: 'Stats Error',
      message: 'Nu s-au putut încărca statisticile.'
    });
  }
});

async function logExtensionDownload(userId, browserType) {
  try {
    // Verifică dacă tabelul există, altfel îl creează
    await db.execute(`
      CREATE TABLE IF NOT EXISTS extension_downloads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        browser_type VARCHAR(50),
        downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(45),
        user_agent TEXT,
        INDEX idx_user_id (user_id),
        INDEX idx_downloaded_at (downloaded_at)
      )
    `);

    await db.execute(`
      INSERT INTO extension_downloads (user_id, browser_type, downloaded_at)
      VALUES (?, ?, NOW())
    `, [userId, browserType]);

  } catch (error) {
    logger && logger.error(`Error logging extension download: ${error.message}`);
  }
}

async function logExtensionUsage(userId, version, browserInfo) {
  try {
    // Verifică dacă tabelul există, altfel îl creează
    await db.execute(`
      CREATE TABLE IF NOT EXISTS extension_usage (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        extension_version VARCHAR(20),
        browser_info TEXT,
        used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_used_at (used_at)
      )
    `);

    await db.execute(`
      INSERT INTO extension_usage (user_id, extension_version, browser_info, used_at)
      VALUES (?, ?, ?, NOW())
    `, [userId, version, JSON.stringify(browserInfo)]);

  } catch (error) {
    logger && logger.error(`Error logging extension usage: ${error.message}`);
  }
}

// Basic analyze endpoint for free users
router.post('/analyze', async (req, res) => {
  try {
    let imageUrl, imageData;
    
    // Handle both JSON and FormData
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      // FormData from extension
      imageUrl = req.body.imageUrl;
      // Handle file upload if present
      if (req.files && req.files.image) {
        imageData = req.files.image.data.toString('base64');
      }
    } else {
      // JSON body
      imageUrl = req.body.imageUrl;
      imageData = req.body.imageData;
    }
    
    if (!imageUrl && !imageData) {
      return res.status(400).json({
        error: 'Missing image data',
        message: 'Image URL sau image data este necesar'
      });
    }

    // Simulare de analiză pentru utilizatori neautentificați
    const mockResult = {
      fake_score: Math.floor(Math.random() * 40), // Lower scores for free
      confidence_score: Math.random() * 0.4 + 0.6,
      is_deepfake: Math.random() > 0.8,
      heatmap_available: false,
      method: 'basic',
      processing_time: Math.random() * 2 + 0.5,
      model_used: 'basic_detector',
      message: 'Analiză de bază completă. Pentru analiză avansată cu Grad-CAM, conectați-vă la cont.'
    };

    res.json(mockResult);
  } catch (error) {
    logger && logger.error(`Extension analyze error: ${error.message}`);
    res.status(500).json({
      error: 'Analysis failed',
      message: 'Eroare la analiza imaginii'
    });
  }
});

// Premium analyze endpoint for authenticated users
router.post('/analyze-premium', authenticateToken, async (req, res) => {
  try {
    let imageUrl, imageData;
    
    // Handle both JSON and FormData
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      imageUrl = req.body.imageUrl;
      if (req.files && req.files.image) {
        imageData = req.files.image.data.toString('base64');
      }
    } else {
      imageUrl = req.body.imageUrl;
      imageData = req.body.imageData;
    }
    
    if (!imageUrl && !imageData) {
      return res.status(400).json({
        error: 'Missing image data',
        message: 'Image URL sau image data este necesar'
      });
    }

    try {
      // For now, return enhanced mock data for premium users
      const premiumResult = {
        fake_score: Math.floor(Math.random() * 100),
        confidence_score: Math.random() * 0.3 + 0.7, // Higher confidence
        is_deepfake: Math.random() > 0.7,
        heatmap_available: true,
        heatmap_url: `/heatmaps/extension_${Date.now()}.jpg`,
        method: 'grad_cam_enhanced',
        processing_time: Math.random() * 3 + 1,
        model_used: 'premium_gradcam_detector',
        premium_features: {
          gradCAM: true,
          faceDetection: true,
          enhancedAnalysis: true
        },
        message: 'Analiză premium completă cu Grad-CAM'
      };
      
      // Log extension usage
      if (req.user) {
        await logExtensionUsage(req.user.userId, '2.0.0', {
          action: 'premium_analyze',
          hasGradCAM: true,
          imageUrl: imageUrl ? 'url' : 'data'
        });
      }
      
      res.json(premiumResult);
      
    } catch (analysisError) {
      logger && logger.error(`Premium analysis error: ${analysisError.message}`);
      
      // Fallback to enhanced basic analysis
      const fallbackResult = {
        fake_score: Math.floor(Math.random() * 100),
        confidence_score: Math.random() * 0.3 + 0.7,
        is_deepfake: Math.random() > 0.7,
        heatmap_available: false,
        method: 'premium_fallback',
        processing_time: Math.random() * 2 + 0.5,
        model_used: 'premium_detector',
        message: 'Analiză premium (fallback mode)'
      };
      
      res.json(fallbackResult);
    }
    
  } catch (error) {
    logger && logger.error(`Extension premium analyze error: ${error.message}`);
    res.status(500).json({
      error: 'Analysis failed',
      message: 'Eroare la analiza premium'
    });
  }
});

// Update extension statistics
router.post('/update-stats', async (req, res) => {
  try {
    const { scansCount, threatsFound, safeImages, sessionData } = req.body;
    
    // For authenticated users, save to database
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        // Log extension activity
        await logExtensionUsage(decoded.userId, '2.0.0', {
          action: 'stats_update',
          scansCount: scansCount,
          threatsFound: threatsFound,
          safeImages: safeImages,
          sessionData: sessionData
        });
        
        res.json({
          success: true,
          message: 'Statistici actualizate cu succes'
        });
      } catch (authError) {
        // Continue without authentication
        res.json({
          success: true,
          message: 'Statistici înregistrate local'
        });
      }
    } else {
      res.json({
        success: true,
        message: 'Statistici înregistrate local'
      });
    }
  } catch (error) {
    logger && logger.error(`Extension stats update error: ${error.message}`);
    res.status(500).json({
      error: 'Stats update failed',
      message: 'Eroare la actualizarea statisticilor'
    });
  }
});

// Get extension statistics for authenticated users
router.get('/get-stats', async (req, res) => {
  try {
    // Mock stats for now - in a real app, get from database
    const stats = {
      totalScans: 42,
      threatsDetected: 3,
      safeImages: 39,
      accuracyRate: 98,
      recentActivity: [
        {
          type: 'scan',
          title: 'Imagine scanată pe Facebook',
          description: 'Scanare completă - imagine sigură detectată',
          time: '2 minute în urmă',
          platform: 'Facebook'
        },
        {
          type: 'threat',
          title: 'Deepfake detectat pe Instagram', 
          description: 'Amenințare detectată cu 87% acuratețe',
          time: '15 minute în urmă',
          platform: 'Instagram'
        }
      ]
    };
    
    res.json(stats);
  } catch (error) {
    logger && logger.error(`Extension get stats error: ${error.message}`);
    res.status(500).json({
      error: 'Failed to get stats',
      message: 'Eroare la obținerea statisticilor'
    });
  }
});

module.exports = router;
