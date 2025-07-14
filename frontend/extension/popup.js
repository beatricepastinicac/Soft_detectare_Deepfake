// BeeDetection Pro - Enhanced Popup Script

// Funcții pentru statistici
async function updateExtensionStats(scansCount = 0, threatsFound = 0, safeImages = 0) {
  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Add auth header if logged in
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE}/api/extension/update-stats`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        scansCount,
        threatsFound,
        safeImages,
        sessionData: {
          timestamp: new Date().toISOString(),
          platform: window.location.hostname
        }
      })
    });
    
    if (response.ok) {
      console.log('Statistici actualizate cu succes');
    }
  } catch (error) {
    console.error('Eroare la actualizarea statisticilor:', error);
  }
}

async function loadExtensionStats() {
  try {
    const headers = {};
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE}/api/extension/get-stats`, {
      headers
    });
    
    if (response.ok) {
      const stats = await response.json();
      updateStatsDisplay(stats);
    }
  } catch (error) {
    console.error('Eroare la încărcarea statisticilor:', error);
    // Fallback to local stats
    loadLocalStats();
  }
}

function updateStatsDisplay(stats) {
  const scanCountDiv = document.getElementById('scanCount');
  const threatsFoundDiv = document.getElementById('threatsFound');
  
  if (scanCountDiv) {
    scanCountDiv.textContent = stats.totalScans || 0;
  }
  if (threatsFoundDiv) {
    threatsFoundDiv.textContent = stats.threatsDetected || 0;
  }
}

function loadLocalStats() {
  const localStats = {
    totalScans: parseInt(localStorage.getItem('extensionScans') || '0'),
    threatsDetected: parseInt(localStorage.getItem('extensionThreats') || '0'),
    safeImages: parseInt(localStorage.getItem('extensionSafeImages') || '0'),
    accuracyRate: 98
  };
  updateStatsDisplay(localStats);
}

function incrementLocalStats(type) {
  const current = parseInt(localStorage.getItem(`extension${type}`) || '0');
  localStorage.setItem(`extension${type}`, (current + 1).toString());
  
  // Update display immediately
  if (type === 'Scans') {
    const scanCountDiv = document.getElementById('scanCount');
    if (scanCountDiv) scanCountDiv.textContent = current + 1;
  } else if (type === 'Threats') {
    const threatsFoundDiv = document.getElementById('threatsFound');
    if (threatsFoundDiv) threatsFoundDiv.textContent = current + 1;
  }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔍 BeeDetection Pro popup loaded');
    
    // DOM Elements
    const scanBtn = document.getElementById('scanPage');
    const resultDiv = document.getElementById('result');
    const scanCountDiv = document.getElementById('scanCount');
    const threatsFoundDiv = document.getElementById('threatsFound');
    const lastScanDiv = document.getElementById('lastScan');
    const authSection = document.getElementById('auth-section');
    const deepScanCheckbox = document.getElementById('deepScan');
    const autoScanCheckbox = document.getElementById('autoScan');
    const viewReportsBtn = document.getElementById('viewReports');
    const openSettingsBtn = document.getElementById('openSettings');
    
    // Configuration
    const API_BASE = 'http://localhost:5000';
    let userToken = null;
    let isPremium = false;
    
    // Initialize popup
    init();
    
    // Listen for messages from login page
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'EXTENSION_LOGIN_SUCCESS') {
            handleLoginSuccess(message);
        }
    });
    
    async function init() {
        await loadUserAuth();
        await loadStats();
        setupEventListeners();
        setupMessageListener();
        showWelcomeMessage();
    }
    
    function setupEventListeners() {
        scanBtn?.addEventListener('click', handleScanPage);
        viewReportsBtn?.addEventListener('click', openReports);
        openSettingsBtn?.addEventListener('click', openSettings);
        deepScanCheckbox?.addEventListener('change', savePreferences);
        autoScanCheckbox?.addEventListener('change', savePreferences);
    }
    
    async function loadUserAuth() {
        try {
            const stored = await chrome.storage.sync.get(['userToken', 'userEmail', 'isPremium']);
            userToken = stored.userToken;
            isPremium = stored.isPremium || false;
            
            if (userToken && stored.userEmail) {
                showUserInfo(stored.userEmail, isPremium);
            } else {
                showLoginPrompt();
            }
        } catch (error) {
            console.error('Error loading auth:', error);
            showLoginPrompt();
        }
    }
    
    function showUserInfo(email, premium) {
        if (!authSection) return;
        
        const premiumBadge = premium ? '<span class="premium-badge">PREMIUM</span>' : '';
        authSection.innerHTML = `
            <div class="user-info">
                <div class="user-avatar">${email.charAt(0).toUpperCase()}</div>
                <div class="user-details">
                    <div class="user-email">${email} ${premiumBadge}</div>
                    <div class="user-status">${premium ? '🔥 Premium Member' : '⭐ Free Plan'}</div>
                </div>
                <button class="logout-btn" id="logoutBtn">Sign Out</button>
            </div>
        `;
        
        document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    }
    
    function showLoginPrompt() {
        if (!authSection) return;
        
        authSection.innerHTML = `
            <div class="login-prompt">
                <h3>🔐 Sign In for Premium Features</h3>
                <p>Access Grad-CAM analysis, detailed reports, and advanced detection</p>
                <button class="scan-btn primary" id="loginBtn">
                    <span class="btn-icon">🚀</span>
                    Sign In to BeeDetection
                </button>
                <div class="login-features">
                    <div>✅ Real-time deepfake detection</div>
                    <div>✅ Grad-CAM heatmap analysis</div>
                    <div>✅ Detailed PDF reports</div>
                    <div>✅ Advanced AI models</div>
                </div>
            </div>
        `;
        
        document.getElementById('loginBtn')?.addEventListener('click', openLoginPage);
    }
    
    async function handleScanPage() {
        if (!scanBtn) return;
        
        scanBtn.textContent = '🔄 Scanning...';
        scanBtn.disabled = true;
        
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            
            // Ensure content script is injected
            await ensureContentScriptInjected(tab.id);
            
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'scanPage',
                useGradCAM: deepScanCheckbox?.checked && isPremium,
                apiBase: API_BASE,
                token: userToken
            });
            
            if (response?.success) {
                showScanResults(response.results);
                
                // Count threats detected
                const threatsCount = response.results?.filter(result => 
                    result.confidence > 70 && result.prediction === 'FAKE'
                ).length || 0;
                
                await updateStats(threatsCount);
            } else {
                showError(response?.message || 'Nu s-au găsit imagini de scanat');
            }
        } catch (error) {
            console.error('Scan error:', error);
            showError('Eșec la scanarea paginii: ' + error.message);
        } finally {
            scanBtn.innerHTML = '<span class="btn-icon">🚀</span>Scan Current Page';
            scanBtn.disabled = false;
        }
    }
    
    async function ensureContentScriptInjected(tabId) {
        try {
            // Test if content script is already injected
            await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        } catch (error) {
            // Content script not injected, inject it
            console.log('Injecting content script...');
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['js/content.js']
            });
            
            // Small delay to ensure script is loaded
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    function showScanResults(results) {
        if (!resultDiv || !results || results.length === 0) {
            showError('Nu s-au găsit imagini pe această pagină');
            return;
        }
        
        const threats = results.filter(r => r.fakeScore > 70);
        const warnings = results.filter(r => r.fakeScore > 40 && r.fakeScore <= 70);
        const safe = results.filter(r => r.fakeScore <= 40);
        
        let statusClass = 'safe';
        let statusIcon = '✅';
        let statusText = 'Totul este în regulă';
        
        if (threats.length > 0) {
            statusClass = 'danger';
            statusIcon = '🚨';
            statusText = `${threats.length} Amenințare${threats.length > 1 ? 's' : ''} Detectată`;
        } else if (warnings.length > 0) {
            statusClass = 'warning';
            statusIcon = '⚠️';
            statusText = `${warnings.length} Imagine${warnings.length > 1 ? 's' : ''} Suspectă`;
        }
        
        resultDiv.className = `result-section card show ${statusClass}`;
        resultDiv.innerHTML = `
            <div class="scan-result-header">
                <h3>${statusIcon} ${statusText}</h3>
                <div class="scan-summary">
                    Scanate ${results.length} imagine${results.length > 1 ? 's' : ''} • 
                    ${threats.length} amenințări • ${warnings.length} avertizări • ${safe.length} sigure
                </div>
            </div>
            
            ${threats.length > 0 ? `
                <div class="threat-list">
                    <h4>🚨 Imagini cu Risc Ridicat:</h4>
                    ${threats.map(r => `
                        <div class="threat-item">
                            <img src="${r.imageUrl}" class="threat-thumb" onerror="this.style.display='none'">
                            <div class="threat-details">
                                <div class="threat-score">${r.fakeScore.toFixed(1)}% Fake</div>
                                <div class="threat-type">${r.gradCAM ? 'Analiză Grad-CAM' : 'Detectare de Bază'}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            <div class="scan-actions">
                <button class="action-btn" onclick="generateDetailedReport()">
                    📋 Generați Raport
                </button>
                ${isPremium ? `
                    <button class="action-btn" onclick="viewHeatmaps()">
                        🔥 Vizualizați Hărțile Termice
                    </button>
                ` : ''}
            </div>
        `;
        
        // Update threats counter
        if (threatsFoundDiv) {
            const currentThreats = parseInt(threatsFoundDiv.textContent) || 0;
            threatsFoundDiv.textContent = currentThreats + threats.length;
        }
    }
    
    function showError(message) {
        if (!resultDiv) return;
        
        resultDiv.className = 'result-section card show error';
        resultDiv.innerHTML = `
            <div class="error-content">
                <div class="error-icon">❌</div>
                <div class="error-message">${message}</div>
                <div class="error-help">
                    Încercați să reîncărcați pagina sau verificați dacă imaginile sunt încărcate
                </div>
            </div>
        `;
    }
    
    async function loadStats() {
        try {
            // First load local Chrome storage stats
            const stored = await chrome.storage.sync.get([
                'scanCount', 'lastScan', 'threatsFound', 'preferences'
            ]);
            
            // Display local stats first
            if (scanCountDiv) scanCountDiv.textContent = stored.scanCount || 0;
            if (threatsFoundDiv) threatsFoundDiv.textContent = stored.threatsFound || 0;
            if (lastScanDiv) {
                const lastScan = stored.lastScan;
                lastScanDiv.textContent = lastScan ? 
                    `Ultima scanare: ${new Date(lastScan).toLocaleTimeString()}` : 
                    'Ultima scanare: Niciodată';
            }
            
            // Load preferences
            const prefs = stored.preferences || {};
            if (deepScanCheckbox) deepScanCheckbox.checked = prefs.useGradCAM !== false;
            if (autoScanCheckbox) autoScanCheckbox.checked = prefs.autoScan === true;
            
            // Try to load updated stats from server if authenticated
            await loadExtensionStats();
            
        } catch (error) {
            console.error('Error loading stats:', error);
            // Fallback to local only
            loadLocalStats();
        }
    }
    
    async function updateStats(threatsDetected = 0) {
        try {
            const stored = await chrome.storage.sync.get(['scanCount', 'threatsFound']);
            const newScanCount = (stored.scanCount || 0) + 1;
            const newThreatsCount = (stored.threatsFound || 0) + threatsDetected;
            
            // Update local Chrome storage
            await chrome.storage.sync.set({
                scanCount: newScanCount,
                threatsFound: newThreatsCount,
                lastScan: Date.now()
            });
            
            // Update display
            if (scanCountDiv) scanCountDiv.textContent = newScanCount;
            if (threatsFoundDiv) threatsFoundDiv.textContent = newThreatsCount;
            if (lastScanDiv) lastScanDiv.textContent = `Ultima scanare: ${new Date().toLocaleTimeString()}`;
            
            // Update local stats for API
            incrementLocalStats('Scans');
            if (threatsDetected > 0) {
                incrementLocalStats('Threats');
            }
            
            // Send stats to server
            await updateExtensionStats(1, threatsDetected, threatsDetected > 0 ? 0 : 1);
            
        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }
    
    async function savePreferences() {
        try {
            const prefs = {
                useGradCAM: deepScanCheckbox?.checked || false,
                autoScan: autoScanCheckbox?.checked || false
            };
            
            await chrome.storage.sync.set({ preferences: prefs });
        } catch (error) {
            console.error('Error saving preferences:', error);
        }
    }
    
    function openLoginPage() {
        chrome.tabs.create({ url: `${API_BASE}/extension-login.html` });
    }
    
    async function handleLogout() {
        try {
            await chrome.storage.sync.remove(['userToken', 'userEmail', 'isPremium']);
            userToken = null;
            isPremium = false;
            showLoginPrompt();
        } catch (error) {
            console.error('Error logging out:', error);
        }
    }
    
    function openReports() {
        chrome.tabs.create({ url: `${API_BASE}/dashboard` });
    }
    
    function openSettings() {
        chrome.runtime.openOptionsPage();
    }
    
    function showWelcomeMessage() {
        // Show a subtle welcome animation
        const app = document.getElementById('app');
        if (app) {
            app.style.opacity = '0';
            app.style.transform = 'translateY(10px)';
            
            setTimeout(() => {
                app.style.transition = 'all 0.3s ease';
                app.style.opacity = '1';
                app.style.transform = 'translateY(0)';
            }, 100);
        }
    }
    
    function setupMessageListener() {
        // Listen for messages from content scripts and web pages
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {type: 'EXTENSION_AUTH_REQUEST'}, function(response) {
                    // Handle auth response if needed
                });
            }
        });
    }
    
    async function handleLoginSuccess(authData) {
        try {
            // Store authentication data
            await chrome.storage.sync.set({
                userToken: authData.token,
                userEmail: authData.email,
                isPremium: authData.isPremium || false,
                userData: authData.user
            });
            
            // Update global variables
            userToken = authData.token;
            isPremium = authData.isPremium || false;
            
            // Update UI
            showUserInfo(authData.email, isPremium);
            await loadStats();
            
            console.log('🎉 Extension login successful!');
        } catch (error) {
            console.error('Error handling login success:', error);
        }
    }
    
    // Global functions for inline handlers
    window.generateDetailedReport = function() {
        chrome.tabs.create({ url: `${API_BASE}/userDashboard.html#reports` });
    };
    
    window.viewHeatmaps = function() {
        chrome.tabs.create({ url: `${API_BASE}/userDashboard.html#heatmaps` });
    };
});
