const db = require('../db');

const advancedReportModel = {
  getUserReports: async (userId, filters = {}, limit = 50, offset = 0) => {
    try {
      const { startDate, endDate, minScore, maxScore } = filters;
      
      let sql = `
        SELECT r.*, u.username
        FROM reports r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.user_id = ?
      `;
      
      const params = [userId];
      
      if (startDate) {
        sql += ' AND DATE(r.uploaded_at) >= ?';
        params.push(startDate);
      }
      
      if (endDate) {
        sql += ' AND DATE(r.uploaded_at) <= ?';
        params.push(endDate);
      }
      
      if (minScore !== null && minScore !== undefined) {
        sql += ' AND r.fake_score >= ?';
        params.push(minScore);
      }
      
      if (maxScore !== null && maxScore !== undefined) {
        sql += ' AND r.fake_score <= ?';
        params.push(maxScore);
      }
      
      sql += ' ORDER BY r.uploaded_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));
      
      const [rows] = await db.execute(sql, params);
      return rows;
    } catch (error) {
      console.error(`Eroare la obținerea rapoartelor avansate pentru user ${userId}:`, error);
      throw new Error('Eroare la obținerea rapoartelor avansate');
    }
  },

  getReportsForExport: async (filters = {}) => {
    try {
      const { startDate, endDate, userId } = filters;
      
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
      return rows;
    } catch (error) {
      console.error('Eroare la obținerea rapoartelor pentru export:', error);
      throw new Error('Eroare la obținerea rapoartelor pentru export');
    }
  },

  compareReports: async (report1Id, report2Id) => {
    try {
      const [report1] = await db.execute('SELECT * FROM reports WHERE id = ?', [report1Id]);
      const [report2] = await db.execute('SELECT * FROM reports WHERE id = ?', [report2Id]);
      
      if (report1.length === 0 || report2.length === 0) {
        throw new Error('Unul sau ambele rapoarte nu au fost găsite');
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
      
      return comparison;
    } catch (error) {
      console.error('Eroare la compararea rapoartelor:', error);
      throw new Error('Eroare la compararea rapoartelor');
    }
  },
  
  getReportDetails: async (reportId) => {
    try {
      const [report] = await db.execute(`
        SELECT r.*, u.username 
        FROM reports r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.id = ?
      `, [reportId]);
      
      if (report.length === 0) {
        throw new Error('Raportul nu a fost găsit');
      }
      
      if (report[0].detection_result) {
        try {
          report[0].detection_result = JSON.parse(report[0].detection_result);
        } catch (e) {
          console.warn(`Nu s-a putut parsa detection_result pentru raportul ${reportId}`);
        }
      }
      
      if (report[0].confidence_interval) {
        try {
          report[0].confidence_interval = JSON.parse(report[0].confidence_interval);
        } catch (e) {
          console.warn(`Nu s-a putut parsa confidence_interval pentru raportul ${reportId}`);
        }
      }
      
      return report[0];
    } catch (error) {
      console.error(`Eroare la obținerea detaliilor pentru raportul ${reportId}:`, error);
      throw new Error('Eroare la obținerea detaliilor raportului');
    }
  },

  getReportsByDateRange: async (startDate, endDate, limit = 100) => {
    try {
      const [rows] = await db.execute(`
        SELECT r.*, u.username
        FROM reports r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE DATE(r.uploaded_at) BETWEEN ? AND ?
        ORDER BY r.uploaded_at DESC
        LIMIT ?
      `, [startDate, endDate, limit]);
      
      return rows;
    } catch (error) {
      console.error('Eroare la obținerea rapoartelor din intervalul de date:', error);
      throw new Error('Eroare la obținerea rapoartelor din intervalul de date');
    }
  },

  getTopFakeReports: async (limit = 10) => {
    try {
      const [rows] = await db.execute(`
        SELECT r.*, u.username
        FROM reports r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.fake_score > 50
        ORDER BY r.fake_score DESC
        LIMIT ?
      `, [limit]);
      
      return rows;
    } catch (error) {
      console.error('Eroare la obținerea celor mai probabile rapoarte fake:', error);
      throw new Error('Eroare la obținerea celor mai probabile rapoarte fake');
    }
  },

  getReportStatsByUser: async (userId) => {
    try {
      const [stats] = await db.execute(`
        SELECT 
          COUNT(*) as total_reports,
          AVG(fake_score) as avg_fake_score,
          MAX(fake_score) as max_fake_score,
          MIN(fake_score) as min_fake_score,
          COUNT(CASE WHEN fake_score > 50 THEN 1 END) as fake_count,
          COUNT(CASE WHEN fake_score <= 50 THEN 1 END) as real_count,
          MIN(uploaded_at) as first_analysis,
          MAX(uploaded_at) as last_analysis
        FROM reports
        WHERE user_id = ?
      `, [userId]);
      
      return stats[0];
    } catch (error) {
      console.error(`Eroare la obținerea statisticilor rapoartelor pentru utilizatorul ${userId}:`, error);
      throw new Error('Eroare la obținerea statisticilor rapoartelor pentru utilizator');
    }
  }
};

module.exports = advancedReportModel;