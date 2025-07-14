// BeeDetection Pro - Extension Auth Bridge
// This script handles communication between web pages and the extension

console.log('🔌 BeeDetection Pro auth bridge loaded');

// Listen for messages from the web page
window.addEventListener('message', (event) => {
    // Only accept messages from our domain
    if (event.origin !== 'http://localhost:5000') {
        return;
    }
    
    if (event.data.type === 'EXTENSION_LOGIN_SUCCESS') {
        console.log('📨 Received login success from web page:', event.data);
        
        // Forward the message to the extension
        chrome.runtime.sendMessage({
            type: 'EXTENSION_LOGIN_SUCCESS',
            token: event.data.token,
            email: event.data.email,
            isPremium: event.data.isPremium,
            user: event.data.user
        }).then(() => {
            console.log('✅ Login data sent to extension');
        }).catch((error) => {
            console.error('❌ Error sending login data to extension:', error);
        });
    }
});

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXTENSION_AUTH_REQUEST') {
        // Request auth info from the page
        window.postMessage({
            type: 'EXTENSION_AUTH_REQUEST'
        }, '*');
    }
    
    return true; // Keep message channel open
});

// Check if we're on the login page and set up auto-detection
if (window.location.pathname.includes('extension-login.html')) {
    console.log('🔐 On extension login page - setting up auto-detection');
    
    // Monitor for successful logins
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                const successElement = document.querySelector('.success[style*="block"]');
                if (successElement) {
                    console.log('✅ Login success detected via DOM');
                    // Give the page time to store data
                    setTimeout(() => {
                        checkForAuthData();
                    }, 500);
                }
            }
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style']
    });
    
    // Function to check for stored auth data
    function checkForAuthData() {
        const authData = localStorage.getItem('extensionAuth');
        if (authData) {
            try {
                const parsed = JSON.parse(authData);
                window.postMessage({
                    type: 'EXTENSION_LOGIN_SUCCESS',
                    ...parsed
                }, '*');
            } catch (error) {
                console.error('Error parsing auth data:', error);
            }
        }
    }
    
    // Also check immediately in case data is already there
    setTimeout(checkForAuthData, 1000);
}

console.log('🎯 Auth bridge setup complete');
