const db = require('../db');

const statsModel = {
  getDailyStats: async (limit = 30) => {
    try {
      const [rows] = await db.execute(`
        SELECT 
          DATE(uploaded_at) as analysis_date,
          COUNT(*) as total_analyses,
          COUNT(CASE WHEN fake_score > 50 THEN 1 END) as fake_count,
          COUNT(CASE WHEN fake_score <= 50 THEN 1 END) as real_count,
          AVG(fake_score) as avg_fake_score,
          COUNT(DISTINCT user_id) as unique_users
        FROM reports
        GROUP BY DATE(uploaded_at)
        ORDER BY analysis_date DESC 
        LIMIT ?
      `, [limit]);
      return rows;
    } catch (error) {
      console.error('Eroare la obținerea statisticilor zilnice:', error);
      throw new Error('Eroare la obținerea statisticilor zilnice');
    }
  },

  getUserStats: async (limit = 100) => {
    try {
      const [rows] = await db.execute(`
        SELECT 
          u.id as user_id,
          u.username,
          u.email,
          u.tier,
          COUNT(r.id) as total_analyses,
          COUNT(CASE WHEN r.fake_score > 50 THEN 1 END) as fake_detected,
          COUNT(CASE WHEN r.fake_score <= 50 THEN 1 END) as real_detected,
          AVG(r.fake_score) as avg_fake_score,
          MAX(r.uploaded_at) as last_analysis,
          u.created_at as user_created_at
        FROM users u
        LEFT JOIN reports r ON u.id = r.user_id
        GROUP BY u.id, u.username, u.email, u.tier, u.created_at
        ORDER BY total_analyses DESC 
        LIMIT ?
      `, [limit]);
      return rows;
    } catch (error) {
      console.error('Eroare la obținerea statisticilor per utilizator:', error);
      throw new Error('Eroare la obținerea statisticilor per utilizator');
    }
  },

  getGeneralStats: async () => {
    try {
      let [stats] = await db.execute('SELECT * FROM statistics WHERE id = 1 LIMIT 1');
      
      if (stats.length === 0) {
        const [reportStats] = await db.execute(`
          SELECT 
            COUNT(*) as total_analyses,
            COUNT(CASE WHEN fake_score > 50 THEN 1 END) as total_fake_detected,
            COUNT(CASE WHEN fake_score <= 50 THEN 1 END) as total_real_detected,
            AVG(fake_score) as avg_fake_score
          FROM reports
        `);
        
        const [userCount] = await db.execute('SELECT COUNT(*) as total_users FROM users');
        
        const newStats = {
          total_analyses: reportStats[0].total_analyses,
          total_users: userCount[0].total_users,
          total_fake_detected: reportStats[0].total_fake_detected,
          total_real_detected: reportStats[0].total_real_detected,
          avg_fake_score: reportStats[0].avg_fake_score || 0
        };
        
        await db.execute(`
          INSERT INTO statistics (id, total_analyses, total_users, total_fake_detected, total_real_detected, avg_fake_score)
          VALUES (1, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          total_analyses = VALUES(total_analyses),
          total_users = VALUES(total_users),
          total_fake_detected = VALUES(total_fake_detected),
          total_real_detected = VALUES(total_real_detected),
          avg_fake_score = VALUES(avg_fake_score)
        `, [newStats.total_analyses, newStats.total_users, newStats.total_fake_detected, newStats.total_real_detected, newStats.avg_fake_score]);
        
        return newStats;
      }
      
      return stats[0];
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