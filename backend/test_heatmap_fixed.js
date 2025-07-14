/**
 * Test pentru verificarea corectării heatmap-ului
 */
const HeatmapService = require('./services/HeatmapService');
const path = require('path');

async function testHeatmapFixed() {
  console.log('🧪 Testing fixed heatmap generation...');
  
  const heatmapService = new HeatmapService();
  
  // Simulated image path și analysis data - folosim o imagine reală
  const testImagePath = path.join(__dirname, 'uploads', '1_1752480735936_enhanced_red_heatmap_20250714_111236.jpg');
  
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
      userId: 2,
      intensity: 0.8,
      colorScheme: 'redHeat',
      enhancedFeatures: true,
      multiLayer: true,
      statistics: true
    }
  };
  
  try {
    console.log('📋 Test parameters:');
    console.log('  - Image path:', testImagePath);
    console.log('  - Analysis data:', JSON.stringify(analysisData, null, 2));
    console.log('  - Options:', JSON.stringify(heatmapOptions, null, 2));
    
    const result = await heatmapService.generateHeatmap(testImagePath, analysisData, heatmapOptions);
    
    console.log('\n✅ Heatmap generation result:');
    console.log('  - Success:', result.success);
    console.log('  - Heatmap path:', result.heatmapPath);
    console.log('  - Heatmap URL:', result.heatmapUrl);
    console.log('  - File name:', result.fileName);
    console.log('  - Type:', result.type);
    console.log('  - Metadata:', result.metadata ? 'Present' : 'Missing');
    console.log('  - Stats:', result.stats ? JSON.stringify(result.stats, null, 2) : 'Missing');
    
    if (result.error) {
      console.log('  - Error:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run test
testHeatmapFixed().then(() => {
  console.log('\n🏁 Test completed');
}).catch(error => {
  console.error('💥 Test error:', error);
});
