let universalScanner = {
    isEnabled: false,
    isAuthenticated: false,
    processedImages: new Set(),
    threshold: 70,
    observer: null
};

chrome.storage.local.get(['enableAutoScan', 'authToken', 'scanThreshold'], function(data) {
    universalScanner.isEnabled = data.enableAutoScan || false;
    universalScanner.isAuthenticated = !!data.authToken;
    universalScanner.threshold = data.scanThreshold || 70;
    
    if (universalScanner.isEnabled && universalScanner.isAuthenticated) {
        initUniversalScanning();
    }
});

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    switch(message.action) {
        case "toggleRealTimeScanning":
            universalScanner.isEnabled = message.enabled;
            if (universalScanner.isEnabled && universalScanner.isAuthenticated) {
                initUniversalScanning();
            } else {
                stopUniversalScanning();
            }
            break;
        case "scanImage":
            if (message.imageUrl) {
                scanSingleImage(message.imageUrl);
            }
            break;
    }
    
    if (message.type === 'ANALYSIS_COMPLETE') {
        handleUniversalResult(message.result, message.imageData);
    } else if (message.type === 'AUTH_STATUS_CHANGED') {
        universalScanner.isAuthenticated = message.isAuthenticated;
        if (universalScanner.isEnabled && universalScanner.isAuthenticated) {
            initUniversalScanning();
        } else if (!universalScanner.isAuthenticated) {
            stopUniversalScanning();
        }
    }
});

function initUniversalScanning() {
    if (!universalScanner.isAuthenticated) {
        return;
    }
    
    scanExistingImages();
    setupUniversalObserver();
}

function scanExistingImages() {
    const images = document.querySelectorAll('img[src]:not([data-deepfake-scanned])');
    images.forEach(img => {
        if (isValidForScanning(img)) {
            processUniversalImage(img);
        }
    });
}

function setupUniversalObserver() {
    if (universalScanner.observer) {
        universalScanner.observer.disconnect();
    }
    
    universalScanner.observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    if (node.tagName === 'IMG' && node.src) {
                        if (isValidForScanning(node)) {
                            processUniversalImage(node);
                        }
                    } else {
                        const images = node.querySelectorAll ? node.querySelectorAll('img[src]:not([data-deepfake-scanned])') : [];
                        images.forEach(img => {
                            if (isValidForScanning(img)) {
                                processUniversalImage(img);
                            }
                        });
                    }
                }
            });
        });
    });
    
    universalScanner.observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function isValidForScanning(img) {
    if (!img.src || img.src.startsWith('data:')) return false;
    if (img.src.includes('icon') || img.src.includes('logo') || img.src.includes('avatar')) return false;
    if (universalScanner.processedImages.has(img.src)) return false;
    
    const rect = img.getBoundingClientRect();
    return rect.width >= 150 && rect.height >= 150;
}

function processUniversalImage(img) {
    img.setAttribute('data-deepfake-scanned', 'processing');
    universalScanner.processedImages.add(img.src);
    
    addUniversalScanButton(img);
}

function addUniversalScanButton(img) {
    const parent = img.parentNode;
    if (!parent) return;
    
    const computedStyle = window.getComputedStyle(parent);
    if (computedStyle.position === 'static') {
        parent.style.position = 'relative';
    }
    
    const scanButton = document.createElement('div');
    scanButton.className = 'deepfake-scan-container';
    scanButton.innerHTML = `
        <button class="deepfake-scan-button">
            <span>🔍</span> Scanează
        </button>
    `;
    
    scanButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        scanSingleImage(img.src, img);
        scanButton.remove();
    });
    
    parent.appendChild(scanButton);
}

function scanSingleImage(imageUrl, imgElement = null) {
    if (!universalScanner.isAuthenticated) {
        showUniversalNotification("Conectare necesară pentru scanare", "warning");
        return;
    }
    
    chrome.runtime.sendMessage({
        type: 'ANALYZE_IMAGE',
        imageData: imageUrl,
        priority: 'manual'
    });
    
    if (imgElement) {
        addUniversalOverlay(imgElement, 'processing');
    }
    
    showUniversalNotification("Scanare în curs...", "info");
}

function handleUniversalResult(result, imageData) {
    if (result.error) {
        showUniversalNotification("Eroare la scanare: " + result.message, "error");
        return;
    }
    
    const fakeScore = result.result?.fakeScore || result.fakeScore || 0;
    const img = document.querySelector(`img[src="${imageData}"]`);
    
    if (img) {
        updateUniversalImageResult(img, fakeScore);
    }
    
    showUniversalResultNotification(fakeScore);
}

function updateUniversalImageResult(img, score) {
    let status = 'authentic';
    if (score > universalScanner.threshold) {
        status = 'fake';
    } else if (score > 40) {
        status = 'suspicious';
    }
    
    addUniversalOverlay(img, status, score);
    img.setAttribute('data-deepfake-status', status);
    img.setAttribute('data-deepfake-score', score);
}

function addUniversalOverlay(img, status, score = null) {
    removeUniversalOverlay(img);
    
    const parent = img.parentNode;
    if (!parent) return;
    
    const overlay = document.createElement('div');
    overlay.className = 'deepfake-overlay';
    
    let content = '';
    
    switch(status) {
        case 'processing':
            content = `
                <div class="deepfake-result-badge processing">
                    <div class="deepfake-spinner"></div>
                    Scanare...
                </div>
            `;
            break;
        case 'fake':
            content = `
                <div class="deepfake-result-badge fake">
                    ⚠️ Deepfake (${Math.round(score)}%)
                </div>
            `;
            break;
        case 'suspicious':
            content = `
                <div class="deepfake-result-badge suspicious">
                    ⚠ Suspect (${Math.round(score)}%)
                </div>
            `;
            break;
        case 'authentic':
            content = `
                <div class="deepfake-result-badge authentic">
                    ✓ Autentic (${Math.round(score)}%)
                </div>
            `;
            break;
    }
    
    overlay.innerHTML = content;
    parent.appendChild(overlay);
}

function removeUniversalOverlay(img) {
    const parent = img.parentNode;
    if (!parent) return;
    
    const existingOverlay = parent.querySelector('.deepfake-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }
}

function showUniversalNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `deepfake-notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function showUniversalResultNotification(score) {
    let message = `Conținut autentic (${Math.round(score)}%)`;
    let type = 'success';
    
    if (score > 70) {
        message = `Deepfake detectat (${Math.round(score)}%)`;
        type = 'error';
    } else if (score > 40) {
        message = `Conținut suspect (${Math.round(score)}%)`;
        type = 'warning';
    }
    
    showUniversalNotification(message, type);
}

function stopUniversalScanning() {
    if (universalScanner.observer) {
        universalScanner.observer.disconnect();
        universalScanner.observer = null;
    }
    
    document.querySelectorAll('.deepfake-overlay, .deepfake-scan-container').forEach(el => el.remove());
    document.querySelectorAll('[data-deepfake-scanned]').forEach(el => {
        el.removeAttribute('data-deepfake-scanned');
        el.removeAttribute('data-deepfake-status');
        el.removeAttribute('data-deepfake-score');
    });
}