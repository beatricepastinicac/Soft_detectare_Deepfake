// BeeDetection Pro - Enhanced Content Script
console.log('🔍 BeeDetection Pro content script loaded');

let isScanning = false;
let scanResults = [];
let config = {
    apiBase: 'http://localhost:5000',
    token: null,
    useGradCAM: false
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    console.log('Content script received message:', request);

    if (request.action === 'ping') {
        sendResponse({ success: true, message: 'Content script active' });
        return true;
    }

    if (request.action === 'scanPage') {
        // Update config from popup
        config.apiBase = request.apiBase || config.apiBase;
        config.token = request.token;
        config.useGradCAM = request.useGradCAM || false;
        
        scanCurrentPage()
            .then(results => {
                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime error:', chrome.runtime.lastError);
                    return;
                }
                try {
                    sendResponse({
                        success: true,
                        message: `Scanned ${results.length} images`,
                        results: results
                    });
                } catch (error) {
                    console.error('Error sending response:', error);
                }
            })
            .catch(error => {
                console.error('Scan error:', error);
                try {
                    sendResponse({
                        success: false,
                        message: 'Scan failed: ' + error.message
                    });
                } catch (responseError) {
                    console.error('Error sending error response:', responseError);
                }
            });

        return true; // Async response
    }

    if (request.action === 'scanImage' && request.imageUrl) {
        scanSingleImage(request.imageUrl)
            .then(result => {
                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime error:', chrome.runtime.lastError);
                    return;
                }
                try {
                    sendResponse({
                        success: true,
                        result: result
                    });
                } catch (error) {
                    console.error('Error sending response:', error);
                }
            })
            .catch(error => {
                try {
                    sendResponse({
                        success: false,
                        error: error.message
                    });
                } catch (responseError) {
                    console.error('Error sending error response:', responseError);
                }
            });

        return true;
    }
    
    return false; // Sync response for other messages
});

/**
 * Enhanced page scanning with premium features
 */
async function scanCurrentPage() {
    if (isScanning) {
        throw new Error('Scan already in progress');
    }
    
    isScanning = true;
    scanResults = [];
    
    try {
        console.log('🔄 Starting enhanced page scan...');
        
        // Find all images on the page
        const images = await findAllImages();
        console.log(`📸 Found ${images.length} images to analyze`);
        
        if (images.length === 0) {
            return [];
        }
        
        // Show scanning indicator
        showScanningIndicator(images.length);
        
        // Scan images with premium features
        const results = await Promise.all(
            images.map((img, index) => 
                scanImageWithPremiumFeatures(img, index + 1, images.length)
            )
        );
        
        // Filter successful results
        scanResults = results.filter(r => r && r.success).map(r => r.data);
        
        console.log(`✅ Scan completed: ${scanResults.length} results`);
        
        // Hide scanning indicator
        hideScanningIndicator();
        
        // Add visual indicators to high-risk images
        highlightRiskyImages(scanResults);
        
        return scanResults;
        
    } catch (error) {
        console.error('Scan error:', error);
        hideScanningIndicator();
        throw error;
    } finally {
        isScanning = false;
    }
}

/**
 * Find all images on the current page
 */
async function findAllImages() {
    const images = [];
    
    try {
        // Regular img elements
        const imgElements = document.querySelectorAll('img[src]');
        imgElements.forEach(img => {
            try {
                if (img.src && img.src.startsWith('http') && isImageVisible(img)) {
                    images.push({
                        element: img,
                        url: img.src,
                        type: 'img',
                        platform: detectPlatform() || 'unknown'
                    });
                }
            } catch (e) {
                console.warn('Error processing image:', e);
            }
        });
        
        // Only scan background images if we found few regular images
        if (images.length < 5) {
            try {
                const elementsWithBg = document.querySelectorAll('div, section, header, main');
                elementsWithBg.forEach(el => {
                    try {
                        const bgImage = window.getComputedStyle(el).backgroundImage;
                        if (bgImage && bgImage !== 'none') {
                            const matches = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
                            if (matches && matches[1] && matches[1].startsWith('http')) {
                                images.push({
                                    element: el,
                                    url: matches[1],
                                    type: 'background',
                                    platform: detectPlatform() || 'unknown'
                                });
                            }
                        }
                    } catch (e) {
                        // Skip problematic elements
                    }
                });
            } catch (e) {
                console.warn('Error scanning background images:', e);
            }
        }
    } catch (error) {
        console.error('Error finding images:', error);
    }

    // Remove duplicates and limit
    const uniqueImages = images.filter((img, index, self) => 
        index === self.findIndex(i => i.url === img.url)
    );
    
    console.log(`Found ${uniqueImages.length} unique images to scan`);
    return uniqueImages.slice(0, 10); // Limit to 10 images for performance
}

/**
 * Enhanced image scanning with premium backend integration
 */
async function scanImageWithPremiumFeatures(imageData, current, total) {
    try {
        console.log(`🔍 Scanning image ${current}/${total}:`, imageData.url);
        
        // Update progress indicator
        updateScanProgress(current, total);
        
        // Create form data for upload
        const imageBlob = await fetchImageAsBlob(imageData.url);
        if (!imageBlob) {
            throw new Error('Failed to fetch image');
        }
        
        const formData = new FormData();
        formData.append('image', imageBlob, 'image.jpg');
        formData.append('source', 'extension');
        formData.append('platform', imageData.platform);
        
        // API endpoint based on premium status
        const endpoint = config.useGradCAM && config.token ? 
            '/api/extension/analyze-premium' : '/api/extension/analyze';
        
        const headers = {};
        if (config.token) {
            headers['Authorization'] = `Bearer ${config.token}`;
        }
        
        // Call our enhanced backend API
        const response = await fetch(`${config.apiBase}${endpoint}`, {
            method: 'POST',
            headers: headers,
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Enhanced result processing
        const analysisResult = {
            imageUrl: imageData.url,
            element: imageData.element,
            fakeScore: result.fake_score || result.fakeScore || 0,
            confidenceScore: result.confidence_score || result.confidenceScore || 0,
            isDeepfake: result.is_deepfake || result.isDeepfake || false,
            platform: imageData.platform,
            gradCAM: result.heatmap_available || false,
            heatmapUrl: result.heatmap_url,
            premiumAnalysis: !!config.token,
            timestamp: Date.now(),
            details: {
                method: result.method || 'standard',
                processingTime: result.processing_time,
                modelUsed: result.model_used
            }
        };
        
        return {
            success: true,
            data: analysisResult
        };
        
    } catch (error) {
        console.error(`Error scanning image ${current}:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function scanCurrentPage() {
    if (isScanning) {
        throw new Error('Scanare în curs...');
    }

    isScanning = true;
    scanResults = [];

    try {
        const images = findScannableImages();
        console.log(`Found ${images.length} images to scan`);

        if (images.length === 0) {
            throw new Error('Nu s-au găsit imagini de scanat pe această pagină');
        }

        // Simulate scanning process
        for (let i = 0; i < Math.min(images.length, 5); i++) {
            const img = images[i];
            const result = await simulateScan(img);
            scanResults.push(result);

            // Add visual indicator
            addScanIndicator(img, result);
        }

        return scanResults;

    } finally {
        isScanning = false;
    }
}

function findScannableImages() {
    const images = [];
    const allImages = document.querySelectorAll('img');

    allImages.forEach(img => {
        if (isImageScannable(img)) {
            images.push(img);
        }
    });

    return images;
}

function isImageScannable(img) {
    // Check if image is valid for scanning
    if (!img.src || img.src.startsWith('data:')) {
        return false;
    }

    // Check size
    const rect = img.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 100) {
        return false;
    }

    // Check if image is loaded
    if (!img.complete || img.naturalWidth === 0) {
        return false;
    }

    // Skip icons and small images
    if (img.src.includes('icon') || img.src.includes('logo')) {
        return false;
    }

    return true;
}

async function simulateScan(img) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    // Generate fake score (in real app, this would be from AI API)
    const fakeScore = Math.random() * 100;

    const result = {
        imageUrl: img.src,
        fakeScore: Math.round(fakeScore),
        isDeepfake: fakeScore > 70,
        confidence: Math.round(85 + Math.random() * 10),
        timestamp: new Date().toISOString()
    };

    console.log('Scan result:', result);
    return result;
}

async function scanSingleImage(imageUrl) {
    console.log('Scanning single image:', imageUrl);

    // Simulate scan
    await new Promise(resolve => setTimeout(resolve, 1000));

    const fakeScore = Math.random() * 100;

    return {
        imageUrl: imageUrl,
        fakeScore: Math.round(fakeScore),
        isDeepfake: fakeScore > 70,
        confidence: Math.round(85 + Math.random() * 10),
        timestamp: new Date().toISOString()
    };
}

function addScanIndicator(img, result) {
    // Remove existing indicator
    removeScanIndicator(img);

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'beedetection-overlay';
    overlay.style.cssText = `
        position: absolute;
        top: 5px;
        right: 5px;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
        color: white;
        z-index: 10000;
        pointer-events: none;
        font-family: Arial, sans-serif;
    `;

    if (result.isDeepfake) {
        overlay.style.background = 'rgba(220, 53, 69, 0.9)';
        overlay.textContent = `⚠️ ${result.fakeScore}%`;
    } else if (result.fakeScore > 40) {
        overlay.style.background = 'rgba(255, 193, 7, 0.9)';
        overlay.textContent = `⚠ ${result.fakeScore}%`;
    } else {
        overlay.style.background = 'rgba(40, 167, 69, 0.9)';
        overlay.textContent = `✓ ${result.fakeScore}%`;
    }

    // Make parent relative if needed
    const parent = img.parentElement;
    if (parent) {
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.position === 'static') {
            parent.style.position = 'relative';
        }
        parent.appendChild(overlay);
    }

    // Store reference for cleanup
    img.setAttribute('data-beedetection-scanned', 'true');
}

function removeScanIndicator(img) {
    const parent = img.parentElement;
    if (parent) {
        const existing = parent.querySelector('.beedetection-overlay');
        if (existing) {
            existing.remove();
        }
    }
}

// Auto-scan functionality (simplified)
let autoScanEnabled = false;
let processedImages = new Set();

function initAutoScan() {
    if (!autoScanEnabled) return;

    // Scan existing images
    const images = findScannableImages();
    images.forEach(img => {
        if (!processedImages.has(img.src)) {
            addScanButton(img);
            processedImages.add(img.src);
        }
    });

    // Watch for new images
    const observer = new MutationObserver(() => {
        if (autoScanEnabled) {
            setTimeout(() => {
                const newImages = findScannableImages();
                newImages.forEach(img => {
                    if (!processedImages.has(img.src)) {
                        addScanButton(img);
                        processedImages.add(img.src);
                    }
                });
            }, 1000);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function addScanButton(img) {
    const parent = img.parentElement;
    if (!parent) return;

    // Make parent relative
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.position === 'static') {
        parent.style.position = 'relative';
    }

    // Create scan button
    const button = document.createElement('button');
    button.className = 'beedetection-scan-btn';
    button.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(26, 115, 232, 0.9);
        color: white;
        border: none;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 11px;
        cursor: pointer;
        z-index: 10000;
        font-family: Arial, sans-serif;
    `;
    button.textContent = '🔍 Scanează';

    button.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        button.textContent = '⟳ Scanez...';
        button.disabled = true;

        try {
            const result = await simulateScan(img);
            addScanIndicator(img, result);
            button.remove();
        } catch (error) {
            button.textContent = '❌ Eroare';
            setTimeout(() => {
                button.textContent = '🔍 Scanează';
                button.disabled = false;
            }, 2000);
        }
    });

    parent.appendChild(button);
}

// Initialize based on storage settings
chrome.storage.local.get(['enableAutoScan'], function (result) {
    autoScanEnabled = result.enableAutoScan || false;
    if (autoScanEnabled) {
        initAutoScan();
    }
});

// Show notification helper
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 10px 15px;
        border-radius: 4px;
        color: white;
        font-family: Arial, sans-serif;
        font-size: 14px;
        z-index: 10001;
        max-width: 300px;
        ${type === 'error' ? 'background: #d93025;' :
            type === 'success' ? 'background: #0f9d58;' :
                'background: #1a73e8;'}
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

/**
 * Helper functions
 */
function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    // Check if it's a data URL or valid HTTP(S) URL
    if (url.startsWith('data:image/')) return true;
    if (!url.match(/^https?:\/\//)) return false;
    
    // Check for image extensions
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i;
    return imageExtensions.test(url) || url.includes('image') || url.includes('photo');
}

function isImageVisible(element) {
    try {
        if (!element) return false;
        
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        
        return rect.width > 50 && 
               rect.height > 50 && 
               style.display !== 'none' && 
               style.visibility !== 'hidden' &&
               style.opacity !== '0';
    } catch (error) {
        console.warn('Error checking image visibility:', error);
        return true; // Assume visible if we can't check
    }
}

function detectPlatform() {
    try {
        const hostname = window.location.hostname.toLowerCase();
        
        if (hostname.includes('facebook.com') || hostname.includes('fb.com')) return 'facebook';
        if (hostname.includes('instagram.com')) return 'instagram';
        if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'twitter';
        if (hostname.includes('tiktok.com')) return 'tiktok';
        if (hostname.includes('youtube.com')) return 'youtube';
        if (hostname.includes('bing.com')) return 'bing';
        if (hostname.includes('google.com')) return 'google';
        
        return 'web';
    } catch (error) {
        console.warn('Error detecting platform:', error);
        return 'unknown';
    }
}

async function findPlatformSpecificImages() {
    const platform = detectPlatform();
    const images = [];
    
    switch (platform) {
        case 'facebook':
            // Facebook-specific image selectors
            const fbImages = document.querySelectorAll('img[data-imgperflogname], img[src*="scontent"]');
            fbImages.forEach(img => {
                if (isValidImageUrl(img.src) && isImageVisible(img)) {
                    images.push({
                        element: img,
                        url: img.src,
                        type: 'facebook-post',
                        platform: 'facebook'
                    });
                }
            });
            break;
            
        case 'instagram':
            // Instagram-specific selectors
            const igImages = document.querySelectorAll('img[src*="cdninstagram"], article img');
            igImages.forEach(img => {
                if (isValidImageUrl(img.src) && isImageVisible(img)) {
                    images.push({
                        element: img,
                        url: img.src,
                        type: 'instagram-post',
                        platform: 'instagram'
                    });
                }
            });
            break;
            
        case 'twitter':
            // Twitter/X specific selectors
            const twImages = document.querySelectorAll('img[src*="twimg.com"], img[src*="pbs.twimg.com"]');
            twImages.forEach(img => {
                if (isValidImageUrl(img.src) && isImageVisible(img)) {
                    images.push({
                        element: img,
                        url: img.src,
                        type: 'twitter-post',
                        platform: 'twitter'
                    });
                }
            });
            break;
    }
    
    return images;
}

async function fetchImageAsBlob(url) {
    try {
        if (url.startsWith('data:')) {
            // Convert data URL to blob
            const response = await fetch(url);
            return await response.blob();
        }
        
        // For regular URLs, try to fetch with CORS
        const response = await fetch(url, {
            mode: 'cors',
            credentials: 'omit'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.blob();
    } catch (error) {
        console.warn('Failed to fetch image directly:', error);
        
        // Fallback: try to convert via canvas
        return await convertImageToBlob(url);
    }
}

async function convertImageToBlob(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = function() {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                
                ctx.drawImage(img, 0, 0);
                
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to convert to blob'));
                    }
                }, 'image/jpeg', 0.8);
            } catch (error) {
                reject(error);
            }
        };
        
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = url;
    });
}

/**
 * Visual feedback functions
 */
function showScanningIndicator(totalImages) {
    try {
        const indicator = createScanIndicator();
        indicator.innerHTML = `
            <div class="bee-scan-content">
                <div class="bee-scan-icon">🔍</div>
                <div class="bee-scan-text">BeeDetection Pro</div>
                <div class="bee-scan-progress">Scanning ${totalImages} images...</div>
                <div class="bee-progress-bar">
                    <div class="bee-progress-fill" style="width: 0%"></div>
                </div>
            </div>
        `;
        
        if (document.body) {
            document.body.appendChild(indicator);
        }
    } catch (error) {
        console.warn('Could not show scanning indicator:', error);
    }
}

function updateScanProgress(current, total) {
    const indicator = document.getElementById('bee-scan-indicator');
    if (!indicator) return;
    
    const percentage = (current / total) * 100;
    const progressBar = indicator.querySelector('.bee-progress-fill');
    const progressText = indicator.querySelector('.bee-scan-progress');
    
    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressText) progressText.textContent = `Scanning ${current}/${total} images...`;
}

function hideScanningIndicator() {
    try {
        const indicator = document.getElementById('bee-scan-indicator');
        if (indicator) {
            indicator.style.opacity = '0';
            setTimeout(() => {
                try {
                    indicator.remove();
                } catch (e) {
                    console.warn('Could not remove indicator:', e);
                }
            }, 300);
        }
    } catch (error) {
        console.warn('Could not hide scanning indicator:', error);
    }
}

function createScanIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'bee-scan-indicator';
    indicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        min-width: 250px;
        transition: all 0.3s ease;
        border: 1px solid rgba(26, 115, 232, 0.2);
    `;
    
    // Add internal styles
    const style = document.createElement('style');
    style.textContent = `
        .bee-scan-content {
            text-align: center;
        }
        .bee-scan-icon {
            font-size: 24px;
            margin-bottom: 8px;
        }
        .bee-scan-text {
            font-weight: bold;
            color: #1a73e8;
            margin-bottom: 4px;
        }
        .bee-scan-progress {
            font-size: 12px;
            color: #666;
            margin-bottom: 12px;
        }
        .bee-progress-bar {
            width: 100%;
            height: 4px;
            background: #e0e0e0;
            border-radius: 2px;
            overflow: hidden;
        }
        .bee-progress-fill {
            height: 100%;
            background: linear-gradient(45deg, #1a73e8, #4285f4);
            transition: width 0.3s ease;
        }
    `;
    
    indicator.appendChild(style);
    
    return indicator;
}

function highlightRiskyImages(results) {
    results.forEach(result => {
        if (result.fakeScore > 70 && result.element) {
            addWarningOverlay(result.element, result.fakeScore);
        }
    });
}

function addWarningOverlay(element, fakeScore) {
    // Remove existing overlay
    const existingOverlay = element.parentElement?.querySelector('.bee-warning-overlay');
    if (existingOverlay) existingOverlay.remove();
    
    const overlay = document.createElement('div');
    overlay.className = 'bee-warning-overlay';
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 0, 0, 0.2);
        border: 2px solid #ff0000;
        border-radius: 4px;
        pointer-events: none;
        z-index: 1000;
    `;
    
    const warning = document.createElement('div');
    warning.style.cssText = `
        position: absolute;
        top: 8px;
        left: 8px;
        background: #ff0000;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
    `;
    warning.textContent = `⚠️ ${fakeScore.toFixed(1)}% FAKE`;
    
    overlay.appendChild(warning);
    
    // Make parent relative if needed
    const parent = element.parentElement;
    if (parent && window.getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
    }
    
    parent.appendChild(overlay);
    
    // Auto-remove after 10 seconds
    setTimeout(() => overlay.remove(), 10000);
}

// Legacy function for backward compatibility
async function scanCurrentPageLegacy() {
    return await scanCurrentPage();
}

// Legacy function for backward compatibility  
async function scanSingleImage(imageUrl) {
    const imageData = {
        url: imageUrl,
        element: null,
        type: 'external',
        platform: 'web'
    };
    
    const result = await scanImageWithPremiumFeatures(imageData, 1, 1);
    return result.success ? result.data : null;
}

console.log('✅ BeeDetection Pro content script ready');