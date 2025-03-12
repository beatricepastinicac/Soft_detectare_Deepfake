document.addEventListener('DOMContentLoaded', function() {
    const totalScans = document.getElementById('total-scans');
    const detectedFakes = document.getElementById('detected-fakes');
    const authenticContent = document.getElementById('authentic-content');
    const historyTableBody = document.getElementById('history-table-body');
    const dateFilter = document.getElementById('date-filter');
    const sourceFilter = document.getElementById('source-filter');
    const riskFilter = document.getElementById('risk-filter');
    const autoScanSetting = document.getElementById('auto-scan-setting');
    const notificationsSetting = document.getElementById('notifications-setting');
    const apiUrlSetting = document.getElementById('api-url-setting');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    
    loadSettings();
    loadHistory();
    
    dateFilter.addEventListener('change', applyFilters);
    sourceFilter.addEventListener('change', applyFilters);
    riskFilter.addEventListener('change', applyFilters);
    saveSettingsBtn.addEventListener('click', saveSettings);
    
    function loadSettings() {
      chrome.storage.local.get(['apiUrl', 'enableAutoScan', 'notificationsEnabled'], function(data) {
        console.log('Settings loaded:', data);
        apiUrlSetting.value = data.apiUrl || 'http://localhost:5000/api/analysis/upload';
        autoScanSetting.checked = data.enableAutoScan || false;
        notificationsSetting.checked = data.notificationsEnabled !== false;
      });
    }
    
    function saveSettings() {
      const settings = {
        apiUrl: apiUrlSetting.value.trim(),
        enableAutoScan: autoScanSetting.checked,
        notificationsEnabled: notificationsSetting.checked
      };
      
      chrome.storage.local.set(settings, function() {
        console.log('Settings saved:', settings);
        const notification = document.createElement('div');
        notification.className = 'notification success';
        notification.textContent = 'Setările au fost salvate cu succes!';
        document.body.appendChild(notification);
        
        setTimeout(() => {
          notification.remove();
        }, 3000);
      });
    }
    
    function loadHistory() {
      chrome.storage.local.get(['scanHistory'], function(data) {
        console.log('History loaded:', data);
        const history = data.scanHistory || [];
        
        updateStats(history);
        
        populateSourceFilter(history);
        
        displayHistory(history);
      });
    }
    
    function updateStats(history) {
      totalScans.textContent = history.length;
      
      const fakes = history.filter(item => item.fakeScore > 70).length;
      detectedFakes.textContent = fakes;
      
      const authentic = history.filter(item => item.fakeScore <= 40).length;
      authenticContent.textContent = authentic;
    }
    
    function populateSourceFilter(history) {
      const sources = [...new Set(history.map(item => item.source))];
      sourceFilter.innerHTML = '<option value="">Toate sursele</option>';
      sources.forEach(source => {
        const option = document.createElement('option');
        option.value = source;
        option.textContent = source;
        sourceFilter.appendChild(option);
      });
    }
    
    function displayHistory(history) {
      historyTableBody.innerHTML = '';
      history.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${new Date(item.timestamp).toLocaleString()}</td>
          <td>${item.fileName}</td>
          <td>${item.source}</td>
          <td>${item.fakeScore}%</td>
        `;
        historyTableBody.appendChild(row);
      });
    }
    
    function applyFilters() {
      const dateValue = dateFilter.value;
      const sourceValue = sourceFilter.value;
      const riskValue = riskFilter.value;
      
      chrome.storage.local.get(['scanHistory'], function(data) {
        let history = data.scanHistory || [];
        
        if (dateValue) {
          const selectedDate = new Date(dateValue);
          history = history.filter(item => {
            const itemDate = new Date(item.timestamp);
            return itemDate.toDateString() === selectedDate.toDateString();
          });
        }
        
        if (sourceValue) {
          history = history.filter(item => item.source === sourceValue);
        }
        
        if (riskValue) {
          if (riskValue === 'high') {
            history = history.filter(item => item.fakeScore > 70);
          } else if (riskValue === 'medium') {
            history = history.filter(item => item.fakeScore > 40 && item.fakeScore <= 70);
          } else if (riskValue === 'low') {
            history = history.filter(item => item.fakeScore <= 40);
          }
        }
        
        displayHistory(history);
      });
    }
});