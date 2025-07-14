// BeeDetection Pro - Options Page Script
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🔍 BeeDetection Pro options loaded');
    
    // Load current settings
    await loadSettings();
    
    // Setup event listeners
    setupEventListeners();
    
    // Check API status
    await checkApiStatus();
});

const defaultSettings = {
    useGradCAM: true,
    autoScan: false,
    sensitivityLevel: 'medium',
    notifications: true,
    soundAlerts: false,
    platformFacebook: true,
    platformTwitter: true,
    platformInstagram: true,
    apiEndpoint: 'http://localhost:5000',
    maxImages: 20
};

async function loadSettings() {
    try {
        const stored = await chrome.storage.sync.get('settings');
        const settings = { ...defaultSettings, ...(stored.settings || {}) };
        
        // Apply settings to UI
        setToggleState('gradcamToggle', settings.useGradCAM);
        setToggleState('autoscanToggle', settings.autoScan);
        setToggleState('notificationsToggle', settings.notifications);
        setToggleState('soundToggle', settings.soundAlerts);
        setToggleState('facebookToggle', settings.platformFacebook);
        setToggleState('twitterToggle', settings.platformTwitter);
        setToggleState('instagramToggle', settings.platformInstagram);
        
        document.getElementById('sensitivityLevel').value = settings.sensitivityLevel;
        document.getElementById('apiEndpoint').value = settings.apiEndpoint;
        document.getElementById('maxImages').value = settings.maxImages;
        
        // Check if user is premium for Grad-CAM
        const auth = await chrome.storage.sync.get(['isPremium']);
        if (!auth.isPremium) {
            const gradcamItem = document.getElementById('gradcamToggle').closest('.setting-item');
            gradcamItem.classList.add('premium-feature');
        }
        
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

function setupEventListeners() {
    // Toggle switches
    const toggles = [
        'gradcamToggle', 'autoscanToggle', 'notificationsToggle', 
        'soundToggle', 'facebookToggle', 'twitterToggle', 'instagramToggle'
    ];
    
    toggles.forEach(id => {
        const toggle = document.getElementById(id);
        if (toggle) {
            toggle.addEventListener('click', () => {
                toggle.classList.toggle('active');
            });
        }
    });
    
    // Save button
    document.getElementById('saveSettings').addEventListener('click', saveSettings);
    
    // API endpoint change
    document.getElementById('apiEndpoint').addEventListener('blur', checkApiStatus);
}

function setToggleState(toggleId, isActive) {
    const toggle = document.getElementById(toggleId);
    if (toggle) {
        if (isActive) {
            toggle.classList.add('active');
        } else {
            toggle.classList.remove('active');
        }
    }
}

function getToggleState(toggleId) {
    const toggle = document.getElementById(toggleId);
    return toggle ? toggle.classList.contains('active') : false;
}

async function saveSettings() {
    try {
        const settings = {
            useGradCAM: getToggleState('gradcamToggle'),
            autoScan: getToggleState('autoscanToggle'),
            sensitivityLevel: document.getElementById('sensitivityLevel').value,
            notifications: getToggleState('notificationsToggle'),
            soundAlerts: getToggleState('soundToggle'),
            platformFacebook: getToggleState('facebookToggle'),
            platformTwitter: getToggleState('twitterToggle'),
            platformInstagram: getToggleState('instagramToggle'),
            apiEndpoint: document.getElementById('apiEndpoint').value,
            maxImages: parseInt(document.getElementById('maxImages').value)
        };
        
        await chrome.storage.sync.set({ settings });
        
        // Show success message
        showStatusMessage('Settings saved successfully! 🎉', 'success');
        
        // Update API status
        await checkApiStatus();
        
    } catch (error) {
        console.error('Error saving settings:', error);
        showStatusMessage('Failed to save settings. Please try again.', 'error');
    }
}

async function checkApiStatus() {
    const apiEndpoint = document.getElementById('apiEndpoint').value;
    const statusDot = document.getElementById('apiStatusDot');
    const statusText = document.getElementById('apiStatusText');
    
    statusText.textContent = 'Checking API connection...';
    statusDot.className = 'status-dot';
    
    try {
        const response = await fetch(`${apiEndpoint}/api/health`, {
            method: 'GET',
            timeout: 5000
        });
        
        if (response.ok) {
            const data = await response.json();
            statusDot.className = 'status-dot';
            statusText.textContent = `✅ Connected to BeeDetection API (v${data.version || '2.0'})`;
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        statusDot.className = 'status-dot offline';
        statusText.textContent = `❌ API connection failed: ${error.message}`;
    }
}

function showStatusMessage(message, type = 'success') {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';
    
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 3000);
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadSettings,
        saveSettings,
        checkApiStatus
    };
}
