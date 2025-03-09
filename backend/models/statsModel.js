const db = require('../db');

const statsModel = {
  getDailyStats: async (limit = 30) => {
    try {
      const [rows] = await db.execute('SELECT * FROM vw_daily_stats ORDER BY analysis_date DESC LIMIT ?', [limit]);
      return rows;
    } catch (error) {
      console.error('Eroare la obținerea statisticilor zilnice:', error);
      throw new Error('Eroare la obținerea statisticilor zilnice');
    }
  },

  getUserStats: async (limit = 100) => {
    try {
      const [rows] = await db.execute('SELECT * FROM vw_user_stats ORDER BY total_analyses DESC LIMIT ?', [limit]);
      return rows;
    } catch (error) {
      console.error('Eroare la obținerea statisticilor per utilizator:', error);
      throw new Error('Eroare la obținerea statisticilor per utilizator');
    }
  },

  getGeneralStats: async () => {
    try {
      const [stats] = await db.execute('SELECT * FROM statistics LIMIT 1');
      return stats.length > 0 ? stats[0] : null;
    } catch (error) {
      console.error('Eroare la obținerea statisticilor generale:', error);
      throw new Error('Eroare la obținerea statisticilor generale');
    }
  },

  getScoreDistribution: async () => {
    try {
      const [rows] = await db.execute(`
        SELECT 
          CASE
            WHEN fake_score BETWEEN 0 AND 20 THEN '0-20'
            WHEN fake_score BETWEEN 21 AND 40 THEN '21-40'
            WHEN fake_score BETWEEN 41 AND 60 THEN '41-60'
            WHEN fake_score BETWEEN 61 AND 80 THEN '61-80'
            ELSE '81-100'
          END as score_range,
          COUNT(*) as count
        FROM reports
        GROUP BY score_range
        ORDER BY score_range
      `);
      return rows;
    } catch (error) {
      console.error('Eroare la obținerea distribuției scorurilor:', error);
      throw new Error('Eroare la obținerea distribuției scorurilor');
    }
  },

  getSummaryStats: async () => {
    try {
      const [stats] = await db.execute('SELECT * FROM statistics LIMIT 1');
      const [topFake] = await db.execute(`
        SELECT file_name, fake_score, confidence_score, uploaded_at 
        FROM reports 
        WHERE fake_score > 50 
        ORDER BY fake_score DESC LIMIT 5
      `);
      const [recentAnalyses] = await db.execute(`
        SELECT file_name, fake_score, confidence_score, uploaded_at 
        FROM reports 
        ORDER BY uploaded_at DESC LIMIT 5
      `);
      const [userCount] = await db.execute('SELECT COUNT(*) as count FROM users');
      const [reportCount] = await db.execute('SELECT COUNT(*) as count FROM reports');
      
      return {
        general: stats.length > 0 ? stats[0] : null,
        topFake,
        recentAnalyses,
        userCount: userCount[0].count,
        reportCount: reportCount[0].count
      };
    } catch (error) {
      console.error('Eroare la obținerea sumarului de statistici:', error);
      throw new Error('Eroare la obținerea sumarului de statistici');
    }
  }
};

module.exports = statsModel;