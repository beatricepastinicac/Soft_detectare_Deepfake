document.addEventListener("DOMContentLoaded", function() {
    const uploadForm = document.getElementById("uploadForm");
    const mediaFileInput = document.getElementById("mediaFile");
    const userIdInput = document.getElementById("userId");
    const fileNameDisplay = document.getElementById("file-name");
    const loadingIndicator = document.getElementById("loading");
    const resultContainer = document.getElementById("result-container");
    const resultText = document.getElementById("result-text");
    const scoreIndicator = document.getElementById("score-indicator");
    const settingsToggle = document.getElementById("toggle-settings");
    const settingsPanel = document.getElementById("settings-panel");
    const saveSettingsBtn = document.getElementById("save-settings");
    const apiUrlInput = document.getElementById("api-url");
    const autoScanCheckbox = document.getElementById("auto-scan");
    const historyList = document.getElementById("history-list");
    
    loadSettings();
    loadScanHistory();
    
    mediaFileInput.addEventListener("change", function() {
        if (this.files.length > 0) {
            fileNameDisplay.textContent = this.files[0].name;
        } else {
            fileNameDisplay.textContent = "Niciun fișier selectat";
        }
    });
    
    uploadForm.addEventListener("submit", async function(e) {
        e.preventDefault();
        
        const mediaFile = mediaFileInput.files[0];
        const userId = userIdInput.value.trim();
        
        if (!mediaFile) {
            showNotification("Vă rugăm să selectați un fișier pentru analiză.");
            return;
        }
        
        uploadForm.classList.add("hidden");
        loadingIndicator.classList.remove("hidden");
        resultContainer.classList.add("hidden");
        
        try {
            const apiUrl = await getSetting("apiUrl");
            const result = await uploadFile(mediaFile, userId, apiUrl);
            
            addToHistory({
                fileName: mediaFile.name,
                timestamp: new Date().toISOString(),
                fakeScore: result.detectionResult.fakeScore
            });
            
            displayResult(result);
        } catch (error) {
            console.error("Eroare la procesarea fișierului:", error);
            resultText.innerHTML = `<p class="error">A apărut o eroare: ${error.message}</p>`;
            resultContainer.classList.remove("hidden");
        } finally {
            loadingIndicator.classList.add("hidden");
            uploadForm.classList.remove("hidden");
        }
    });
    
    settingsToggle.addEventListener("click", function() {
        settingsPanel.classList.toggle("hidden");
    });
    
    saveSettingsBtn.addEventListener("click", function() {
        const apiUrl = apiUrlInput.value.trim();
        const enableAutoScan = autoScanCheckbox.checked;
        
        chrome.storage.local.set({
            apiUrl: apiUrl,
            enableAutoScan: enableAutoScan
        }, function() {
            showNotification("Setările au fost salvate!");
            settingsPanel.classList.add("hidden");
        });
    });
    
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        if (message.action === "scanResult") {
            displayResult(message.result);
        }
    });
    
    async function uploadFile(mediaFile, userId, apiUrl) {
        const formData = new FormData();
        formData.append('video', mediaFile);
        
        if (userId) {
            formData.append('userId', userId);
        }
        
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Eroare server (${response.status}): ${errorText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error("Network error:", error);
            throw new Error("Nu s-a putut comunica cu serverul. Verificați conexiunea și URL-ul API.");
        }
    }
    
    function displayResult(result) {
        if (!result || !result.detectionResult) {
            resultText.textContent = "Rezultat nevalid de la server.";
            return;
        }
        
        const { fakeScore, confidenceScore } = result.detectionResult;
        
        scoreIndicator.style.width = `${fakeScore}%`;
        
        if (fakeScore > 70) {
            scoreIndicator.style.backgroundColor = "#dc3545";
        } else if (fakeScore > 40) {
            scoreIndicator.style.backgroundColor = "#fd7e14";
        } else {
            scoreIndicator.style.backgroundColor = "#28a745";
        }
        
        let resultMessage = "";
        if (fakeScore > 70) {
            resultMessage = `<p class="high-risk"><strong>Risc ridicat de deepfake (${fakeScore}%)</strong></p>`;
        } else if (fakeScore > 40) {
            resultMessage = `<p class="medium-risk"><strong>Posibil deepfake (${fakeScore}%)</strong></p>`;
        } else {
            resultMessage = `<p class="low-risk"><strong>Probabil conținut autentic (${fakeScore}%)</strong></p>`;
        }
        
        resultMessage += `<p>Nivel de încredere: ${confidenceScore}%</p>`;
        
        resultText.innerHTML = resultMessage;
        resultContainer.classList.remove("hidden");
    }
    
    function showNotification(message) {
        const notification = document.createElement("div");
        notification.className = "notification";
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    async function loadSettings() {
        chrome.storage.local.get(["apiUrl", "enableAutoScan"], function(data) {
            if (data.apiUrl) {
                apiUrlInput.value = data.apiUrl;
            }
            
            if (data.enableAutoScan !== undefined) {
                autoScanCheckbox.checked = data.enableAutoScan;
            }
        });
    }
    
    async function getSetting(key) {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], function(data) {
                resolve(data[key] || getDefaultSetting(key));
            });
        });
    }
    
    function getDefaultSetting(key) {
        const defaults = {
            apiUrl: "http://localhost:5000/api/analysis/upload",
            enableAutoScan: false
        };
        return defaults[key];
    }
    
    async function loadScanHistory() {
        chrome.storage.local.get(["scanHistory"], function(data) {
            const history = data.scanHistory || [];
            
            if (history.length === 0) {
                historyList.innerHTML = "<p>Nu există scanări recente</p>";
                return;
            }
            
            historyList.innerHTML = history
                .slice(0, 5)
                .map(item => {
                    const date = new Date(item.timestamp).toLocaleString();
                    let riskClass = "low-risk";
                    
                    if (item.fakeScore > 70) {
                        riskClass = "high-risk";
                    } else if (item.fakeScore > 40) {
                        riskClass = "medium-risk";
                    }
                    
                    return `
                        <div class="history-item">
                            <span>${item.fileName.substring(0, 15)}${item.fileName.length > 15 ? '...' : ''}</span>
                            <span class="${riskClass}">${item.fakeScore}%</span>
                        </div>
                    `;
                })
                .join("");
        });
    }
    
    function addToHistory(scanItem) {
        chrome.storage.local.get(["scanHistory"], function(data) {
            const history = data.scanHistory || [];
            
            history.unshift(scanItem);
            
            if (history.length > 20) {
                history.pop();
            }
            
            chrome.storage.local.set({ scanHistory: history }, function() {
                loadScanHistory();
            });
        });
    }
});
