/**
 * Test pentru verificarea istoricului și heatmap-urilor salvate
 */
const axios = require('axios');

async function testUserHistory() {
  console.log('🔍 Testing user history and heatmap storage...');
  
  try {
    // Simulezi autentificarea cu token (din loguri, pentru user 2)
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsImVtYWlsIjoicGFzdGluaWNhYmVhdHJpY2VAZ21haWwuY29tIiwiaWF0IjoxNzUyNTAyODcyLCJleHAiOjE3NTI1ODkyNzJ9.CtmQRFQYwQ9aIxMpHoSWF8Vp5hDLF7fuSSa3Ypa7lAI';
    
    const response = await axios.get('http://localhost:5000/api/reports/history', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('\n📊 User history response:');
    console.log('Status:', response.status);
    console.log('Total reports:', response.data.reports ? response.data.reports.length : 0);
    
    if (response.data.reports && response.data.reports.length > 0) {
      console.log('\n🔍 Latest reports (first 3):');
      const latestReports = response.data.reports.slice(0, 3);
      
      latestReports.forEach((report, index) => {
        console.log(`\n--- Report ${index + 1} (ID: ${report.id}) ---`);
        console.log('File name:', report.file_name);
        console.log('Fake score:', report.fake_score);
        console.log('Heatmap path:', report.heatmap_path);
        console.log('Uploaded at:', report.uploaded_at);
        
        // Verifică dacă există heatmap în raw_data
        if (report.detection_result) {
          try {
            const rawData = JSON.parse(report.detection_result);
            console.log('Raw data heatmapUrl:', rawData.heatmapUrl);
            console.log('Raw data heatmapPath:', rawData.heatmapPath);
          } catch (e) {
            console.log('Raw data parsing error:', e.message);
          }
        }
      });
    } else {
      console.log('❌ No reports found in history');
    }
    
  } catch (error) {
    console.error('❌ Error fetching user history:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run test
testUserHistory().then(() => {
  console.log('\n🏁 History test completed');
}).catch(error => {
  console.error('💥 History test error:', error);
});
