document.getElementById("uploadForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    const mediaFile = document.getElementById("mediaFile").files[0];
    const userId = document.getElementById("userId").value; 

    if (!mediaFile) {
        showAlert("Vă rugăm să încărcați un fișier.", "error");
        return;
    }

    // Validare tip fișier
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'video/mp4', 'video/avi', 'video/mov', 'video/mkv'];
    if (!allowedTypes.includes(mediaFile.type) && !mediaFile.name.toLowerCase().match(/\.(jpg|jpeg|png|mp4|avi|mov|mkv)$/)) {
        showAlert("Tip de fișier nesuportat. Acceptăm doar imagini (JPG, PNG) și videoclipuri (MP4, AVI, MOV, MKV).", "error");
        return;
    }

    // Validare dimensiune fișier (50MB max pentru demo)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (mediaFile.size > maxSize) {
        showAlert("Fișierul este prea mare. Dimensiunea maximă acceptată este 50MB.", "error");
        return;
    }

    // Afișează loading state
    const resultDiv = document.getElementById("result");
    const submitButton = document.querySelector('button[type="submit"]');
    
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner"></span> Se procesează...';
    }
    
    if (resultDiv) {
        resultDiv.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>🔄 Analizarea fișierului în curs...</p><p class="loading-tip">Acest proces poate dura până la 30 de secunde</p></div>';
        resultDiv.style.display = 'block';
    }

    try {
        const result = await uploadFile(mediaFile, userId);
        
        console.log('Upload result:', result);
        
        if (result.success && result.result) {
            const detectionResult = result.result;
            displayResult(detectionResult, result);
            
            // Salvează în istoric local și încearcă și pe server
            const historyItem = {
                id: Date.now(),
                fileName: mediaFile.name,
                fakeScore: detectionResult.fakeScore,
                confidenceScore: detectionResult.confidenceScore,
                timestamp: new Date().toISOString(),
                userId: userId || 'anonymous',
                source: 'website',
                size: mediaFile.size,
                type: mediaFile.type,
                verdict: getVerdict(detectionResult.fakeScore)
            };
            
            saveToLocalHistory(historyItem);
            
            // Încearcă să salveze pe server dacă utilizatorul este autentificat
            if (userId && userId.trim() !== '') {
                try {
                    await saveToServerHistory(historyItem);
                } catch (serverError) {
                    console.warn('Could not save to server history:', serverError);
                }
            }
            
        } else if (result.detectionResult) {
            // Format vechi
            displayResult(result.detectionResult, result);
            saveToLocalHistory({
                id: Date.now(),
                fileName: mediaFile.name,
                fakeScore: result.detectionResult.fakeScore,
                confidenceScore: result.detectionResult.confidenceScore,
                timestamp: new Date().toISOString(),
                userId: userId || 'anonymous',
                source: 'website'
            });
        } else {
            // Afișare rezultat de bază
            const fakeScore = result.fakeScore || 0;
            displayBasicResult(fakeScore, mediaFile.name);
            
            if (fakeScore > 0) {
                saveToLocalHistory({
                    id: Date.now(),
                    fileName: mediaFile.name,
                    fakeScore: fakeScore,
                    confidenceScore: result.confidenceScore || 0,
                    timestamp: new Date().toISOString(),
                    userId: userId || 'anonymous',
                    source: 'website'
                });
            }
        }
    } catch (error) {
        console.error("Eroare la încărcarea fișierului:", error);
        showAlert("A apărut o eroare la procesarea fișierului: " + error.message, "error");
        if (resultDiv) {
            resultDiv.innerHTML = `<div class="error-container"><i class="fas fa-exclamation-triangle"></i><h3>Eroare de procesare</h3><p>${error.message}</p><button onclick="location.reload()" class="retry-btn">Încearcă din nou</button></div>`;
        }
    } finally {
        // Restore button state
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fas fa-search"></i> Analizează fișierul';
        }
    }
});

async function uploadFile(mediaFile, userId) {
    const formData = new FormData();
    formData.append('file', mediaFile);
    
    if (userId && userId.trim() !== '') {
        formData.append('userId', userId.trim());
    }

    console.log('Sending file:', mediaFile.name, 'Size:', mediaFile.size, 'Type:', mediaFile.type);

    const apiUrl = 'http://localhost:5000/api/analysis/upload';
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
        headers: {
            // Nu adăugăm Content-Type pentru FormData - browser-ul îl setează automat
        }
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload error:', errorText);
        
        // Încearcă să parseze JSON-ul de eroare
        try {
            const errorData = JSON.parse(errorText);
            throw new Error(errorData.message || errorData.error || `Server error: ${response.status}`);
        } catch (parseError) {
            throw new Error(`Server error (${response.status}): ${errorText}`);
        }
    }

    const result = await response.json();
    console.log('Parsed result:', result);
    return result;
}

function displayResult(detectionResult, fullResult = null) {
    const resultDiv = document.getElementById("result");
    const fakeScore = detectionResult.fakeScore || 0;
    const confidenceScore = detectionResult.confidenceScore || 0;
    
    let riskClass = 'low-risk';
    let riskIcon = 'check-circle';
    let riskText = 'Risc scăzut';
    let verdict = 'Conținut probabil autentic';
    
    if (fakeScore > 70) {
        riskClass = 'high-risk';
        riskIcon = 'exclamation-triangle';
        riskText = 'Risc ridicat';
        verdict = 'Posibil deepfake detectat';
    } else if (fakeScore > 40) {
        riskClass = 'medium-risk';
        riskIcon = 'exclamation-circle';
        riskText = 'Risc mediu';
        verdict = 'Conținut suspect';
    }
    
    let resultHTML = `
        <div class="result-header ${riskClass}">
            <i class="fas fa-${riskIcon}"></i>
            <h3>${verdict}</h3>
            <div class="score-display">
                <div class="score-circle">
                    <span class="score-number">${Math.round(fakeScore)}%</span>
                    <span class="score-label">Scor Deepfake</span>
                </div>
            </div>
        </div>
        
        <div class="result-details">
            <div class="detail-row">
                <span class="detail-label">Încredere:</span>
                <span class="detail-value">${Math.round(confidenceScore)}%</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Risc:</span>
                <span class="detail-value ${riskClass}">${riskText}</span>
            </div>
        </div>
        
        <div class="progress-bar">
            <div class="progress-fill ${riskClass}" style="width: ${fakeScore}%"></div>
        </div>
    `;
    
    // Adaugă explicația detaliată dacă există
    if (detectionResult.analysisDetails && detectionResult.analysisDetails.explanation) {
        const explanation = detectionResult.analysisDetails.explanation;
        resultHTML += `
            <div class="explanation-section">
                <h4><i class="fas fa-info-circle"></i> Explicația rezultatului</h4>
                <div class="explanation-content">
                    <p><strong>${explanation.verdict}</strong></p>
                    <ul class="explanation-reasons">
                        ${explanation.reasons.map(reason => `<li>${reason}</li>`).join('')}
                    </ul>
                    <div class="recommendation">
                        <i class="fas fa-lightbulb"></i>
                        <span>${explanation.recommendation}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Adaugă linkuri pentru funcții premium
    if (detectionResult.heatmapUrl) {
        resultHTML += `
            <div class="premium-features">
                <h4><i class="fas fa-fire"></i> Heatmap de analiză</h4>
                <a href="${detectionResult.heatmapUrl}" target="_blank" class="feature-link heatmap-link">
                    <i class="fas fa-external-link-alt"></i> Vezi heatmap-ul
                </a>
            </div>
        `;
    }
    
    if (fullResult && fullResult.pdfReport && fullResult.pdfReport.available) {
        resultHTML += `
            <div class="premium-features">
                <h4><i class="fas fa-file-pdf"></i> Raport detaliat</h4>
                <a href="${fullResult.pdfReport.downloadUrl}" class="feature-link pdf-link">
                    <i class="fas fa-download"></i> Descarcă raportul PDF
                </a>
            </div>
        `;
    }
    
    resultDiv.innerHTML = resultHTML;
    resultDiv.style.display = 'block';
    
    // Scroll la rezultat
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function displayBasicResult(fakeScore, fileName) {
    const resultDiv = document.getElementById("result");
    const verdict = fakeScore > 70 ? 'Posibil deepfake' : fakeScore > 40 ? 'Conținut suspect' : 'Probabil autentic';
    const riskClass = fakeScore > 70 ? 'high-risk' : fakeScore > 40 ? 'medium-risk' : 'low-risk';
    
    resultDiv.innerHTML = `
        <div class="result-header ${riskClass}">
            <h3>${verdict}</h3>
            <div class="score-display">
                <div class="score-circle">
                    <span class="score-number">${Math.round(fakeScore)}%</span>
                    <span class="score-label">Scor Deepfake</span>
                </div>
            </div>
        </div>
        <p>Analiză completă pentru: ${fileName}</p>
    `;
    resultDiv.style.display = 'block';
}

function getVerdict(fakeScore) {
    if (fakeScore > 70) return 'Risc ridicat';
    if (fakeScore > 40) return 'Risc mediu';
    return 'Risc scăzut';
}

function saveToLocalHistory(scanData) {
    try {
        let history = JSON.parse(localStorage.getItem('scanHistory') || '[]');
        
        // Adaugă scanarea nouă la început
        history.unshift({
            id: Date.now(),
            ...scanData,
            source: 'website'
        });
        
        // Păstrează doar ultimele 50 de scanări
        if (history.length > 50) {
            history = history.slice(0, 50);
        }
        
        localStorage.setItem('scanHistory', JSON.stringify(history));
        
        console.log('Saved to local history:', scanData);
        
        // Actualizează UI-ul dacă există o secțiune de istoric
        updateHistoryUI();
        
    } catch (error) {
        console.error('Error saving to local history:', error);
    }
}

async function saveToServerHistory(historyItem) {
    try {
        const response = await fetch('http://localhost:5000/api/history', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(historyItem)
        });
        
        if (!response.ok) {
            throw new Error('Failed to save to server');
        }
        
        console.log('Saved to server history');
    } catch (error) {
        console.error('Error saving to server history:', error);
        throw error;
    }
}

function updateHistoryUI() {
    const historyContainer = document.getElementById('history-container') || 
                           document.querySelector('.history-list');
    
    if (historyContainer) {
        try {
            const history = JSON.parse(localStorage.getItem('scanHistory') || '[]');
            
            if (history.length === 0) {
                historyContainer.innerHTML = '<p class="no-history">Nu există scanări anterioare</p>';
                return;
            }
            
            const historyHTML = history.slice(0, 10).map(item => {
                const date = new Date(item.timestamp).toLocaleString('ro-RO');
                const riskClass = item.fakeScore > 70 ? 'high-risk' : 
                                item.fakeScore > 40 ? 'medium-risk' : 'low-risk';
                
                return `
                    <div class="history-item ${riskClass}">
                        <div class="history-info">
                            <strong>${item.fileName}</strong>
                            <span class="history-date">${date}</span>
                        </div>
                        <div class="history-score">
                            ${Math.round(item.fakeScore)}%
                        </div>
                    </div>
                `;
            }).join('');
            
            historyContainer.innerHTML = historyHTML;
            
        } catch (error) {
            console.error('Error updating history UI:', error);
        }
    }
}

function showAlert(message, type = 'info') {
    // Implementare simplă de alert
    if (type === 'error') {
        console.error(message);
        alert('Eroare: ' + message);
    } else {
        console.log(message);
        alert(message);
    }
}

// Inițializează istoricul la încărcarea paginii
document.addEventListener('DOMContentLoaded', function() {
    updateHistoryUI();
});

// Adaugă CSS pentru loading și istoric
const style = document.createElement('style');
style.textContent = `
    .loading-container {
        text-align: center;
        padding: 30px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 12px;
        margin: 20px 0;
    }
    
    .loading-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 15px;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    
    .loading-tip {
        font-size: 14px;
        opacity: 0.9;
        margin-top: 10px;
    }
    
    .result-header {
        text-align: center;
        padding: 25px;
        border-radius: 12px;
        margin-bottom: 20px;
    }
    
    .result-header.high-risk {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: white;
    }
    
    .result-header.medium-risk {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: white;
    }
    
    .result-header.low-risk {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
    }
    
    .score-circle {
        display: inline-block;
        background: rgba(255,255,255,0.2);
        border-radius: 50%;
        padding: 20px;
        margin-top: 15px;
    }
    
    .score-number {
        display: block;
        font-size: 24px;
        font-weight: bold;
    }
    
    .score-label {
        font-size: 12px;
        opacity: 0.9;
    }
    
    .result-details {
        background: white;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    
    .detail-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
    }
    
    .detail-label {
        font-weight: 500;
        color: #6b7280;
    }
    
    .detail-value {
        font-weight: bold;
    }
    
    .detail-value.high-risk { color: #ef4444; }
    .detail-value.medium-risk { color: #f59e0b; }
    .detail-value.low-risk { color: #10b981; }
    
    .progress-bar {
        background: #e5e7eb;
        height: 8px;
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 20px;
    }
    
    .progress-fill {
        height: 100%;
        transition: width 0.3s ease;
    }
    
    .progress-fill.high-risk { background: #ef4444; }
    .progress-fill.medium-risk { background: #f59e0b; }
    .progress-fill.low-risk { background: #10b981; }
    
    .explanation-section {
        background: #f8fafc;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
    }
    
    .explanation-content {
        margin-top: 15px;
    }
    
    .explanation-reasons {
        margin: 15px 0;
        padding-left: 20px;
    }
    
    .explanation-reasons li {
        margin-bottom: 5px;
        color: #4b5563;
    }
    
    .recommendation {
        background: #e0f2fe;
        padding: 15px;
        border-radius: 6px;
        border-left: 4px solid #0ea5e9;
        margin-top: 15px;
        display: flex;
        align-items: flex-start;
        gap: 10px;
    }
    
    .premium-features {
        background: white;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 15px;
        border: 1px solid #e5e7eb;
    }
    
    .feature-link {
        display: inline-block;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 10px 20px;
        border-radius: 6px;
        text-decoration: none;
        transition: all 0.2s;
        margin-top: 10px;
    }
    
    .feature-link:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    }
    
    .history-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px;
        margin: 8px 0;
        border-radius: 8px;
        border-left: 4px solid;
        background: white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    
    .history-item.high-risk {
        border-color: #ef4444;
        background: #fef2f2;
    }
    
    .history-item.medium-risk {
        border-color: #f59e0b;
        background: #fffbeb;
    }
    
    .history-item.low-risk {
        border-color: #10b981;
        background: #f0fdf4;
    }
    
    .history-info strong {
        display: block;
        color: #1f2937;
    }
    
    .history-date {
        font-size: 12px;
        color: #6b7280;
    }
    
    .history-score {
        font-weight: bold;
        font-size: 18px;
    }
    
    .high-risk .history-score { color: #ef4444; }
    .medium-risk .history-score { color: #f59e0b; }
    .low-risk .history-score { color: #10b981; }
    
    .no-history {
        text-align: center;
        color: #6b7280;
        padding: 20px;
        font-style: italic;
    }
    
    .error-container {
        text-align: center;
        padding: 30px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 8px;
        color: #991b1b;
    }
    
    .retry-btn {
        background: #ef4444;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        margin-top: 15px;
    }
    
    .spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-right: 8px;
    }
`;
document.head.appendChild(style);
