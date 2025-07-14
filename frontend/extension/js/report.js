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
    
    // Animate elements on load
    animateElements();
    
    loadSettings();
    loadHistory();
    
    if (dateFilter) dateFilter.addEventListener('change', applyFilters);
    if (sourceFilter) sourceFilter.addEventListener('change', applyFilters);
    if (riskFilter) riskFilter.addEventListener('change', applyFilters);
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);

    function animateElements() {
        const elements = document.querySelectorAll('.stat-card, .report-section, .settings-section');
        elements.forEach((element, index) => {
            element.style.opacity = '0';
            element.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                element.style.transition = 'all 0.6s ease-out';
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
            }, index * 100);
        });
    }
    
    function loadSettings() {
      chrome.storage.local.get(['apiUrl', 'enableAutoScan', 'notificationsEnabled'], function(data) {
        console.log('Settings loaded:', data);
        if (apiUrlSetting) apiUrlSetting.value = data.apiUrl || 'http://localhost:5000/api/analysis/upload';
        if (autoScanSetting) autoScanSetting.checked = data.enableAutoScan || false;
        if (notificationsSetting) notificationsSetting.checked = data.notificationsEnabled !== false;
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
      // Animate counter updates
      animateValue(totalScans, 0, history.length, 1000);
      
      const fakes = history.filter(item => item.fakeScore > 70).length;
      animateValue(detectedFakes, 0, fakes, 1200);
      
      const authentic = history.filter(item => item.fakeScore <= 40).length;
      animateValue(authenticContent, 0, authentic, 1400);
    }

    function animateValue(element, start, end, duration) {
      const range = end - start;
      const increment = end > start ? 1 : -1;
      const stepTime = Math.abs(Math.floor(duration / range));
      
      let current = start;
      const timer = setInterval(() => {
        current += increment;
        element.textContent = current;
        
        if (current === end) {
          clearInterval(timer);
        }
      }, stepTime);
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
      if (!historyTableBody) return;
      
      historyTableBody.innerHTML = '';
      
      // Add loading state
      historyTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: #64748b;">Se încarcă istoricul...</td></tr>';
      
      setTimeout(() => {
        historyTableBody.innerHTML = '';
        
        if (history.length === 0) {
          historyTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: #64748b;">Nu există scanări în istoric</td></tr>';
          return;
        }
        
        history.forEach((item, index) => {
          const row = document.createElement('tr');
          const riskLevel = item.fakeScore > 70 ? 'Risc ridicat' : 
                           item.fakeScore > 40 ? 'Risc mediu' : 'Risc scăzut';
          const riskClass = item.fakeScore > 70 ? 'risk-high' : 
                           item.fakeScore > 40 ? 'risk-medium' : 'risk-low';
          
          row.innerHTML = `
            <td>${new Date(item.timestamp).toLocaleString('ro-RO')}</td>
            <td title="${item.fileName}" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.fileName}</td>
            <td>${item.source || 'N/A'}</td>
            <td><strong>${item.fakeScore}%</strong></td>
            <td><span class="${riskClass}">${riskLevel}</span></td>
          `;
          
          // Animate row appearance
          row.style.opacity = '0';
          row.style.transform = 'translateX(-20px)';
          historyTableBody.appendChild(row);
          
          setTimeout(() => {
            row.style.transition = 'all 0.3s ease-out';
            row.style.opacity = '1';
            row.style.transform = 'translateX(0)';
          }, index * 50);
        });
      }, 500);
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

    function saveSettings() {
      const settings = {
        autoScan: autoScanSetting ? autoScanSetting.checked : false,
        notifications: notificationsSetting ? notificationsSetting.checked : false,
        apiUrl: apiUrlSetting ? apiUrlSetting.value : ''
      };
      
      chrome.storage.sync.set(settings, function() {
        // Show success animation
        const button = saveSettingsBtn;
        const originalText = button.textContent;
        
        button.style.background = 'linear-gradient(135deg, #38a169 0%, #2f855a 100%)';
        button.textContent = '✓ Salvat cu succes!';
        button.style.transform = 'scale(1.05)';
        
        setTimeout(() => {
          button.style.background = '';
          button.textContent = originalText;
          button.style.transform = 'scale(1)';
        }, 2000);
        
        console.log('Setările au fost salvate');
      });
    }
});