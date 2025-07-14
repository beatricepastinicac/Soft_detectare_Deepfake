const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class PDFReportService {
  static async generateAnalysisReport(analysisData, imagePath, heatmapPath = null) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          info: {
            Title: 'Raport Analiză Deepfake',
            Author: 'BeeDetection',
            Subject: `Analiză deepfake pentru ${analysisData.fileName}`,
            Keywords: 'deepfake, analiză, AI, BeeDetection'
          }
        });
        
        const reportFileName = `analiza_deepfake_${Date.now()}.pdf`;
        const reportPath = path.join(__dirname, '..', 'exports', reportFileName);
        
        // Ensure exports directory exists
        const exportsDir = path.dirname(reportPath);
        if (!fs.existsSync(exportsDir)) {
          fs.mkdirSync(exportsDir, { recursive: true });
        }
        
        const stream = fs.createWriteStream(reportPath);
        doc.pipe(stream);

        // === PAGE 1: COVER & SUMMARY ===
        this.addHeader(doc, 'BeeDetection');
        this.addSubtitle(doc, 'Raport de analiză deepfake');
        
        // Main score card
        this.addScoreCard(doc, analysisData);
        
        // General information box
        this.addInfoBox(doc, analysisData);
        
        // Analysis explanation
        if (analysisData.analysisDetails && analysisData.analysisDetails.explanation) {
          this.addExplanationSection(doc, analysisData.analysisDetails.explanation);
        }
        
        // === PAGE 2: DETAILED ANALYSIS ===
        doc.addPage();
        this.addHeader(doc, 'Detalii analiză');
        
        // Technical details
        this.addTechnicalDetails(doc, analysisData);
        
        // === PAGE 3: IMAGES ===
        if (imagePath && fs.existsSync(imagePath)) {
          doc.addPage();
          this.addImageSection(doc, 'Imaginea analizată', imagePath);
        }
        
        if (heatmapPath && fs.existsSync(heatmapPath)) {
          doc.addPage();
          this.addHeatmapSection(doc, heatmapPath);
        }
        
        // Footer on all pages
        this.addFooter(doc);
        
        doc.end();
        
        stream.on('finish', () => {
          resolve({
            success: true,
            filePath: reportPath,
            fileName: reportFileName,
            downloadUrl: `/api/analysis/download-report/${reportFileName}`
          });
        });
        
        stream.on('error', reject);
        
      } catch (error) {
        reject(error);
      }
    });
  }

  static addHeader(doc, title) {
    // Logo/Brand area
    doc.rect(50, 50, 500, 80)
       .fillAndStroke('#1a73e8', '#1a73e8');
    
    doc.fillColor('#ffffff')
       .fontSize(28)
       .font('Helvetica-Bold')
       .text(title, 50, 75, { align: 'center', width: 500 });
    
    doc.moveDown(2);
  }

  static addSubtitle(doc, subtitle) {
    doc.fillColor('#666666')
       .fontSize(16)
       .font('Helvetica')
       .text(subtitle, { align: 'center' });
    
    doc.moveDown(1.5);
  }

  static addScoreCard(doc, analysisData) {
    const scoreColor = analysisData.fakeScore > 70 ? '#d32f2f' : 
                      analysisData.fakeScore > 40 ? '#f57c00' : '#388e3c';
    
    // Score card background
    doc.rect(50, doc.y, 500, 120)
       .fillAndStroke('#f8f9fa', '#e0e0e0');
    
    const cardY = doc.y - 120;
    
    // Main score
    doc.fillColor(scoreColor)
       .fontSize(48)
       .font('Helvetica-Bold')
       .text(`${Math.round(analysisData.fakeScore)}%`, 70, cardY + 30);
    
    // Score label
    doc.fillColor('#333333')
       .fontSize(14)
       .font('Helvetica')
       .text('Scor Deepfake', 70, cardY + 85);
    
    // Verdict
    const verdict = analysisData.fakeScore > 70 ? 'POSIBIL DEEPFAKE' :
                   analysisData.fakeScore > 40 ? 'SUSPECT' : 'PROBABIL AUTENTIC';
    
    doc.fillColor(scoreColor)
       .fontSize(24)
       .font('Helvetica-Bold')
       .text(verdict, 250, cardY + 40, { align: 'center', width: 280 });
    
    // Confidence if available
    if (analysisData.confidenceScore) {
      doc.fillColor('#666666')
         .fontSize(12)
         .font('Helvetica')
         .text(`Încredere: ${Math.round(analysisData.confidenceScore)}%`, 250, cardY + 80, { align: 'center', width: 280 });
    }
    
    doc.moveDown(3);
  }

  static addInfoBox(doc, analysisData) {
    const startY = doc.y;
    
    // Info box
    doc.rect(50, startY, 500, 100)
       .fillAndStroke('#ffffff', '#e0e0e0');
    
    doc.fillColor('#1a73e8')
       .fontSize(16)
       .font('Helvetica-Bold')
       .text('Detalii analiză:', 70, startY + 15);
    
    const analysisDate = new Date(analysisData.analysisTime || Date.now()).toLocaleString('ro-RO');
    
    doc.fillColor('#333333')
       .fontSize(11)
       .font('Helvetica')
       .text(`Data analizei: ${analysisDate}`, 70, startY + 40)
       .text(`Nume fișier: ${analysisData.fileName}`, 70, startY + 55)
       .text(`Model utilizat: ${analysisData.modelType === 'advanced' ? 'Avansat (Premium)' : 'De bază'}`, 70, startY + 70)
       .text(`Timp de procesare: ${analysisData.processingTime || 'N/A'}s`, 350, startY + 40)
       .text(`Fețe detectate: ${analysisData.facesDetected || 1}`, 350, startY + 55)
       .text(`Tip analiză: ${analysisData.heatmapAdvanced ? 'Premium' : 'Standard'}`, 350, startY + 70);
    
    doc.y = startY + 120;
    doc.moveDown(1);
  }

  static addExplanationSection(doc, explanation) {
    // Explanation section
    doc.fillColor('#1a73e8')
       .fontSize(16)
       .font('Helvetica-Bold')
       .text('Interpretarea rezultatelor:', { underline: true });
    
    doc.moveDown(0.5);
    
    // Verdict box
    doc.rect(50, doc.y, 500, 40)
       .fillAndStroke('#f0f7ff', '#1a73e8');
    
    doc.fillColor('#1a73e8')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(explanation.verdict, 70, doc.y - 25);
    
    doc.moveDown(1.5);
    
    // Reasons
    doc.fillColor('#333333')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('Motivele analizei:');
    
    doc.moveDown(0.3);
    doc.font('Helvetica');
    
    explanation.reasons.forEach((reason, index) => {
      doc.fillColor('#555555')
         .text(`${index + 1}. ${reason}`, { indent: 20 });
      doc.moveDown(0.2);
    });
    
    doc.moveDown(0.5);
    
    // Recommendation box
    doc.rect(50, doc.y, 500, 60)
       .fillAndStroke('#fff3e0', '#f57c00');
    
    doc.fillColor('#e65100')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('Recomandare:', 70, doc.y - 45);
    
    doc.fillColor('#bf360c')
       .fontSize(11)
       .font('Helvetica')
       .text(explanation.recommendation, 70, doc.y - 25, { width: 460, align: 'left' });
  }

  static addTechnicalDetails(doc, analysisData) {
    doc.fillColor('#1a73e8')
       .fontSize(16)
       .font('Helvetica-Bold')
       .text('Detalii tehnice', { underline: true });
    
    doc.moveDown(0.8);
    
    // Technical details in a table-like format
    const details = [
      ['Model Type', analysisData.modelType || 'basic'],
      ['Processing Time', `${analysisData.processingTime || 'N/A'} secunde`],
      ['Fake Score', `${analysisData.fakeScore}%`],
      ['Confidence Score', `${analysisData.confidenceScore || 'N/A'}%`],
      ['Is Deepfake', analysisData.isDeepfake ? 'Da' : 'Nu'],
      ['Faces Detected', analysisData.facesDetected || 1],
      ['Heatmap Generated', analysisData.heatmapUrl ? 'Da' : 'Nu'],
      ['Premium Features', analysisData.heatmapAdvanced ? 'Da' : 'Nu']
    ];
    
    details.forEach((detail, index) => {
      const y = doc.y;
      
      // Alternating row colors
      if (index % 2 === 0) {
        doc.rect(50, y - 5, 500, 20)
           .fillAndStroke('#f8f9fa', '#f8f9fa');
      }
      
      doc.fillColor('#333333')
         .fontSize(11)
         .font('Helvetica-Bold')
         .text(detail[0], 70, y, { width: 200 });
      
      doc.fillColor('#555555')
         .font('Helvetica')
         .text(detail[1], 300, y, { width: 200 });
      
      doc.moveDown(0.6);
    });
    
    // Additional analysis details if available
    if (analysisData.analysisDetails) {
      doc.moveDown(1);
      
      doc.fillColor('#1a73e8')
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('Analiză detaliată:', { underline: true });
      
      doc.moveDown(0.5);
      
      const details = analysisData.analysisDetails;
      
      if (details.faceDetection) {
        doc.fillColor('#333333')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('Detectare față:');
        
        doc.fillColor('#555555')
           .fontSize(11)
           .font('Helvetica')
           .text(`• Fețe detectate: ${details.faceDetection.facesFound}`, { indent: 20 })
           .text(`• Calitatea feței: ${Math.round(details.faceDetection.faceQuality)}%`, { indent: 20 });
        
        doc.moveDown(0.5);
      }
      
      if (details.artificialMarkers) {
        doc.fillColor('#333333')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('Markeri artificiali:');
        
        doc.fillColor('#555555')
           .fontSize(11)
           .font('Helvetica')
           .text(`• Inconsistențe blur: ${Math.round(details.artificialMarkers.blurInconsistencies * 100)}%`, { indent: 20 })
           .text(`• Artefacte compresie: ${Math.round(details.artificialMarkers.compressionArtifacts * 100)}%`, { indent: 20 })
           .text(`• Claritate margini: ${Math.round(details.artificialMarkers.edgeSharpness * 100)}%`, { indent: 20 });
      }
    }
  }

  static addImageSection(doc, title, imagePath) {
    this.addHeader(doc, title);
    
    try {
      doc.image(imagePath, {
        fit: [500, 600],
        align: 'center'
      });
    } catch (imageError) {
      console.error('Error adding image to PDF:', imageError);
      doc.fillColor('#d32f2f')
         .fontSize(12)
         .text('Eroare la încărcarea imaginii', { align: 'center' });
    }
  }

  static addHeatmapSection(doc, heatmapPath) {
    this.addHeader(doc, 'Heatmap de analiză');
    
    // Explanation box
    doc.rect(50, doc.y, 500, 80)
       .fillAndStroke('#fff3e0', '#f57c00');
    
    doc.fillColor('#e65100')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('Ce reprezintă heatmap-ul:', 70, doc.y - 65);
    
    doc.fillColor('#bf360c')
       .fontSize(11)
       .font('Helvetica')
       .text('Zonele evidențiate în roșu indică regiunile din imagine cu probabilitate mare de manipulare digitală. Cu cât culoarea este mai intensă, cu atât probabilitatea de modificare este mai mare.', 70, doc.y - 45, { width: 460 });
    
    doc.moveDown(2);
    
    try {
      doc.image(heatmapPath, {
        fit: [500, 500],
        align: 'center'
      });
    } catch (heatmapError) {
      console.error('Error adding heatmap to PDF:', heatmapError);
      doc.fillColor('#d32f2f')
         .fontSize(12)
         .text('Eroare la încărcarea heatmap-ului', { align: 'center' });
    }
  }

  static addFooter(doc) {
    const pageCount = doc.bufferedPageRange().count;
    
    for (let i = 0; i < pageCount; i++) {
      try {
        doc.switchToPage(i);
        
        // Footer line
        doc.strokeColor('#e0e0e0')
           .lineWidth(1)
           .moveTo(50, doc.page.height - 80)
           .lineTo(550, doc.page.height - 80)
           .stroke();
        
        // Footer text
        doc.fillColor('#666666')
           .fontSize(10)
           .font('Helvetica')
           .text('Generat de BeeDetection - Sistem avansat de detectare deepfake', 50, doc.page.height - 65, {
             align: 'center',
             width: 500
           });
        
        // Page number
        doc.text(`Pagina ${i + 1} din ${pageCount}`, 50, doc.page.height - 50, {
          align: 'center',
          width: 500
        });
        
        // Timestamp
        const timestamp = new Date().toLocaleString('ro-RO');
        doc.text(`Generat la: ${timestamp}`, 50, doc.page.height - 35, {
          align: 'center',
          width: 500
        });
      } catch (error) {
        console.log(`Error adding footer to page ${i}: ${error.message}`);
      }
    }
  }
}

module.exports = PDFReportService;
