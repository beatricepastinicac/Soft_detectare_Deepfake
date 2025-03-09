const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/summary', async (req, res) => {
  try {
    const [totalResults] = await db.execute('SELECT COUNT(*) as total FROM reports');
    
    const [distribution] = await db.execute(`
      SELECT 
        SUM(CASE WHEN fake_score > 50 THEN 1 ELSE 0 END) as fake_count,
        SUM(CASE WHEN fake_score <= 50 THEN 1 ELSE 0 END) as real_count
      FROM reports
    `);
    
    const [dailyActivity] = await db.execute(`
      SELECT 
        DATE(uploaded_at) as date,
        COUNT(*) as count
      FROM reports
      GROUP BY DATE(uploaded_at)
      ORDER BY date DESC
      LIMIT 30
    `);
    
    const [scoreDistribution] = await db.execute(`
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
    
    res.json({
      totalAnalyses: totalResults[0].total,
      distribution: {
        fake: distribution[0].fake_count,
        real: distribution[0].real_count
      },
      dailyActivity,
      scoreDistribution
    });
  } catch (error) {
    console.error('Eroare la obținerea statisticilor:', error);
    res.status(500).json({ error: 'Eroare la obținerea statisticilor' });
  }
});

module.exports = router;