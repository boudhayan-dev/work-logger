// Options page logic for Work Logger settings
document.addEventListener('DOMContentLoaded', function() {
  loadSettings();
  
  // Event listeners
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('resetSettings').addEventListener('click', resetSettings);
  document.getElementById('testConnection').addEventListener('click', testConnection);
  document.getElementById('testNotification').addEventListener('click', testNotification);
});

async function loadSettings() {
  try {
    const settings = await new Promise((resolve) => {
      chrome.storage.local.get([
        'jiraUrl',
        'username', 
        'apiToken',
        'projectKey',
        'notificationTime',
        'defaultHours',
        'weekendsEnabled',
        'autoDistribution',
        'primaryStatuses',
        'otherStatuses',
        'customJql',
        'worklogComment'
      ], resolve);
    });

    // Populate form fields
    document.getElementById('jiraUrl').value = settings.jiraUrl || '';
    document.getElementById('username').value = settings.username || '';
    document.getElementById('apiToken').value = settings.apiToken || '';
    document.getElementById('projectKey').value = settings.projectKey || '';
    document.getElementById('notificationTime').value = settings.notificationTime || '17:00';
    document.getElementById('defaultHours').value = settings.defaultHours || 6;
    document.getElementById('weekendsEnabled').checked = settings.weekendsEnabled || false;
    document.getElementById('autoDistribution').value = settings.autoDistribution || 'none';
    document.getElementById('primaryStatuses').value = settings.primaryStatuses || '';
    document.getElementById('otherStatuses').value = settings.otherStatuses || '';
    document.getElementById('customJql').value = settings.customJql || '';
    document.getElementById('worklogComment').value = settings.worklogComment || 'Daily work log';
    
  } catch (error) {
    showStatus('Error loading settings: ' + error.message, 'error');
  }
}

async function saveSettings() {
  try {
    const settings = {
      jiraUrl: document.getElementById('jiraUrl').value.trim(),
      username: document.getElementById('username').value.trim(),
      apiToken: document.getElementById('apiToken').value.trim(),
      projectKey: document.getElementById('projectKey').value.trim(),
      notificationTime: document.getElementById('notificationTime').value,
      defaultHours: parseFloat(document.getElementById('defaultHours').value),
      weekendsEnabled: document.getElementById('weekendsEnabled').checked,
      autoDistribution: document.getElementById('autoDistribution').value,
      primaryStatuses: document.getElementById('primaryStatuses').value.trim(),
      otherStatuses: document.getElementById('otherStatuses').value.trim(),
      customJql: document.getElementById('customJql').value.trim(),
      worklogComment: document.getElementById('worklogComment').value.trim()
    };

    // Validation
    if (!settings.jiraUrl || !settings.username || !settings.apiToken || !settings.projectKey) {
      showStatus('Please fill in all required JIRA configuration fields.', 'error');
      return;
    }

    // Ensure JIRA URL is properly formatted
    if (!settings.jiraUrl.startsWith('http')) {
      settings.jiraUrl = 'https://' + settings.jiraUrl;
    }
    
    // Remove trailing slash
    settings.jiraUrl = settings.jiraUrl.replace(/\/$/, '');

    // Save to Chrome storage
    await new Promise((resolve, reject) => {
      chrome.storage.local.set(settings, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    // Update notification schedule
    chrome.runtime.sendMessage({ action: 'updateNotificationSchedule' });

    showStatus('Settings saved successfully! 🎉', 'success');
    
  } catch (error) {
    showStatus('Error saving settings: ' + error.message, 'error');
  }
}

async function testConnection() {
  const testBtn = document.getElementById('testConnection');
  const statusDiv = document.getElementById('connectionStatus');
  
  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';
  statusDiv.textContent = '';
  statusDiv.className = 'status-message';

  try {
    const jiraUrl = document.getElementById('jiraUrl').value.trim();
    const username = document.getElementById('username').value.trim();
    const apiToken = document.getElementById('apiToken').value.trim();

    if (!jiraUrl || !username || !apiToken) {
      throw new Error('Please fill in all JIRA configuration fields');
    }

    // Format URL
    const formattedUrl = jiraUrl.startsWith('http') ? jiraUrl : 'https://' + jiraUrl;
    const cleanUrl = formattedUrl.replace(/\/$/, '');

    // Test API connection
    const response = await fetch(`${cleanUrl}/rest/api/2/myself`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(`${username}:${apiToken}`)}`,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid credentials. Please check your username and API token.');
      } else if (response.status === 404) {
        throw new Error('JIRA URL not found. Please check your JIRA URL.');
      } else {
        throw new Error(`Connection failed with status ${response.status}`);
      }
    }

    const userData = await response.json();
    
    statusDiv.innerHTML = `
      <div class="success">
        ✅ Connection successful!<br>
        <small>Logged in as: ${userData.displayName} (${userData.emailAddress})</small>
      </div>
    `;

  } catch (error) {
    statusDiv.innerHTML = `
      <div class="error">
        ❌ Connection failed<br>
        <small>${error.message}</small>
      </div>
    `;
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  }
}

async function resetSettings() {
  if (!confirm('Are you sure you want to reset all settings to defaults? This will clear your JIRA credentials.')) {
    return;
  }

  try {
    // Clear all stored settings
    await new Promise((resolve, reject) => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    // Reload the form with default values
    loadSettings();
    
    showStatus('Settings reset to defaults. Please reconfigure your JIRA connection.', 'warning');
    
  } catch (error) {
    showStatus('Error resetting settings: ' + error.message, 'error');
  }
}

function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('saveStatus');
  statusDiv.textContent = message;
  statusDiv.className = `status-message ${type}`;
  
  // Auto-hide success messages after 3 seconds
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'status-message';
    }, 3000);
  }
}

async function testNotification() {
  try {
    // Send message to background script to trigger notification
    const response = await chrome.runtime.sendMessage({
      action: 'testNotification'
    });

    if (response && response.success) {
      document.getElementById('connectionStatus').innerHTML = `
        <div class="success">
          🔔 Test notification sent! Check your notifications area.
        </div>
      `;
    } else {
      document.getElementById('connectionStatus').innerHTML = `
        <div class="error">
          ❌ Failed to send test notification.
        </div>
      `;
    }
  } catch (error) {
    document.getElementById('connectionStatus').innerHTML = `
      <div class="error">
        ❌ Error testing notification: ${error.message}
      </div>
    `;
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'settingsUpdated') {
    showStatus('Notification schedule updated', 'success');
  }
}); 