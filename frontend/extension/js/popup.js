// popup.js - Fixed version
document.addEventListener('DOMContentLoaded', function () {
    console.log('Popup loaded');

    // Get DOM elements with error checking
    const scanBtn = document.getElementById('scanPage');
    const resultDiv = document.getElementById('result');
    const scanCountDiv = document.getElementById('scanCount');
    const lastScanDiv = document.getElementById('lastScan');

    // Check if all elements exist
    if (!scanBtn) {
        console.error('Scan button not found');
        return;
    }

    if (!resultDiv) {
        console.error('Result div not found');
        return;
    }

    if (!scanCountDiv) {
        console.error('Scan count div not found');
        return;
    }

    if (!lastScanDiv) {
        console.error('Last scan div not found');
        return;
    }

    // Initialize stats
    loadStats();
    checkAuthStatus();

    // Add click event listener
    scanBtn.addEventListener('click', function () {
        console.log('Scan button clicked');
        scanCurrentPage();
    });

    function loadStats() {
        chrome.storage.sync.get(['scanCount', 'lastScan'], function (result) {
            if (chrome.runtime.lastError) {
                console.error('Error loading stats:', chrome.runtime.lastError);
                return;
            }

            const scanCount = result.scanCount || 0;
            const lastScan = result.lastScan || '-';

            if (scanCountDiv) {
                scanCountDiv.textContent = `Scanări efectuate: ${scanCount}`;
            }

            if (lastScanDiv) {
                lastScanDiv.textContent = `Ultima scanare: ${lastScan}`;
            }
        });
    }

    function checkAuthStatus() {
        chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, function (response) {
            if (chrome.runtime.lastError) {
                console.error('Error checking auth:', chrome.runtime.lastError);
                return;
            }

            const authSection = document.getElementById('auth-section');
            if (authSection) {
                if (response && response.isAuthenticated) {
                    showAuthenticatedState(response.user);
                } else {
                    showGuestState();
                }
            }
        });
    }

    function showAuthenticatedState(user) {
        const authSection = document.getElementById('auth-section');
        if (authSection) {
            authSection.innerHTML = `
                <div class="user-card">
                    <i>👤</i>
                    <div class="user-details">
                        <span>${user ? user.name || user.email : 'User'}</span>
                        <span>✅ Premium</span>
                    </div>
                    <button class="logout-btn" id="logout-btn">Ieșire</button>
                </div>
            `;

            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', handleLogout);
            }
        }
    }

    function showGuestState() {
        const authSection = document.getElementById('auth-section');
        if (authSection) {
            authSection.innerHTML = `
                <div class="guest-card">
                    <p>Conectează-te pentru funcții premium</p>
                    <button class="secondary-button" id="login-btn">Conectare</button>
                </div>
            `;

            const loginBtn = document.getElementById('login-btn');
            if (loginBtn) {
                loginBtn.addEventListener('click', showLoginForm);
            }
        }
    }

    function showLoginForm() {
        const authSection = document.getElementById('auth-section');
        if (authSection) {
            authSection.innerHTML = `
                <form id="login-form">
                    <h3>Conectare</h3>
                    <div class="form-group">
                        <label for="email">Email:</label>
                        <input type="email" id="email" required>
                    </div>
                    <div class="form-group">
                        <label for="password">Parolă:</label>
                        <input type="password" id="password" required>
                    </div>
                    <button type="submit" id="login-submit">Conectare</button>
                    <button type="button" class="secondary-button" id="back-btn">Înapoi</button>
                    <div id="login-error" class="error-message" style="display: none;"></div>
                </form>
            `;

            const loginForm = document.getElementById('login-form');
            const backBtn = document.getElementById('back-btn');

            if (loginForm) {
                loginForm.addEventListener('submit', handleLogin);
            }

            if (backBtn) {
                backBtn.addEventListener('click', showGuestState);
            }
        }
    }

    function handleLogin(e) {
        e.preventDefault();

        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const submitBtn = document.getElementById('login-submit');
        const errorDiv = document.getElementById('login-error');

        if (!emailInput || !passwordInput || !submitBtn) {
            console.error('Login form elements not found');
            return;
        }

        const email = emailInput.value;
        const password = passwordInput.value;

        if (!email || !password) {
            showError('Te rog completează toate câmpurile');
            return;
        }

        // Show loading state
        submitBtn.innerHTML = '<span class="btn-spinner">⟳</span> Conectare...';
        submitBtn.disabled = true;

        chrome.runtime.sendMessage({
            type: 'LOGIN',
            credentials: { email, password }
        }, function (response) {
            if (chrome.runtime.lastError) {
                console.error('Login error:', chrome.runtime.lastError);
                showError('Eroare de conexiune');
                resetLoginButton();
                return;
            }

            if (response && response.success) {
                showAuthenticatedState(response.user);
                showNotification('Conectare reușită!', 'success');
            } else {
                showError(response.error || 'Conectare eșuată');
                resetLoginButton();
            }
        });

        function showError(message) {
            if (errorDiv) {
                errorDiv.textContent = message;
                errorDiv.style.display = 'block';
            }
        }

        function resetLoginButton() {
            if (submitBtn) {
                submitBtn.innerHTML = 'Conectare';
                submitBtn.disabled = false;
            }
        }
    }

    function handleLogout() {
        chrome.runtime.sendMessage({ type: 'LOGOUT' }, function (response) {
            if (chrome.runtime.lastError) {
                console.error('Logout error:', chrome.runtime.lastError);
                return;
            }

            showGuestState();
            showNotification('Deconectare reușită!', 'info');
        });
    }

    function scanCurrentPage() {
        if (!scanBtn) return;

        // Update button state
        const originalText = scanBtn.textContent;
        scanBtn.textContent = 'Scanez...';
        scanBtn.disabled = true;

        // Show loading result
        if (resultDiv) {
            resultDiv.className = 'result';
            resultDiv.textContent = 'Scanare în curs...';
            resultDiv.style.display = 'block';
        }

        // Send scan message to content script
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (chrome.runtime.lastError) {
                console.error('Error querying tabs:', chrome.runtime.lastError);
                resetScanButton();
                return;
            }

            if (!tabs || tabs.length === 0) {
                showResult('Nu s-a putut accesa pagina curentă', 'warning');
                resetScanButton();
                return;
            }

            const tab = tabs[0];

            chrome.tabs.sendMessage(tab.id, { action: 'scanImagini' }, function (response) {
                if (chrome.runtime.lastError) {
                    console.error('Error sending message:', chrome.runtime.lastError);
                    showResult('Eroare la comunicarea cu pagina', 'warning');
                    resetScanButton();
                    return;
                }

                if (response && response.success) {
                    showResult(response.message || 'Scanare completă!', 'safe');
                    updateStats();
                } else {
                    showResult(response?.message || 'Nu s-au găsit imagini de scanat', 'warning');
                }

                resetScanButton();
            });
        });

        function resetScanButton() {
            if (scanBtn) {
                scanBtn.textContent = originalText;
                scanBtn.disabled = false;
            }
        }
    }

    function showResult(message, type = 'safe') {
        if (!resultDiv) return;

        resultDiv.className = `result ${type}`;
        resultDiv.textContent = message;
        resultDiv.style.display = 'block';
    }

    function updateStats() {
        chrome.storage.sync.get(['scanCount'], function (result) {
            if (chrome.runtime.lastError) {
                console.error('Error updating stats:', chrome.runtime.lastError);
                return;
            }

            const newCount = (result.scanCount || 0) + 1;
            const now = new Date().toLocaleString('ro-RO');

            chrome.storage.sync.set({
                scanCount: newCount,
                lastScan: now
            }, function () {
                if (chrome.runtime.lastError) {
                    console.error('Error saving stats:', chrome.runtime.lastError);
                    return;
                }

                loadStats();
            });
        });
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    // Add report link functionality
    const reportLinks = document.querySelectorAll('.report-link');
    reportLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            chrome.tabs.create({ url: chrome.runtime.getURL('report.html') });
        });
    });
});