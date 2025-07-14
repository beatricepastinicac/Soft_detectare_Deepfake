const heatmapService = require('./services/HeatmapService');
const path = require('path');

async function testPremiumHeatmap() {
  console.log('🧪 Testing Premium Heatmap Generation...');
  
  const testImagePath = path.join(__dirname, 'uploads', 'imagine_prelucrata_1743429835392_1752511449643.jpeg');
  const analysisData = {
    fake_score: 75,
    confidence_score: 80,
    user_id: 1
  };
  
  const options = {
    type: 'premium',
    quality: 'high',
    format: 'jpg'
  };
  
  try {
    console.log('🔄 Generating premium heatmap...');
    const result = await heatmapService.generateHeatmap(testImagePath, analysisData, options);
    
    if (result.success) {
      console.log('✅ Premium heatmap generated successfully!');
      console.log('📊 Stats:', JSON.stringify(result.stats, null, 2));
      
      // Verifică dacă imageBuffer există
      if (result.imageBuffer) {
        // Salvează rezultatul pentru inspecție
        const fs = require('fs');
        const outputPath = path.join(__dirname, 'test_premium_output.jpg');
        fs.writeFileSync(outputPath, result.imageBuffer);
        console.log(`💾 Saved test result to: ${outputPath}`);
      } else {
        console.log('⚠️  imageBuffer is undefined, but heatmap was saved to public folder');
      }
    } else {
      console.log('❌ Failed:', result.error);
    }
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

testPremiumHeatmap();
