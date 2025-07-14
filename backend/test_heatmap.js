const express = require('express');
const path = require('path');
const HeatmapService = require('./services/HeatmapService');

// Test simplu pentru HeatmapService
async function testHeatmapService() {
  console.log('🧪 Testing HeatmapService...');
  
  const heatmapService = new HeatmapService();
  
  // Caută o imagine de test din uploads
  const testImagePath = path.join(__dirname, 'uploads', '1_1752480735936_enhanced_red_heatmap_20250714_111236.jpg');
  
  console.log(`📁 Test image path: ${testImagePath}`);
  
  const fs = require('fs');
  if (!fs.existsSync(testImagePath)) {
    console.log('❌ Test image not found at:', testImagePath);
    return;
  }
  
  try {
    console.log('🎯 Generating standard heatmap...');
    const result = await heatmapService.generateStandardHeatmap(testImagePath, {
      fakeScore: 75.5,
      intensity: 0.6,
      colorScheme: 'heat'
    });
    
    console.log('📊 Standard heatmap result:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('✅ Standard heatmap generated successfully!');
    } else {
      console.log('❌ Standard heatmap failed:', result.error);
    }
    
  } catch (error) {
    console.log('💥 Error testing heatmap service:', error.message);
    console.log('📝 Stack trace:', error.stack);
  }
}

testHeatmapService();
