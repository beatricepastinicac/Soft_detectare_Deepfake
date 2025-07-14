const express = require('express');
const router = express.Router();
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Endpoint special pentru testarea heatmap-ului îmbunătățit cu roșu
router.post('/test-enhanced-heatmap', async (req, res) => {
  try {
    console.log('🔥 TEST ENDPOINT: Enhanced Red Heatmap Generator');
    
    // Verifică dacă există fișierul de test
    const testImagePath = path.join(__dirname, '..', 'public', 'uploads', '1_1743760600919.jpeg');
    
    if (!fs.existsSync(testImagePath)) {
      return res.status(400).json({
        error: 'Test image not found',
        message: 'Fișierul de test nu a fost găsit'
      });
    }
    
    // Calea către wrapper-ul îmbunătățit
    const wrapperPath = path.join(__dirname, '..', 'deepfakeDetector', 'enhancedRedHeatmapWrapper.py');
    
    if (!fs.existsSync(wrapperPath)) {
      return res.status(500).json({
        error: 'Enhanced heatmap wrapper not found',
        message: 'Wrapper-ul pentru heatmap îmbunătățit nu a fost găsit'
      });
    }
    
    console.log('📁 Test image:', testImagePath);
    console.log('🔧 Wrapper path:', wrapperPath);
    
    // Execută wrapper-ul cu format JSON
    const process = spawn('python', [wrapperPath, testImagePath, '--format', 'json'], {
      cwd: path.join(__dirname, '..', 'deepfakeDetector')
    });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      console.log('📊 Enhanced heatmap process finished with code:', code);
      
      if (code === 0) {
        try {
          // Salvează output-ul în fișier și citește-l din nou pentru parsing corect
          const tempJsonFile = path.join(__dirname, '..', 'temp', 'test_output.json');
          
          // Extrage doar JSON-ul din output
          const jsonMatch = stdout.match(/\{[\s\S]*?\}/);
          
          if (jsonMatch) {
            const jsonString = jsonMatch[0];
            
            // Salvează în fișier
            fs.writeFileSync(tempJsonFile, jsonString, 'utf8');
            
            // Citește din nou pentru parsing corect
            const fileContent = fs.readFileSync(tempJsonFile, 'utf8');
            const result = JSON.parse(fileContent);
            
            // Șterge fișierul temporar
            fs.unlinkSync(tempJsonFile);
            
            console.log('✅ JSON parsed successfully via file method');
            
            // Verifică dacă fișierul a fost generat
            const outputExists = fs.existsSync(result.output_path);
            const fileSize = outputExists ? fs.statSync(result.output_path).size : 0;
            
            console.log('✅ Enhanced heatmap test successful!');
            console.log('🎯 Artifact coverage:', result.artifact_coverage_percent + '%');
            console.log('🔴 High intensity pixels:', result.high_intensity_pixels);
            
            res.json({
              success: true,
              message: 'Enhanced red heatmap test completed successfully',
              result: {
                status: result.status,
                outputPath: result.output_path,
                deepfakeScore: result.deepfake_score,
                artifactCoverage: result.artifact_coverage_percent,
                highIntensityPixels: result.high_intensity_pixels,
                totalPixels: result.total_pixels,
                heatmapType: result.heatmap_type,
                version: result.version,
                enhancedFeatures: result.enhanced_red_features,
                fileGenerated: outputExists,
                fileSize: fileSize
              },
              testInfo: {
                inputImage: testImagePath,
                wrapperPath: wrapperPath,
                processCode: code,
                timestamp: new Date().toISOString()
              }
            });
            
          } else {
            throw new Error('No JSON output found from enhanced heatmap generator');
          }
          
        } catch (parseError) {
          console.error('❌ Error parsing enhanced heatmap output:', parseError);
          console.error('📄 Raw stdout sample:', stdout.substring(0, 500));
          
          res.status(500).json({
            success: false,
            error: 'JSON parsing failed',
            message: parseError.message,
            stdout: stdout.substring(0, 1000),
            stderr: stderr.substring(0, 500)
          });
        }
      } else {
        console.error('❌ Enhanced heatmap generation failed:', stderr);
        
        res.status(500).json({
          success: false,
          error: 'Heatmap generation failed',
          message: `Process exited with code ${code}`,
          stderr: stderr.substring(0, 500)
        });
      }
    });
    
    process.on('error', (error) => {
      console.error('❌ Error spawning enhanced heatmap process:', error);
      res.status(500).json({
        success: false,
        error: 'Process spawn failed',
        message: error.message
      });
    });
    
  } catch (error) {
    console.error('❌ Test endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

module.exports = router;
