chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === "scanImage" && message.imageUrl) {
        scanImageFromUrl(message.imageUrl);
    }
});

async function scanImageFromUrl(imageUrl) {
    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const fileName = imageUrl.split('/').pop() || "image.jpg";
        const file = new File([blob], fileName, { type: blob.type });
        
        chrome.storage.local.get(["apiUrl"], async function(data) {
            const apiUrl = data.apiUrl || "http://localhost:5000/api/analysis/upload";
            
            const formData = new FormData();
            formData.append('video', file);
            
            try {
                showNotification("Scanare în curs...");
                
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) {
                    throw new Error(`Eroare server (${response.status})`);
                }
                
                const result = await response.json();
                
                addToHistory({
                    fileName: fileName,
                    timestamp: new Date().toISOString(),
                    fakeScore: result.detectionResult.fakeScore
                });
                
                showResultNotification(result.detectionResult);
                
                chrome.runtime.sendMessage({
                    action: "scanResult",
                    result: result
                });
            } catch (error) {
                console.error("Error scanning:", error);
                showNotification("Eroare: " + error.message);
            }
        });
    } catch (error) {
        console.error("Error fetching image:", error);
        showNotification("Nu s-a putut accesa imaginea");
    }
}

function showNotification(message) {
    const notification = document.createElement("div");
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #1d3557;
        color: white;
        padding: 12px 16px;
        border-radius: 4px;
        z-index: 10000;
        font-family: 'Arial', sans-serif;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = "0";
        notification.style.transition = "opacity 0.3s";
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

function showResultNotification(result) {
    if (!result) return;
    
    const { fakeScore } = result;
    
    let color = "#28a745";
    let message = `Deepfake (${fakeScore}%)`;
    
    if (fakeScore > 70) {
        color = "#dc3545";
        message = `Deepfake (${fakeScore}%)`;
    } else if (fakeScore > 40) {
        color = "#fd7e14";
        message = `Deepfake (${fakeScore}%)`;
    }
    
    const notification = document.createElement("div");
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: ${color};
        color: white;
        padding: 12px 16px;
        border-radius: 4px;
        z-index: 10000;
        font-family: 'Arial', sans-serif;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = "0";
        notification.style.transition = "opacity 0.3s";
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 4000);
}

function addToHistory(scanItem) {
    chrome.storage.local.get(["scanHistory"], function(data) {
        const history = data.scanHistory || [];
        
        history.unshift(scanItem);
        
        if (history.length > 20) {
            history.pop();
        }
        
        chrome.storage.local.set({ scanHistory: history });
    });
}

const socialMediaConfig = {
  "facebook.com": {
    imageSelectors: [".x1ey2m1c img", "[data-visualcompletion='media-vc-image']", ".x85a59c img"],
    videoSelectors: ["video", ".x1lliihq video", "[aria-label='Video'] video"]
  },
  "instagram.com": {
    imageSelectors: ["article img", ".FFVAD", "._aagt"],
    videoSelectors: ["video", "._aagu video"]
  },
  "twitter.com": {
    imageSelectors: [".css-9pa8cd", "[data-testid='tweetPhoto'] img"],
    videoSelectors: [".css-1dbjc4n video"]
  },
  "tiktok.com": {
    imageSelectors: [".tiktok-1itcwxg-ImgPoster"],
    videoSelectors: ["video"]
  }
};

function initSocialMediaScanner() {
  const currentHost = window.location.hostname;
  
  for (const domain in socialMediaConfig) {
    if (currentHost.includes(domain)) {
      console.log(`Detectată rețeaua socială: ${domain}`);
      
      setupObserver(socialMediaConfig[domain]);
      
      scanExistingContent(socialMediaConfig[domain]);
      
      break;
    }
  }
}

function scanExistingContent(config) {
  let images = [];
  config.imageSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      if (el.src && !el.hasAttribute('data-deepfake-scanned')) {
        images.push(el);
      }
    });
  });
  
  let videos = [];
  config.videoSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      if (el.src && !el.hasAttribute('data-deepfake-scanned')) {
        videos.push(el);
      }
    });
  });
  
  images.forEach(img => processMediaElement(img));
  
  videos.forEach(video => processMediaElement(video, true));
}

function processMediaElement(element, isVideo = false) {
  element.setAttribute('data-deepfake-scanned', 'true');
  
  chrome.storage.local.get(['enableAutoScan'], function(data) {
    if (data.enableAutoScan) {
      addOverlay(element, 'pending');
      
      if (isVideo) {
        addScanButton(element);
      } else {
        if (element.complete && element.naturalHeight !== 0) {
          scanImageElement(element);
        } else {
          element.onload = () => scanImageElement(element);
        }
      }
    } else {
      addScanButton(element);
    }
  });
}

function addScanButton(element) {
  const container = document.createElement('div');
  container.className = 'deepfake-scan-container';
  container.style.cssText = `
    position: absolute;
    top: 5px;
    right: 5px;
    z-index: 10000;
  `;
  
  const button = document.createElement('button');
  button.className = 'deepfake-scan-button';
  button.textContent = 'Scanează';
  button.style.cssText = `
    background-color: rgba(29, 53, 87, 0.8);
    color: white;
    border: none;
    border-radius: 4px;
    padding: 5px 8px;
    font-size: 12px;
    cursor: pointer;
    transition: background-color 0.2s;
  `;
  
  button.addEventListener('mouseover', () => {
    button.style.backgroundColor = 'rgba(29, 53, 87, 1)';
  });
  
  button.addEventListener('mouseout', () => {
    button.style.backgroundColor = 'rgba(29, 53, 87, 0.8)';
  });
  
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (element.tagName.toLowerCase() === 'video') {
      captureVideoFrame(element).then(imgData => {
        scanImageDataUrl(imgData, element);
      });
    } else {
      scanImageElement(element);
    }
    
    container.remove();
  });
  
  container.appendChild(button);
  
  const parent = element.parentNode;
  parent.style.position = 'relative';
  parent.appendChild(container);
}

function addOverlay(element, status, score = null) {
  removeOverlay(element);
  
  const overlay = document.createElement('div');
  overlay.className = 'deepfake-overlay';
  overlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    pointer-events: none;
  `;
  
  let content = '';
  let backgroundColor = '';
  
  switch(status) {
    case 'pending':
      backgroundColor = 'rgba(255, 193, 7, 0.2)';
      content = '<div style="background-color: rgba(255, 193, 7, 0.8); color: black; padding: 5px 10px; border-radius: 4px; font-size: 12px;">Scanare în curs...</div>';
      break;
    case 'fake':
      backgroundColor = 'rgba(220, 53, 69, 0.3)';
      content = `<div style="background-color: rgba(220, 53, 69, 0.9); color: white; padding: 8px 12px; border-radius: 4px; font-size: 14px; font-weight: bold;">⚠️ Posibil deepfake (${score}%)</div>`;
      break;
    case 'suspicious':
      backgroundColor = 'rgba(255, 193, 7, 0.3)';
      content = `<div style="background-color: rgba(255, 193, 7, 0.9); color: black; padding: 8px 12px; border-radius: 4px; font-size: 14px; font-weight: bold;">⚠️ Conținut suspect (${score}%)</div>`;
      break;
    case 'authentic':
      backgroundColor = 'rgba(40, 167, 69, 0.2)';
      content = `<div style="background-color: rgba(40, 167, 69, 0.8); color: white; padding: 5px 10px; border-radius: 4px; font-size: 12px;">Conținut verificat (${score}%)</div>`;
      break;
    case 'error':
      backgroundColor = 'rgba(108, 117, 125, 0.2)';
      content = '<div style="background-color: rgba(108, 117, 125, 0.8); color: white; padding: 5px 10px; border-radius: 4px; font-size: 12px;">Eroare la scanare</div>';
      break;
  }
  
  overlay.style.backgroundColor = backgroundColor;
  overlay.innerHTML = content;
  
  element.setAttribute('data-deepfake-status', status);
  if (score !== null) {
    element.setAttribute('data-deepfake-score', score);
  }
  
  const parent = element.parentNode;
  parent.style.position = 'relative';
  parent.appendChild(overlay);
}

function removeOverlay(element) {
  const parent = element.parentNode;
  const existingOverlay = parent.querySelector('.deepfake-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }
}

async function scanImageElement(imgElement) {
  if (imgElement.complete && imgElement.naturalHeight > 0) {
    try {
      addOverlay(imgElement, 'pending');
      
      const imgUrl = imgElement.src;
      
      const result = await scanImageFromUrl(imgUrl);
      
      if (result && result.detectionResult) {
        const score = result.detectionResult.fakeScore;
        
        let status = 'authentic';
        if (score > 70) {
          status = 'fake';
          
          sendNotification(`⚠️ Deepfake detectat (${score}%)`, 
            `Un posibil deepfake a fost detectat pe această pagină.`);
        } else if (score > 40) {
          status = 'suspicious';
        }
        
        addOverlay(imgElement, status, score);
      } else {
        addOverlay(imgElement, 'error');
      }
    } catch (error) {
      console.error('Eroare la scanarea imaginii:', error);
      addOverlay(imgElement, 'error');
    }
  }
}

function captureVideoFrame(videoElement) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      const dataUrl = canvas.toDataURL('image/jpeg');
      resolve(dataUrl);
    } catch (error) {
      reject(error);
    }
  });
}

async function scanImageDataUrl(dataUrl, originalElement) {
  try {
    addOverlay(originalElement, 'pending');
    
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    
    const fileName = "capture_" + Date.now() + ".jpg";
    const file = new File([blob], fileName, { type: 'image/jpeg' });
    
    chrome.storage.local.get(["apiUrl"], async function(data) {
      const apiUrl = data.apiUrl || "http://localhost:5000/api/analysis/upload";
      
      const formData = new FormData();
      formData.append('video', file);
      
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          throw new Error(`Eroare server (${response.status})`);
        }
        
        const result = await response.json();
        
        if (result && result.detectionResult) {
          const score = result.detectionResult.fakeScore;
          
          let status = 'authentic';
          if (score > 70) {
            status = 'fake';
            sendNotification(`⚠️ Deepfake detectat (${score}%)`, 
              `Un posibil deepfake a fost detectat pe această pagină.`);
          } else if (score > 40) {
            status = 'suspicious';
          }
          
          addOverlay(originalElement, status, score);
          
          addToHistory({
            fileName: fileName,
            timestamp: new Date().toISOString(),
            fakeScore: score,
            source: window.location.hostname
          });
        } else {
          addOverlay(originalElement, 'error');
        }
      } catch (error) {
        console.error("Error scanning:", error);
        addOverlay(originalElement, 'error');
      }
    });
  } catch (error) {
    console.error("Error processing data URL:", error);
    addOverlay(originalElement, 'error');
  }
}

function setupObserver(config) {
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    
    mutations.forEach(mutation => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        shouldScan = true;
      }
    });
    
    if (shouldScan) {
      setTimeout(() => scanExistingContent(config), 500);
    }
  });
  
  observer.observe(document.body, { 
    childList: true, 
    subtree: true 
  });
}

function sendNotification(title, message) {
  chrome.runtime.sendMessage({
    action: "showNotification",
    title: title,
    message: message
  });
}

window.addEventListener('load', initSocialMediaScanner);