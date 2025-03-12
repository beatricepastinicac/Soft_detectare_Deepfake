chrome.runtime.onInstalled.addListener(() => {
  console.log('Extensia BeeDetection a fost instalată');
  
  chrome.storage.local.set({
    apiUrl: 'http://localhost:5000/api/analysis/upload',
    enableAutoScan: false,
    notificationsEnabled: true,
    scanHistory: []
  });
  
  chrome.contextMenus.create({
    id: "scanImage",
    title: "Scanează pentru deepfake",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "scanImage" && info.srcUrl) {
    chrome.tabs.sendMessage(tab.id, {
      action: "scanImage",
      imageUrl: info.srcUrl
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showNotification") {
    chrome.storage.local.get(['notificationsEnabled'], (data) => {
      if (data.notificationsEnabled !== false) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'images/icon128.png',
          title: message.title,
          message: message.message,
          priority: 2
        });
      }
    });
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('report.html')
  });
});
