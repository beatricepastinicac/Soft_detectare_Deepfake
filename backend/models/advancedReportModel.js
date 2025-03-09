const db = require('../db');

const advancedReportModel = {
  getUserReports: async (userId, filters = {}, limit = 50, offset = 0) => {
    try {
      const { startDate, endDate, minScore, maxScore } = filters;
      
      const [rows] = await db.execute(
        'CALL get_user_reports(?, ?, ?, ?, ?, ?, ?)',
        [
          userId,
          startDate || null,
          endDate || null,
          minScore || null,
          maxScore || null,
          parseInt(limit),
          parseInt(offset)
        ]
      );
      
      return rows[0];
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
      
      return report[0];
    } catch (error) {
      console.error(`Eroare la obținerea detaliilor pentru raportul ${reportId}:`, error);
      throw new Error('Eroare la obținerea detaliilor raportului');
    }
  }
};

module.exports = advancedReportModel;