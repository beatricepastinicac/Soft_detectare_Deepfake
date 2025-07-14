/**
 * Test pentru debugging heatmap overlay aplicare
 */
const HeatmapService = require('./services/HeatmapService');
const path = require('path');
const fs = require('fs');

async function testHeatmapOverlay() {
  console.log('🔍 Testing heatmap overlay generation...');
  
  const heatmapService = new HeatmapService();
  const testImagePath = path.join(__dirname, 'uploads', '1_1752480735936_enhanced_red_heatmap_20250714_111236.jpg');
  
  try {
    // Test 1: Verifică generarea regiunilor
    const testRegions = heatmapService.generateSuspiciousRegions(500, 500, 56.73, 'premium');
    console.log('\n📍 Generated regions:');
    console.log(`  - Number of regions: ${testRegions.length}`);
    console.log('  - Sample region:', testRegions[0]);
    
    // Test 2: Generează overlay SVG direct
    const svgOverlay = await heatmapService.createPremiumHeatmapOverlay(500, 500, testRegions);
    console.log('\n🎨 SVG Overlay:');
    console.log(`  - Buffer size: ${svgOverlay.length} bytes`);
    console.log('  - First 200 chars:', svgOverlay.toString().substring(0, 200));
    
    // Test 3: Generează heatmap complet
    const analysisData = {
      id: Date.now(),
      fake_score: 56.73,
      confidence_score: 30.02,
      uploaded_at: new Date().toISOString(),
      user_id: 2
    };
    
    const heatmapOptions = {
      type: 'premium',
      quality: 'high',
      format: 'jpg',
      userId: 2,
      features: {
        fakeScore: 56.73,
        intensity: 0.8,
        colorScheme: 'redHeat'
      }
    };
    
    const result = await heatmapService.generateHeatmap(testImagePath, analysisData, heatmapOptions);
    
    console.log('\n🔥 Full heatmap generation:');
    console.log('  - Success:', result.success);
    if (result.success) {
      console.log('  - Generated file:', result.fileName);
      console.log('  - Heatmap path:', result.heatmapPath);
      console.log('  - Stats:', JSON.stringify(result.stats, null, 2));
      
      // Verifică dacă fișierul generat există și are conținut
      if (fs.existsSync(result.heatmapPath)) {
        const fileStats = fs.statSync(result.heatmapPath);
        console.log('  - File size:', fileStats.size, 'bytes');
        console.log('  - File created:', fileStats.birthtime);
        
        // Citește primii bytes pentru a verifica dacă e un JPEG valid
        const fileBuffer = fs.readFileSync(result.heatmapPath);
        const isJPEG = fileBuffer[0] === 0xFF && fileBuffer[1] === 0xD8;
        console.log('  - Is valid JPEG:', isJPEG);
        
        // Salvează o copie pentru debugging
        const debugPath = path.join(__dirname, 'debug_heatmap_test.jpg');
        fs.copyFileSync(result.heatmapPath, debugPath);
        console.log('  - Debug copy saved to:', debugPath);
      } else {
        console.log('  ❌ Generated file does not exist!');
      }
    } else {
      console.log('  - Error:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run test
testHeatmapOverlay().then(() => {
  console.log('\n🏁 Heatmap overlay test completed');
}).catch(error => {
  console.error('💥 Test error:', error);
});
