const db = require('../db');

const adminModel = {
  getDashboardData: async () => {
    try {
      const [stats] = await db.execute('SELECT * FROM statistics WHERE id = 1');
      const [usersCount] = await db.execute('SELECT COUNT(*) as count FROM users');
      const [reportsCount] = await db.execute('SELECT COUNT(*) as count FROM reports');
      const [unreadContactsCount] = await db.execute('SELECT COUNT(*) as count FROM contacts WHERE is_read = 0');
      const [latestReports] = await db.execute(`
        SELECT r.id, r.file_name, r.fake_score, r.uploaded_at, u.username
        FROM reports r
        LEFT JOIN users u ON r.user_id = u.id
        ORDER BY r.uploaded_at DESC
        LIMIT 5
      `);
      const [latestUsers] = await db.execute(`
        SELECT id, username, email, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 5
      `);
      
      return {
        stats: stats.length > 0 ? stats[0] : null,
        counts: {
          users: usersCount[0].count,
          reports: reportsCount[0].count,
          unreadContacts: unreadContactsCount[0].count
        },
        latestReports,
        latestUsers
      };
    } catch (error) {
      console.error('Eroare la obținerea datelor pentru dashboard:', error);
      throw new Error('Eroare la obținerea datelor pentru dashboard');
    }
  },

  cleanOldReports: async (days = 30) => {
    try {
      const [result] = await db.execute('DELETE FROM reports WHERE user_id IS NULL AND uploaded_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [days]);
      const [count] = await db.execute('SELECT COUNT(*) as count FROM reports WHERE user_id IS NULL');
      
      return {
        success: true,
        deletedCount: result.affectedRows,
        remainingReports: count[0].count,
        message: `${result.affectedRows} rapoarte vechi (> ${days} zile) au fost șterse cu succes`
      };
    } catch (error) {
      console.error('Eroare la ștergerea rapoartelor vechi:', error);
      throw new Error('Eroare la ștergerea rapoartelor vechi');
    }
  },

  markContactsAsRead: async (contactIds) => {
    try {
      if (!Array.isArray(contactIds) || contactIds.length === 0) {
        throw new Error('Este necesară o listă validă de ID-uri de contacte');
      }
      
      const placeholders = contactIds.map(() => '?').join(', ');
      const [result] = await db.execute(
        `UPDATE contacts SET is_read = 1 WHERE id IN (${placeholders})`,
        contactIds
      );
      
      return {
        success: true,
        updatedCount: result.affectedRows,
        message: 'Contactele au fost marcate ca citite'
      };
    } catch (error) {
      console.error('Eroare la marcarea contactelor ca citite:', error);
      throw new Error('Eroare la marcarea contactelor ca citite');
    }
  },

  analyzeTables: async () => {
    try {
      await db.execute('ANALYZE TABLE reports, media_files, users, contacts, statistics');
      
      return {
        success: true,
        message: 'Tabelele au fost analizate cu succes'
      };
    } catch (error) {
      console.error('Eroare la analiza tabelelor:', error);
      throw new Error('Eroare la analiza tabelelor');
    }
  },

  getSystemStats: async () => {
    try {
      const [dailyAnalyses] = await db.execute(`
        SELECT DATE(uploaded_at) as date, COUNT(*) as count 
        FROM reports 
        WHERE uploaded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY DATE(uploaded_at)
        ORDER BY date DESC
      `);
      
      const [topUsers] = await db.execute(`
        SELECT u.username, COUNT(r.id) as analyses_count
        FROM users u
        LEFT JOIN reports r ON u.id = r.user_id
        GROUP BY u.id, u.username
        ORDER BY analyses_count DESC
        LIMIT 10
      `);
      
      const [fakeVsReal] = await db.execute(`
        SELECT 
          SUM(CASE WHEN fake_score > 50 THEN 1 ELSE 0 END) as fake_count,
          SUM(CASE WHEN fake_score <= 50 THEN 1 ELSE 0 END) as real_count
        FROM reports
      `);
      
      return {
        dailyAnalyses,
        topUsers,
        fakeVsReal: fakeVsReal[0]
      };
    } catch (error) {
      console.error('Eroare la obținerea statisticilor de sistem:', error);
      throw new Error('Eroare la obținerea statisticilor de sistem');
    }
  },

  getUsersWithMostAnalyses: async (limit = 10) => {
    try {
      const [rows] = await db.execute(`
        SELECT u.id, u.username, u.email, u.tier, COUNT(r.id) as total_analyses,
               AVG(r.fake_score) as avg_fake_score, MAX(r.uploaded_at) as last_analysis
        FROM users u
        LEFT JOIN reports r ON u.id = r.user_id
        GROUP BY u.id, u.username, u.email, u.tier
        ORDER BY total_analyses DESC
        LIMIT ?
      `, [limit]);
      return rows;
    } catch (error) {
      console.error('Eroare la obținerea utilizatorilor cu cele mai multe analize:', error);
      throw new Error('Eroare la obținerea utilizatorilor cu cele mai multe analize');
    }
  }
};

module.exports = adminModel;