// background.js - Simplified functional version
console.log('BeeDetection background script loaded');

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');

    // Set default settings
    chrome.storage.local.set({
        enableAutoScan: false,
        notificationsEnabled: true,
        scanHistory: [],
        authToken: null,
        userTier: 'free',
        userData: null,
        scanCount: 0
    });

    // Create context menu
    chrome.contextMenus.create({
        id: 'scanImage',
        title: 'Scanează pentru deepfake',
        contexts: ['image']
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'scanImage' && info.srcUrl) {
        console.log('Context menu scan requested for:', info.srcUrl);

        // Send message to content script
        chrome.tabs.sendMessage(tab.id, {
            action: 'scanImage',
            imageUrl: info.srcUrl
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error sending message:', chrome.runtime.lastError);
                return;
            }

            if (response && response.success) {
                showNotification('Scanare completă!', `Rezultat: ${response.result.fakeScore}% risc`);
            } else {
                showNotification('Eroare la scanare', response?.error || 'Eroare necunoscută');
            }
        });
    }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message);

    switch (message.type || message.action) {
        case 'EXTENSION_LOGIN_SUCCESS':
            handleExtensionLogin(message, sendResponse);
            return true; // Async response
            
        case 'GET_AUTH_STATUS':
            handleGetAuthStatus(sendResponse);
            return true; // Async response

        case 'LOGIN':
            handleLogin(message.credentials, sendResponse);
            return true; // Async response

        case 'LOGOUT':
            handleLogout(sendResponse);
            return true; // Async response

        case 'ANALYZE_IMAGE':
            handleAnalyzeImage(message, sendResponse);
            return true; // Async response

        case 'showNotification':
            showNotification(message.title, message.message);
            break;

        default:
            console.log('Unknown message type:', message.type || message.action);
    }
});

async function handleExtensionLogin(message, sendResponse) {
    console.log('🔐 Extension login received:', message);
    
    try {
        // Store auth data in both sync and local storage
        await chrome.storage.sync.set({
            userToken: message.token,
            userEmail: message.email,
            isPremium: message.isPremium || false,
            userData: message.user
        });
        
        await chrome.storage.local.set({
            authToken: message.token,
            userTier: message.isPremium ? 'premium' : 'free',
            userData: message.user
        });
        
        // Show success notification
        showNotification(
            'BeeDetection Pro',
            `Conectare reușită! Bun venit, ${message.user?.first_name || message.email}!`
        );
        
        console.log('✅ Extension auth data stored successfully');
        sendResponse({ success: true });
        
    } catch (error) {
        console.error('❌ Error storing extension auth:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleGetAuthStatus(sendResponse) {
    try {
        const result = await chrome.storage.local.get(['authToken', 'userTier', 'userData']);

        const response = {
            isAuthenticated: !!result.authToken,
            token: result.authToken,
            tier: result.userTier || 'free',
            user: result.userData
        };

        console.log('Auth status:', response);
        sendResponse(response);
    } catch (error) {
        console.error('Error getting auth status:', error);
        sendResponse({
            isAuthenticated: false,
            tier: 'free'
        });
    }
}

async function handleLogin(credentials, sendResponse) {
    console.log('Login attempt for:', credentials.email);

    try {
        // Simulate API call (replace with real API)
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Mock successful login
        if (credentials.email && credentials.password) {
            const userData = {
                name: credentials.email.split('@')[0],
                email: credentials.email,
                tier: 'premium'
            };

            const authToken = 'mock_token_' + Date.now();

            await chrome.storage.local.set({
                authToken: authToken,
                userTier: 'premium',
                userData: userData
            });

            console.log('Login successful');
            sendResponse({
                success: true,
                user: userData
            });
        } else {
            throw new Error('Email și parola sunt necesare');
        }
    } catch (error) {
        console.error('Login error:', error);
        sendResponse({
            success: false,
            error: error.message
        });
    }
}

async function handleLogout(sendResponse) {
    console.log('Logout requested');

    try {
        await chrome.storage.local.remove(['authToken', 'userTier', 'userData']);

        console.log('Logout successful');
        sendResponse({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleAnalyzeImage(message, sendResponse) {
    console.log('Analyze image request:', message.imageData?.substring(0, 50) + '...');

    try {
        // Check authentication
        const authStatus = await chrome.storage.local.get(['authToken']);

        if (!authStatus.authToken && message.priority !== 'demo') {
            sendResponse({
                error: true,
                message: 'Autentificare necesară pentru scanarea în timp real',
                needsAuth: true
            });
            return;
        }

        // Simulate API analysis (replace with real API call)
        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

        // Generate mock result
        const fakeScore = Math.random() * 100;
        const result = {
            fakeScore: Math.round(fakeScore),
            isDeepfake: fakeScore > 70,
            confidence: Math.round(85 + Math.random() * 10),
            timestamp: new Date().toISOString(),
            processingTime: Math.round(1000 + Math.random() * 500)
        };

        // Save to history
        await addToHistory({
            fileName: `scan_${Date.now()}.jpg`,
            timestamp: result.timestamp,
            fakeScore: result.fakeScore,
            source: 'extension',
            url: message.imageData?.substring(0, 100) + '...'
        });

        console.log('Analysis result:', result);
        sendResponse(result);

    } catch (error) {
        console.error('Analysis error:', error);
        sendResponse({
            error: true,
            message: error.message,
            fakeScore: 0
        });
    }
}

async function addToHistory(scanData) {
    try {
        const result = await chrome.storage.local.get(['scanHistory']);
        const history = result.scanHistory || [];

        history.unshift(scanData);

        // Keep only last 50 entries
        if (history.length > 50) {
            history.splice(50);
        }

        await chrome.storage.local.set({ scanHistory: history });
        console.log('Added to history:', scanData);
    } catch (error) {
        console.error('Error adding to history:', error);
    }
}

function showNotification(title, message) {
    chrome.storage.local.get(['notificationsEnabled'], (result) => {
        if (result.notificationsEnabled !== false) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon48.png',
                title: title,
                message: message,
                priority: 1
            });
        }
    });
}

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
    chrome.tabs.create({
        url: chrome.runtime.getURL('report.html')
    });
});

// Cleanup old cache periodically
setInterval(() => {
    console.log('Cleaning up old data...');
    // Add cleanup logic here if needed
}, 30 * 60 * 1000); // Every 30 minutes

console.log('BeeDetection background script ready');