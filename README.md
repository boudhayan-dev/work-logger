# Work Logger Chrome Extension 🕐

A Chrome extension that automates daily work time logging to JIRA tickets with smart notifications and intuitive time allocation. Perfect for teams requiring accurate time tracking without the hassle.

![Demo](demo.gif)

## What It Does

The extension automatically finds your active JIRA tickets, lets you distribute your daily hours across them using sliders or direct input, and logs everything to JIRA with one click. Daily notifications ensure you never forget to log your work.

**Key Features:**
- 🔔 **Smart notifications** - Multiple alert methods to ensure you're reminded
- 🎯 **Auto-ticket detection** - Finds tickets you're working on automatically
- ⚡ **Quick time allocation** - Visual sliders and percentage-based distribution
- 🔒 **Secure & private** - Credentials stored locally using Chrome's secure storage
- ⚙️ **Highly configurable** - Customize to fit your workflow

## Installation

### Quick Setup (Developer Mode)

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd work-logger
   ```

2. **Load in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (toggle top right)
   - Click "Load unpacked"
   - Select the extension folder

3. **Configure JIRA:**
   - Click extension icon → "⚙️ Settings"
   - Add your JIRA URL, email, and [API token](https://id.atlassian.com/manage-profile/security/api-tokens)
   - Test connection and save

## Settings & Configuration

Access settings by clicking the extension icon → **⚙️ Settings**

### **JIRA Connection**
- **JIRA URL**: Your company's instance (e.g., `https://yourcompany.atlassian.net`)
- **Username**: Your email address
- **API Token**: [Generate here](https://id.atlassian.com/manage-profile/security/api-tokens) for secure authentication
  - **Required scopes**: `read:jira-work`, `write:jira-work` (for reading tickets and logging work)

### **Notification Preferences** 
- **Daily Reminder Time**: When to alert you (default: 5:00 PM)
- **Default Daily Hours**: Target hours per day (default: 6 hours)
- **Weekend Notifications**: Enable/disable weekend reminders
- **Auto-distribute Hours**: Choose how to initially split time across tickets:
  - *Don't distribute* - Start with all zeros
  - *Equally across all tickets* - Split evenly among all tickets
  - *Only across Active Work tickets* - Split only among "In Development" tickets

### **Advanced Options**
- **Custom JQL Query**: Override default ticket search logic
- **Worklog Comment**: Default comment for time entries
- **Ticket Status Configuration**: Customize which statuses count as "active work"

## Daily Workflow

1. **Get Reminded** - Extension alerts you at your set time
2. **Open Extension** - Click the notification or extension icon  
3. **Review Tickets** - See your active tickets with time estimates
4. **Allocate Time** - Use sliders or direct input to distribute hours
5. **Submit** - Click "Submit to JIRA" to log all work at once

**Example:**
```
Today's Work (6.5 hours):
SCRUM-123: Fix login bug      [████████░░] 4.0h (62%)
SCRUM-124: Dashboard design   [██████░░░░] 2.5h (38%)
                           ───────────────────
Total: 6.5h  Remaining: 0h ✅
```

## Notification System

The extension uses **multiple notification methods** to ensure you never miss your daily reminder:

### **🔴 Extension Badge (Most Reliable)**
- Red "LOG" badge appears on extension icon
- Always visible in browser toolbar
- Cannot be blocked by notification settings

### **🔔 Chrome Notifications (Fallback)**
- Traditional popup notifications with action buttons
- Interactive "Log Work Now" / "Remind Later" options
- Works if browser permissions allow

### **🌐 Browser Notifications (Additional Fallback)**
- HTML5 notifications (different permission system)
- Alternative path if Chrome notifications fail

### **⚡ Auto-Features**
- **Auto-popup attempt** - Tries to open extension when reminder fires
- **Persistent flags** - Remembers to remind you until work is logged
- **Auto-clearing** - All alerts disappear when you open extension or submit work

### **Testing Notifications**
Go to **Settings** → **Test Notification** to verify all alert methods work on your system.

## Troubleshooting

### Common Issues

**No active tickets found:**
- Verify JIRA credentials in settings
- Check you have tickets assigned to you in current sprint
- Try the "Refresh" button

**Notifications not showing:**
- Use "Test Notification" in settings
- Look for red "LOG" badge on extension icon (always works)
- Check Chrome notification permissions

**Submission failed:**
- Ensure you have worklog permissions on tickets
- Verify time allocation is greater than 0
- Check JIRA connection in settings

**For detailed debugging:** Open Chrome DevTools (F12) → Console tab for error logs.

---

**Note:** Requires JIRA Cloud with API token access. Works with all modern Chrome browsers. 