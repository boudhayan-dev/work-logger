// Popup logic for Work Logger
let tickets = [];
let totalHours = 6;
let initialDistribution = []; // Store initial hours distribution for reset

document.addEventListener('DOMContentLoaded', function() {
  initializePopup();
  
  // Clear reminder alerts when popup opens
  clearReminderAlerts();
  
  // Event listeners
  document.getElementById('openSettings').addEventListener('click', openSettings);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('refreshBtn').addEventListener('click', refreshTickets);
  document.getElementById('totalHours').addEventListener('input', updateTotalHours);
  document.getElementById('resetBtn').addEventListener('click', resetDistribution);
  document.getElementById('submitBtn').addEventListener('click', submitWorkLogs);
  document.getElementById('closeBtn').addEventListener('click', () => window.close());
  document.getElementById('retryBtn').addEventListener('click', refreshTickets);
});

async function initializePopup() {
  // Set current date
  document.getElementById('currentDate').textContent = 
    new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

  // Check if credentials are configured
  const credentials = await getCredentials();
  if (!credentials.jiraUrl || !credentials.apiToken) {
    showSection('setupNeeded');
    return;
  }

  // Fetch tickets
  await refreshTickets();
}

async function getCredentials() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['jiraUrl', 'username', 'apiToken', 'projectKey'], resolve);
  });
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

async function refreshTickets() {
  showSection('loadingSection');
  
  try {
    const credentials = await getCredentials();
    tickets = await fetchJiraTickets(credentials);
    
    if (tickets.length === 0) {
      showError('No active tickets found for today.');
      return;
    }
    
    await renderTickets();
    await autoDistributeHours();
    showSection('ticketsSection');
    
  } catch (error) {
    showError(`Failed to fetch tickets: ${error.message}`);
  }
}

async function fetchJiraTickets(credentials) {
  const { jiraUrl, username, apiToken, projectKey } = credentials;
  
  if (!jiraUrl || !username || !apiToken || !projectKey) {
    throw new Error('Missing JIRA configuration. Please check settings.');
  }

  // Get stored settings for smart filtering
  const settings = await new Promise((resolve) => {
    chrome.storage.local.get(['primaryStatuses', 'otherStatuses', 'customJql'], resolve);
  });

  let jql = settings.customJql?.trim();
  
  if (!jql) {
    // Build smart JQL based on status configuration
    const primaryStatuses = (settings.primaryStatuses || '').split(',').map(s => s.trim()).filter(s => s);
    
    const today = new Date().toISOString().split('T')[0];
    
    // Simple filtering: Current sprint + Primary statuses always + Any status if updated today
    jql = `assignee = currentUser() AND project = "${projectKey}" AND Sprint in openSprints() AND (
      status IN (${primaryStatuses.map(s => `"${s}"`).join(',')}) OR
      updated >= "${today}"
    ) ORDER BY updated DESC`;
    
    console.log('Generated JQL:', jql);
  }

  // Try with GET method first (some JIRA instances prefer this)
  const searchParams = new URLSearchParams({
    jql: jql,
    maxResults: '20',
    fields: 'key,summary,status,assignee,updated,timeoriginalestimate,timespent,timeestimate'
  });
  
  let response = await fetch(`${jiraUrl}/rest/api/2/search?${searchParams}`, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${btoa(`${username}:${apiToken}`)}`,
      'Accept': 'application/json',
    }
  });
  
  // If GET fails, try POST
  if (!response.ok && response.status === 405) {
    console.log('GET method not allowed, trying POST...');
    response = await fetch(`${jiraUrl}/rest/api/2/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${username}:${apiToken}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jql: jql,
        maxResults: 20,
        fields: ['key', 'summary', 'status', 'assignee', 'updated', 'timeoriginalestimate', 'timespent', 'timeestimate']
      })
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('JIRA API Error Response:', errorText);
    console.error('Failed JQL Query:', jql);
    
    // Try a simpler fallback query
         if (response.status === 400) {
       console.log('Main query failed, trying simpler fallback query...');
       console.log('Failed query was:', jql);
       
       // Fallback: Simple query without complex status filtering
       const fallbackJql = `assignee = currentUser() AND project = "${projectKey}" AND Sprint in openSprints() ORDER BY updated DESC`;
      const fallbackResponse = await fetch(`${jiraUrl}/rest/api/2/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${username}:${apiToken}`)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jql: fallbackJql,
          maxResults: 20,
          fields: ['key', 'summary', 'status', 'assignee', 'updated', 'timeoriginalestimate', 'timespent', 'timeestimate']
        })
      });
      
      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        console.log('Using fallback query results:', fallbackData.issues.length, 'tickets found');
        
        return fallbackData.issues.map(issue => {
          const originalEstimate = issue.fields.timeoriginalestimate ? issue.fields.timeoriginalestimate / 3600 : 0;
          const timeSpent = issue.fields.timespent ? issue.fields.timespent / 3600 : 0;
          const remainingEstimate = issue.fields.timeestimate ? issue.fields.timeestimate / 3600 : 0;
          
          return {
            key: issue.key,
            summary: issue.fields.summary,
            status: issue.fields.status.name,
            updated: issue.fields.updated,
            originalEstimate: originalEstimate, // Convert seconds to hours
            timeSpent: timeSpent, // Convert seconds to hours
            remainingEstimate: remainingEstimate, // Convert seconds to hours
            hours: 0,
            percentage: 0,
            rawIssue: issue,
            fromFallback: true  // Mark tickets from fallback query
          };
        });
      }
    }
    
    throw new Error(`JIRA API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  console.log('Using main query results:', data.issues.length, 'tickets found');
  
  return data.issues.map(issue => {
    const originalEstimate = issue.fields.timeoriginalestimate ? issue.fields.timeoriginalestimate / 3600 : 0;
    const timeSpent = issue.fields.timespent ? issue.fields.timespent / 3600 : 0;
    const remainingEstimate = issue.fields.timeestimate ? issue.fields.timeestimate / 3600 : 0;
    
    return {
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      updated: issue.fields.updated,
      originalEstimate: originalEstimate, // Convert seconds to hours
      timeSpent: timeSpent, // Convert seconds to hours
      remainingEstimate: remainingEstimate, // Convert seconds to hours
      hours: 0,
      percentage: 0,
      rawIssue: issue,  // Keep original for status checking
      fromFallback: false  // Mark tickets from main query
    };
  });
}

function getStatusReason(ticket, settings) {
  const primaryStatuses = (settings.primaryStatuses || '').split(',').map(s => s.trim()).filter(s => s);
  const today = new Date().toISOString().split('T')[0];
  const ticketDate = ticket.updated ? ticket.updated.split('T')[0] : '';
  
  if (primaryStatuses.length > 0 && primaryStatuses.some(status => status.toLowerCase() === ticket.status.toLowerCase())) {
    return '🔨 Active Work';
  } else if (ticketDate === today) {
    return '📅 Active Today';
  } else if (ticket.fromFallback) {
    // This ticket came from the fallback query due to main query failure
    console.warn(`Ticket ${ticket.key} from fallback query - main query failed. Status: "${ticket.status}", Updated: ${ticket.updated}`);
    return '🔄 Fallback Query';
  } else {
    // If it shows up but doesn't match either condition, it's a query logic issue
    console.warn(`Ticket ${ticket.key} with status "${ticket.status}" showing without today's activity. Updated: ${ticket.updated}`);
    return '⚠️ Check Logic';
  }
}

async function renderTickets() {
  const ticketsList = document.getElementById('ticketsList');
  ticketsList.innerHTML = '';

  // Get settings for status checking and JIRA URL for clickable links
  const settings = await new Promise((resolve) => {
    chrome.storage.local.get(['primaryStatuses', 'otherStatuses'], resolve);
  });
  
  const credentials = await getCredentials();
  const jiraUrl = credentials.jiraUrl;

  tickets.forEach((ticket, index) => {
    const statusReason = getStatusReason(ticket, settings);
    
    // Calculate time tracking info
    const originalHours = ticket.originalEstimate || 0;
    const spentHours = ticket.timeSpent || 0;
    const remainingHours = ticket.remainingEstimate || (originalHours - spentHours);
    
    // Format time display
    const formatHours = (hours) => hours > 0 ? `${hours.toFixed(1)}h` : 'None';
    
    const ticketDiv = document.createElement('div');
    ticketDiv.className = 'ticket-item';
    ticketDiv.innerHTML = `
      <div class="ticket-header">
        <a href="#" data-ticket-url="${jiraUrl}/browse/${ticket.key}" class="ticket-key">${ticket.key}</a>
        <span class="ticket-status">${ticket.status}</span>
        <span class="ticket-reason">${statusReason}</span>
      </div>
      <div class="ticket-summary">${ticket.summary}</div>
      <div class="time-tracking-info">
        <div class="time-estimates">
          <span class="estimate-item">📊 Original: ${formatHours(originalHours)}</span>
          <span class="estimate-item">⏱️ Logged: ${formatHours(spentHours)}</span>
          <span class="estimate-item">⏳ Remaining: ${formatHours(remainingHours)}</span>
        </div>
        <div class="capacity-warning" id="warning-${index}" style="display: none;">
          ⚠️ This will exceed the original estimate!
        </div>
      </div>
      <div class="time-input">
        <label>Hours:</label>
        <input type="number" 
               class="hours-input" 
               data-index="${index}"
               value="${ticket.hours}" 
               min="0" 
               max="12" 
               step="0.25">
        <span class="percentage">0%</span>
      </div>
      <div class="time-slider">
        <input type="range" 
               class="percentage-slider"
               data-index="${index}"
               value="${ticket.percentage}" 
               min="0" 
               max="100" 
               step="5">
      </div>
    `;
    
    ticketsList.appendChild(ticketDiv);
  });

  // Add event listeners for time inputs and sliders
  document.querySelectorAll('.hours-input').forEach(input => {
    input.addEventListener('input', handleHoursChange);
  });
  
  document.querySelectorAll('.percentage-slider').forEach(slider => {
    slider.addEventListener('input', handlePercentageChange);
  });

  // Add event listeners for ticket key links
  addTicketLinkListeners();

  await updateBreakdown();
}

async function handleHoursChange(event) {
  const index = parseInt(event.target.dataset.index);
  const hours = parseFloat(event.target.value) || 0;
  
  tickets[index].hours = hours;
  tickets[index].percentage = totalHours > 0 ? (hours / totalHours) * 100 : 0;
  
  // Update corresponding slider
  const slider = document.querySelector(`.percentage-slider[data-index="${index}"]`);
  slider.value = tickets[index].percentage;
  
  // Check for capacity warning
  checkCapacityWarning(index, hours);
  
  await updateBreakdown();
}

async function handlePercentageChange(event) {
  const index = parseInt(event.target.dataset.index);
  const percentage = parseFloat(event.target.value);
  
  tickets[index].percentage = percentage;
  tickets[index].hours = (percentage / 100) * totalHours;
  
  // Update corresponding hours input
  const hoursInput = document.querySelector(`.hours-input[data-index="${index}"]`);
  hoursInput.value = tickets[index].hours.toFixed(2);
  
  // Check for capacity warning
  checkCapacityWarning(index, tickets[index].hours);
  
  await updateBreakdown();
}

function checkCapacityWarning(index, newHours) {
  const ticket = tickets[index];
  const warningElement = document.getElementById(`warning-${index}`);
  
  if (!warningElement) {
    return;
  }
  
  const originalEstimate = ticket.originalEstimate || 0;
  const currentlyLogged = ticket.timeSpent || 0;
  const totalAfterNewEntry = currentlyLogged + newHours;
  
  if (originalEstimate > 0 && totalAfterNewEntry > originalEstimate) {
    const overage = totalAfterNewEntry - originalEstimate;
    warningElement.innerHTML = `⚠️ Will exceed estimate by ${overage.toFixed(1)}h (${currentlyLogged.toFixed(1)}h logged + ${newHours.toFixed(1)}h new = ${totalAfterNewEntry.toFixed(1)}h vs ${originalEstimate.toFixed(1)}h estimated)`;
    warningElement.style.display = 'block';
  } else {
    warningElement.style.display = 'none';
  }
}

async function updateTotalHours() {
  const newTotalHours = parseFloat(document.getElementById('totalHours').value) || 0;
  
  // If total hours changed significantly, keep proportions
  if (Math.abs(newTotalHours - totalHours) > 0.01) {
    totalHours = newTotalHours;
    
    // Recalculate hours based on current percentages
    tickets.forEach((ticket, index) => {
      ticket.hours = (ticket.percentage / 100) * totalHours;
      const hoursInput = document.querySelector(`.hours-input[data-index="${index}"]`);
      if (hoursInput) {
        hoursInput.value = ticket.hours.toFixed(2);
      }
      
      // Check for capacity warnings after recalculation
      checkCapacityWarning(index, ticket.hours);
    });
    
    // Update initial distribution to maintain reset functionality
    initialDistribution = tickets.map(ticket => ticket.hours);
  }
  
  await updateBreakdown();
}

async function updateBreakdown() {
  const breakdown = document.getElementById('hoursBreakdown');
  const remainingSpan = document.getElementById('remainingHours');
  
  // Get JIRA URL for clickable links in breakdown
  const credentials = await getCredentials();
  const jiraUrl = credentials.jiraUrl;
  
  let totalAllocated = 0;
  let breakdownHTML = '';
  let totalEstimated = 0;
  let totalLogged = 0;
  let warningCount = 0;
  
  tickets.forEach(ticket => {
    // Accumulate totals for summary
    totalEstimated += ticket.originalEstimate || 0;
    totalLogged += ticket.timeSpent || 0;
    
    if (ticket.hours > 0) {
      totalAllocated += ticket.hours;
      
      // Check if this entry will cause overage
      const willExceed = (ticket.originalEstimate > 0) && 
                        ((ticket.timeSpent + ticket.hours) > ticket.originalEstimate);
      if (willExceed) warningCount++;
      
      const warningIcon = willExceed ? ' ⚠️' : '';
      
      breakdownHTML += `
        <div class="breakdown-item${willExceed ? ' warning' : ''}">
          <a href="#" data-ticket-url="${jiraUrl}/browse/${ticket.key}" class="ticket-key">${ticket.key}${warningIcon}</a>
          <span class="hours">${ticket.hours.toFixed(2)}h (${ticket.percentage.toFixed(0)}%)</span>
        </div>
      `;
    }
    
    // Update percentage display in ticket item
    const percentageSpan = document.querySelector(`.ticket-item:nth-child(${tickets.indexOf(ticket) + 1}) .percentage`);
    if (percentageSpan) {
      percentageSpan.textContent = `${ticket.percentage.toFixed(0)}%`;
    }
  });
  
  // Add summary info at the top
  if (totalEstimated > 0 || totalLogged > 0) {
    breakdownHTML = `
      <div class="summary-info">
        <small>📊 Total estimated: ${totalEstimated.toFixed(1)}h | ⏱️ Already logged: ${totalLogged.toFixed(1)}h</small>
        ${warningCount > 0 ? `<small class="warning-summary">⚠️ ${warningCount} ticket(s) will exceed estimates</small>` : ''}
      </div>
    ` + breakdownHTML;
  }
  
  breakdown.innerHTML = breakdownHTML;
  
  const remaining = totalHours - totalAllocated;
  remainingSpan.textContent = remaining.toFixed(1);
  remainingSpan.className = remaining < 0 ? 'negative' : remaining > 0 ? 'positive' : '';
  
  // Enable/disable submit button
  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = totalAllocated === 0;
  
  // Re-add event listeners for any new ticket links in breakdown
  addTicketLinkListeners();
}

function addTicketLinkListeners() {
  // Remove existing listeners to avoid duplicates
  document.querySelectorAll('.ticket-key[data-ticket-url]').forEach(link => {
    link.removeEventListener('click', handleTicketLinkClick);
  });
  
  // Add click listeners to all ticket key links
  document.querySelectorAll('.ticket-key[data-ticket-url]').forEach(link => {
    link.addEventListener('click', handleTicketLinkClick);
  });
}

function handleTicketLinkClick(event) {
  event.preventDefault();
  const ticketUrl = event.target.getAttribute('data-ticket-url');
  
  if (ticketUrl) {
    // Open ticket in new tab while keeping popup open
    chrome.tabs.create({ url: ticketUrl });
  }
}

async function autoDistributeHours() {
  const settings = await new Promise((resolve) => {
    chrome.storage.local.get(['defaultHours', 'autoDistribution', 'primaryStatuses'], resolve);
  });
  
  const totalHours = settings.defaultHours || 6;
  const distributionMode = settings.autoDistribution || 'none';
  
  // Reset all hours first
  tickets.forEach(ticket => {
    ticket.hours = 0;
    ticket.percentage = 0;
  });
  
  if (distributionMode === 'none') {
    updateInputsFromTickets();
    updateTotalHours();
    updateBreakdown();
    return;
  }
  
  let eligibleTickets = [];
  
  if (distributionMode === 'all') {
    eligibleTickets = tickets;
  } else if (distributionMode === 'activeWork') {
    // Include both primary status tickets AND tickets updated today
    const primaryStatuses = (settings.primaryStatuses || '').split(',').map(s => s.trim()).filter(s => s);
    const today = new Date().toISOString().split('T')[0];
    
    eligibleTickets = tickets.filter(ticket => {
      const ticketDate = ticket.updated ? ticket.updated.split('T')[0] : '';
      const isPrimaryStatus = primaryStatuses.some(status => status.toLowerCase() === ticket.status.toLowerCase());
      const isActiveToday = ticketDate === today;
      
      return isPrimaryStatus || isActiveToday;
    });
  }
  
  if (eligibleTickets.length > 0) {
    const hoursPerTicket = totalHours / eligibleTickets.length;
    eligibleTickets.forEach(ticket => {
      ticket.hours = hoursPerTicket;
      ticket.percentage = (hoursPerTicket / totalHours) * 100;
    });
  }
  
  updateInputsFromTickets();
  updateTotalHours();
  updateBreakdown();
}

async function resetDistribution() {
  // Reset all tickets to their initial distribution
  tickets.forEach((ticket, index) => {
    ticket.hours = initialDistribution[index] || 0;
    ticket.percentage = totalHours > 0 ? (ticket.hours / totalHours) * 100 : 0;
  });
  
  // Update UI
  updateInputsFromTickets();
  await updateBreakdown();
}

function updateInputsFromTickets() {
  // Update all input fields and sliders to match ticket values
  tickets.forEach((ticket, index) => {
    const hoursInput = document.querySelector(`.hours-input[data-index="${index}"]`);
    const slider = document.querySelector(`.percentage-slider[data-index="${index}"]`);
    
    if (hoursInput) {
      hoursInput.value = ticket.hours.toFixed(2);
    }
    if (slider) {
      slider.value = ticket.percentage;
    }
    
    // Check for capacity warnings
    checkCapacityWarning(index, ticket.hours);
  });
}

async function submitWorkLogs() {
  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';
  
  try {
    const credentials = await getCredentials();
    const activeTickets = tickets.filter(t => t.hours > 0);
    
    for (const ticket of activeTickets) {
      await submitWorkLog(ticket, credentials);
    }
    
    // Clear reminder alerts since work was successfully logged
    clearReminderAlerts();
    
    showSection('successSection');
    
  } catch (error) {
    showError(`Failed to submit work logs: ${error.message}`);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit to JIRA';
  }
}

async function submitWorkLog(ticket, credentials) {
  const { jiraUrl, apiToken, username } = credentials;
  
  const worklogData = {
    timeSpentSeconds: Math.round(ticket.hours * 3600), // Convert hours to seconds
    comment: `Daily work log - ${ticket.hours.toFixed(2)} hours`,
    started: new Date().toISOString().replace(/\.\d{3}Z$/, '.000+0000')
  };

  const response = await fetch(`${jiraUrl}/rest/api/2/issue/${ticket.key}/worklog`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${username}:${apiToken}`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(worklogData)
  });

  if (!response.ok) {
    throw new Error(`Failed to log work for ${ticket.key}: ${response.status}`);
  }
}

function showSection(sectionId) {
  const sections = ['setupNeeded', 'loadingSection', 'ticketsSection', 'successSection', 'errorSection'];
  sections.forEach(id => {
    document.getElementById(id).style.display = id === sectionId ? 'block' : 'none';
  });
}

function showError(message) {
  document.getElementById('errorText').textContent = message;
  showSection('errorSection');
}

// Clear reminder alerts (badge, etc.)
function clearReminderAlerts() {
  chrome.runtime.sendMessage({ action: 'clearReminders' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Could not clear reminders:', chrome.runtime.lastError.message);
    } else {
      console.log('Reminder alerts cleared');
    }
  });
} 