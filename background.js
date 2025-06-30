// Background service worker for Work Logger
chrome.runtime.onInstalled.addListener(() => {
  console.log('Work Logger installed');
  setupDailyAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  setupDailyAlarm();
});

function setupDailyAlarm() {
  // Clear existing alarm
  chrome.alarms.clear('dailyWorkLog');
  
  // Get user's preferred notification time (default 5 PM)
  chrome.storage.local.get(['notificationTime'], (result) => {
    const notificationTime = result.notificationTime || '17:00';
    const [hours, minutes] = notificationTime.split(':').map(Number);
    
    // Calculate when to set the alarm for today
    const now = new Date();
    const alarmTime = new Date();
    alarmTime.setHours(hours, minutes, 0, 0);
    
    // If the time has passed today, set for tomorrow
    if (alarmTime <= now) {
      alarmTime.setDate(alarmTime.getDate() + 1);
    }
    
    // Skip weekends (Saturday = 6, Sunday = 0)
    while (alarmTime.getDay() === 0 || alarmTime.getDay() === 6) {
      alarmTime.setDate(alarmTime.getDate() + 1);
    }
    
    chrome.alarms.create('dailyWorkLog', {
      when: alarmTime.getTime(),
      periodInMinutes: 24 * 60 // Repeat daily
    });
    
    console.log(`Next work log reminder set for: ${alarmTime.toLocaleString()}`);
  });
}

// Handle daily alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyWorkLog') {
    // Skip weekends
    const today = new Date().getDay();
    if (today === 0 || today === 6) {
      return;
    }
    
    showDailyNotification();
  }
});

async function showDailyNotification() {
  try {
    console.log('Attempting to show notification and visual alerts...');
    
    // Method 1: Extension Badge (Most Reliable)
    chrome.action.setBadgeText({ text: 'LOG' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF3B30' }); // Red color
    console.log('Set extension badge to LOG');
    
    // Method 2: Change Extension Icon Color (if we had different colored icons)
    // For now, we'll keep the same icon but could add alert icon later
    
    // Method 3: Try Chrome Notification (might work, might not)
    const notificationId = 'dailyWorkLog_' + Date.now();
    
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: 'icons/worklog-icon.png',
      title: '🕐 Work Logger Reminder',
      message: 'Time to log your daily work hours! Click to open.',
      buttons: [
        { title: '📝 Log Work Now' },
        { title: '⏰ Remind Later' }
      ],
      requireInteraction: true,
      priority: 2
    }, (notificationId) => {
      if (chrome.runtime.lastError) {
        console.error('Chrome notification failed:', chrome.runtime.lastError);
      } else {
        console.log('Chrome notification created:', notificationId);
      }
    });
    
    // Method 4: Auto-open Extension Popup (Most Attention-Grabbing)
    // Note: This only works if user clicks somewhere first (user activation required)
    try {
      // Try to open the popup - this might not work due to user activation requirements
      chrome.action.openPopup().catch((error) => {
        console.log('Auto-popup failed (expected):', error.message);
      });
    } catch (error) {
      console.log('Auto-popup not available:', error.message);
    }
    
    // Method 5: Fallback Browser Notification
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('🕐 Work Logger Reminder', {
          body: 'Time to log your daily work hours!',
          icon: 'icons/worklog-icon.png',
          requireInteraction: true
        });
        console.log('Browser notification created');
      }
    } catch (error) {
      console.log('Browser notification failed:', error);
    }
    
    // Method 6: Set a flag so popup shows special reminder when opened
    chrome.storage.local.set({ 
      reminderActive: true, 
      reminderTime: new Date().toISOString() 
    });
    console.log('Set reminder flag for popup');
    
  } catch (error) {
    console.error('Error in showDailyNotification:', error);
  }
}

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('dailyWorkLog')) {
    clearReminderAlerts();
    chrome.action.openPopup();
    chrome.notifications.clear(notificationId);
  }
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId.startsWith('dailyWorkLog')) {
    if (buttonIndex === 0) { // Log Work Now
      clearReminderAlerts();
      chrome.action.openPopup();
    } else { // Remind Later
      // Set reminder for 30 minutes later
      chrome.alarms.create('remindLater', {
        delayInMinutes: 30
      });
    }
    chrome.notifications.clear(notificationId);
  }
});

// Function to clear all reminder alerts
function clearReminderAlerts() {
  chrome.action.setBadgeText({ text: '' }); // Clear badge
  chrome.storage.local.set({ reminderActive: false });
  console.log('Cleared reminder alerts');
}

// Handle "remind later" alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'remindLater') {
    showDailyNotification();
  }
});

// Handle messages from options page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateNotificationSchedule') {
    setupDailyAlarm();
    sendResponse({ success: true });
  } else if (message.action === 'testNotification') {
    // Trigger immediate test notification and alerts
    showDailyNotification();
    sendResponse({ success: true });
  } else if (message.action === 'clearReminders') {
    // Clear all reminder alerts (called when user opens popup or submits work log)
    clearReminderAlerts();
    sendResponse({ success: true });
  }
}); 