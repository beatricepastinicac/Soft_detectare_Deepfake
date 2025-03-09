const express = require('express');
const router = express.Router();
const advancedReportModel = require('../models/advancedReportModel');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

let logger;
router.once('mount', function(parent) {
  logger = parent.locals.logger;
});

router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const { startDate, endDate, minScore, maxScore, limit = 50, offset = 0 } = req.query;
  
  logger && logger.info(`Cerere pentru rapoarte avansate: userId=${userId}, filters=${JSON.stringify(req.query)}`);
  
  try {
    const reports = await advancedReportModel.getUserReports(
      userId, 
      { startDate, endDate, minScore, maxScore }, 
      limit, 
      offset
    );
    
    res.status(200).json(reports);
  } catch (error) {
    logger && logger.error(`Eroare la obținerea rapoartelor avansate pentru user ${userId}:`, error);
    res.status(500).json({ message: 'Eroare la obținerea rapoartelor avansate', error: error.message });
  }
});

router.get('/export', async (req, res) => {
  const { format = 'json', startDate, endDate, userId } = req.query;
  
  logger && logger.info(`Cerere de export în format ${format}`);
  
  try {
    let sql = `
      SELECT r.id, r.file_name, r.fake_score, r.confidence_score, 
             r.is_deepfake, r.uploaded_at, u.username
      FROM reports r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (userId) {
      sql += ' AND r.user_id = ?';
      params.push(userId);
    }
    
    if (startDate) {
      sql += ' AND r.uploaded_at >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      sql += ' AND r.uploaded_at <= ?';
      params.push(endDate);
    }
    
    sql += ' ORDER BY r.uploaded_at DESC';
    
    const [rows] = await db.execute(sql, params);
    
    if (format.toLowerCase() === 'csv') {
      const headers = 'ID,FileName,FakeScore,ConfidenceScore,IsDeepfake,UploadedAt,Username\n';
      const csvContent = rows.map(row => 
        `${row.id},"${row.file_name}",${row.fake_score},${row.confidence_score},${row.is_deepfake ? 'Yes' : 'No'},"${row.uploaded_at}","${row.username || ''}"`
      ).join('\n');
      
      const csvData = headers + csvContent;
      
      const exportDir = path.join(__dirname, '..', 'exports');
      await mkdirAsync(exportDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(exportDir, `export_${timestamp}.csv`);
      
      await writeFileAsync(filePath, csvData);
      
      res.download(filePath, `deepfake_analyses_${timestamp}.csv`, err => {
        if (err) {
          logger && logger.error('Eroare la trimiterea fișierului CSV:', err);
        }
        
        fs.unlink(filePath, unlinkErr => {
          if (unlinkErr) logger && logger.error('Eroare la ștergerea fișierului temporar:', unlinkErr);
        });
      });
    } else {
      res.status(200).json(rows);
    }
  } catch (error) {
    logger && logger.error('Eroare la exportarea analizelor:', error);
    res.status(500).json({ message: 'Eroare la exportarea analizelor', error: error.message });
  }
});

router.get('/comparison', async (req, res) => {
  const { report1Id, report2Id } = req.query;
  
  if (!report1Id || !report2Id) {
    return res.status(400).json({ message: 'Ambele ID-uri de raport sunt necesare' });
  }
  
  logger && logger.info(`Cerere de comparație între rapoartele ${report1Id} și ${report2Id}`);
  
  try {
    const [report1] = await db.execute('SELECT * FROM reports WHERE id = ?', [report1Id]);
    const [report2] = await db.execute('SELECT * FROM reports WHERE id = ?', [report2Id]);
    
    if (report1.length === 0 || report2.length === 0) {
      return res.status(404).json({ message: 'Unul sau ambele rapoarte nu au fost găsite' });
    }
    
    const comparison = {
      report1: report1[0],
      report2: report2[0],
      difference: {
        fake_score: Math.abs(report1[0].fake_score - report2[0].fake_score),
        confidence_score: Math.abs(report1[0].confidence_score - report2[0].confidence_score),
        same_classification: (report1[0].fake_score > 50) === (report2[0].fake_score > 50)
      }
    };
    
    res.status(200).json(comparison);
  } catch (error) {
    logger && logger.error('Eroare la compararea rapoartelor:', error);
    res.status(500).json({ message: 'Eroare la compararea rapoartelor', error: error.message });
  }
});

module.exports = router;