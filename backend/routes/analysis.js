const express = require('express');
const router = express.Router();
const db = require('../db');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const FormData = require('form-data');


router.post('/upload', async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    console.log('Niciun fișier primit în cerere.');
    return res.status(400).json({ error: 'Niciun fișier încărcat.' });
  }

  const mediaFile = req.files.video;
  const uploadPath = path.join(__dirname, '/../uploads/', mediaFile.name);

  console.log(`Fișier primit: ${mediaFile.name}`);
  console.log(`Încerc să mut fișierul la: ${uploadPath}`);

  try {
    
    await mediaFile.mv(uploadPath);
    console.log(`Fișierul a fost mutat cu succes la: ${uploadPath}`);

    
    const report = await scanVideoWithDeepfakeDetector(uploadPath);
    if (!report) {
      throw new Error('Nu s-a primit un raport de la detectorul deepfake.');
    }

    
    console.log('Structura raportului deepfake:', report);

    
    const sql = `INSERT INTO reports (file_name, detection_result, confidence_score, fake_score, user_id, uploaded_at) 
                 VALUES (?, ?, ?, ?, ?, NOW())`;
    await db.promise().execute(sql, [
      mediaFile.name,
      JSON.stringify(report), 
      report.confidence_score || null,  
      report.fake_score || null,
      req.body.userId || null
    ]);

    
    res.json({
      success: true,
      detectionResult: report 
    });

  } catch (error) {
    console.error('Eroare la scanarea fișierului: ', error.message);
    res.status(500).json({ error: 'A apărut o eroare la scanarea fișierului.' });

  } finally {
    fs.unlink(uploadPath, (err) => {
      if (err) console.error('Eroare la ștergerea fișierului încărcat:', err);
      else console.log('Fișierul a fost șters cu succes.');
    });
  }
});


router.post('/uploadImage', async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    console.log('Niciun fișier primit în cerere.');
    return res.status(400).json({ error: 'Niciun fișier încărcat.' });
  }

  const imageFile = req.files.image;
  const uploadPath = path.join(__dirname, '/../uploads/', imageFile.name);

  console.log(`Fișier primit: ${imageFile.name}`);
  console.log(`Încerc să mut fișierul la: ${uploadPath}`);

  try {
    
    await imageFile.mv(uploadPath);
    console.log(`Fișierul a fost mutat cu succes la: ${uploadPath}`);

    
    const report = await scanImageWithDeepfakeDetector(uploadPath);
    if (!report) {
      throw new Error('Nu s-a primit un raport de la detectorul deepfake.');
    }

    
    console.log('Structura raportului deepfake:', report);

    
    const sql = `INSERT INTO reports (file_name, detection_result, confidence_score, fake_score, user_id, uploaded_at) 
                 VALUES (?, ?, ?, ?, ?, NOW())`;
    await db.promise().execute(sql, [
      imageFile.name,
      JSON.stringify(report), 
      report.confidence_score || null,  
      report.fake_score || null,
      req.body.userId || null
    ]);

    
    res.json({
      success: true,
      detectionResult: report 
    });

  } catch (error) {
    console.error('Eroare la scanarea fișierului: ', error.message);
    res.status(500).json({ error: 'A apărut o eroare la scanarea fișierului.' });

  } finally {
    fs.unlink(uploadPath, (err) => {
      if (err) console.error('Eroare la ștergerea fișierului încărcat:', err);
      else console.log('Fișierul a fost șters cu succes.');
    });
  }
});


async function scanVideoWithDeepfakeDetector(filePath) {
  try {
    console.log(`Trimit fișierul la detectorul deepfake: ${filePath}`);

    const command = `python backend/deepfakeDetector/deepfake_detector.py ${filePath}`;
    const { stdout, stderr } = await exec(command);

    if (stderr) {
      console.error('Eroare la rularea detectorului deepfake:', stderr);
      throw new Error('A apărut o eroare la rularea detectorului deepfake.');
    }

    console.log('Răspuns primit de la detectorul deepfake:', stdout);

    const report = JSON.parse(stdout);
    console.log('Raport JSON decodat:', report);

    return report;
  } catch (error) {
    console.error("Eroare la trimiterea fișierului la detectorul deepfake: ", error.message);
    throw new Error("A apărut o eroare la trimiterea fișierului la detectorul deepfake.");
  }
}


async function scanImageWithDeepfakeDetector(filePath) {
  try {
    console.log(`Trimit imaginea la detectorul deepfake: ${filePath}`);

    const command = `python backend/deepfakeDetector/deepfake_detector.py ${filePath}`;
    const { stdout, stderr } = await exec(command);

    if (stderr) {
      console.error('Eroare la rularea detectorului deepfake:', stderr);
      throw new Error('A apărut o eroare la rularea detectorului deepfake.');
    }

    console.log('Răspuns primit de la detectorul deepfake:', stdout);

    const report = JSON.parse(stdout);
    console.log('Raport JSON decodat:', report);

    return report;
  } catch (error) {
    console.error("Eroare la trimiterea imaginii la detectorul deepfake: ", error.message);
    throw new Error("A apărut o eroare la trimiterea imaginii la detectorul deepfake.");
  }
}

module.exports = router;
