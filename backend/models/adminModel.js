const db = require('../db');

const adminModel = {
  getDashboardData: async () => {
    try {
      const [stats] = await db.execute('SELECT * FROM statistics');
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
      await db.execute('CALL delete_old_guest_reports(?)', [days]);
      const [count] = await db.execute('SELECT COUNT(*) as count FROM reports WHERE user_id IS NULL');
      
      return {
        success: true,
        remainingReports: count[0].count,
        message: `Rapoartele vechi (> ${days} zile) au fost șterse cu succes`
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
  }
};

module.exports = adminModel;