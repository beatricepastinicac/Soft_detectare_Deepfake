/**
 * Test pentru generarea unui heatmap cu culori foarte vizibile
 */
const sharp = require('sharp');
const path = require('path');

async function createVisibleHeatmapTest() {
  console.log('🎨 Creating highly visible heatmap test...');
  
  const testImagePath = path.join(__dirname, 'uploads', '1_1752480735936_enhanced_red_heatmap_20250714_111236.jpg');
  const outputPath = path.join(__dirname, 'debug_visible_heatmap.jpg');
  
  try {
    // Creează un SVG overlay foarte vizibil
    const visibleSvg = `
      <svg width="500" height="500" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="highViz" cx="50%" cy="50%" r="50%">
            <stop offset="0%" style="stop-color:#FF0000;stop-opacity:1.0" />
            <stop offset="50%" style="stop-color:#FFFF00;stop-opacity:0.8" />
            <stop offset="100%" style="stop-color:#FF0000;stop-opacity:0.6" />
          </radialGradient>
        </defs>
        
        <!-- Big visible circles -->
        <circle cx="150" cy="150" r="50" fill="url(#highViz)" opacity="0.9" />
        <circle cx="350" cy="150" r="40" fill="rgba(255,0,0,0.8)" />
        <circle cx="250" cy="300" r="60" fill="rgba(0,255,0,0.7)" />
        <circle cx="100" cy="350" r="35" fill="rgba(0,0,255,0.8)" />
        <circle cx="400" cy="350" r="45" fill="rgba(255,255,0,0.9)" />
        
        <!-- Text pentru debugging -->
        <text x="200" y="50" fill="red" font-size="20" font-weight="bold">HEATMAP TEST</text>
      </svg>
    `;
    
    const svgBuffer = Buffer.from(visibleSvg);
    
    // Aplică overlay-ul pe imagine
    const result = await sharp(testImagePath)
      .composite([{
        input: svgBuffer,
        blend: 'multiply',
        opacity: 0.9
      }])
      .jpeg({ quality: 95 })
      .toFile(outputPath);
    
    console.log('✅ Visible heatmap test created:', outputPath);
    console.log('📊 Output info:', result);
    
    // Verifică dimensiunile
    const metadata = await sharp(outputPath).metadata();
    console.log('🔍 Output metadata:', {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: metadata.size
    });
    
  } catch (error) {
    console.error('❌ Error creating visible heatmap:', error.message);
  }
}

createVisibleHeatmapTest().then(() => {
  console.log('🏁 Visible heatmap test completed');
}).catch(error => {
  console.error('💥 Test failed:', error);
});
