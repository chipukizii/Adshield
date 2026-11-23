/**
 * AdShield — Popup Controller
 *
 * Manages all popup UI interactions:
 *  - Loads current settings from the background service worker.
 *  - Displays blocking statistics.
 *  - Handles the master protection toggle.
 *  - Handles per-site whitelist (pause) toggle.
 *  - Provides navigation to the settings dashboard.
 */

'use strict';

// ─── DOM References ───────────────────────────────────────────────────────

const protectionToggle  = document.getElementById('protection-toggle');
const protectionStatus  = document.getElementById('protection-status-text');
const statTotal         = document.getElementById('stat-total');
const statToday         = document.getElementById('stat-today');
const currentSiteEl     = document.getElementById('current-site');
const whitelistBtn      = document.getElementById('whitelist-btn');
const openDashboardBtn  = document.getElementById('open-dashboard');
const reportIssueBtn    = document.getElementById('report-issue');
const extVersionEl      = document.getElementById('ext-version');

// ─── State ────────────────────────────────────────────────────────────────

let currentTabOrigin    = '';
let isWhitelisted       = false;
let protectionEnabled   = true;

// ─── Initialization ───────────────────────────────────────────────────────

async function init() {
  // Show extension version
  extVersionEl.textContent = 'v' + chrome.runtime.getManifest().version;

  // Get the current active tab's URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) {
    try {
      const url = new URL(tab.url);
      // Only show hostname for http/https; show scheme for internal pages.
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        currentTabOrigin = url.origin;
        currentSiteEl.textContent = url.hostname;
      } else {
        currentSiteEl.textContent = url.protocol.replace(':', '');
        whitelistBtn.disabled = true;
      }
    } catch {
      currentSiteEl.textContent = 'Unknown';
      whitelistBtn.disabled = true;
    }
  }

  // Load settings from background
  await loadSettings();
}

async function loadSettings() {
  chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      showError();
      return;
    }

    const data = response.data;
    protectionEnabled = data.protectionEnabled ?? true;
    const whitelistedSites = data.whitelistedSites ?? {};
    isWhitelisted = currentTabOrigin ? whitelistedSites[currentTabOrigin] === true : false;

    // Update UI
    renderProtectionState();
    renderStats(data.stats);
    renderSiteState();
  });
}

// ─── Render Helpers ───────────────────────────────────────────────────────

function renderProtectionState() {
  protectionToggle.checked = protectionEnabled;

  if (protectionEnabled) {
    protectionStatus.textContent = 'Active';
    protectionStatus.className = 'toggle-status';
    document.body.classList.remove('protection-off');
  } else {
    protectionStatus.textContent = 'Paused globally';
    protectionStatus.className = 'toggle-status paused';
    document.body.classList.add('protection-off');
  }
}

function renderStats(stats) {
  if (!stats) {
    statTotal.textContent = '0';
    statToday.textContent = '0';
    return;
  }
  statTotal.textContent = formatNumber(stats.totalBlocked ?? 0);
  statToday.textContent = formatNumber(stats.blockedToday ?? 0);
}

function renderSiteState() {
  if (isWhitelisted) {
    whitelistBtn.textContent = 'Resume';
    whitelistBtn.classList.add('active');
  } else {
    whitelistBtn.textContent = 'Pause';
    whitelistBtn.classList.remove('active');
  }
}

function showError() {
  protectionStatus.textContent = 'Error loading settings';
  protectionStatus.className = 'toggle-status paused';
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ─── Event Handlers ───────────────────────────────────────────────────────

protectionToggle.addEventListener('change', async () => {
  protectionEnabled = protectionToggle.checked;
  renderProtectionState();

  chrome.runtime.sendMessage(
    { action: 'setProtection', enabled: protectionEnabled },
    (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        // Revert UI on failure
        protectionEnabled = !protectionEnabled;
        protectionToggle.checked = protectionEnabled;
        renderProtectionState();
      }
    }
  );
});

whitelistBtn.addEventListener('click', async () => {
  if (!currentTabOrigin || whitelistBtn.disabled) return;

  isWhitelisted = !isWhitelisted;
  renderSiteState();

  chrome.runtime.sendMessage(
    { action: 'whitelistSite', origin: currentTabOrigin, whitelisted: isWhitelisted },
    (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        // Revert on failure
        isWhitelisted = !isWhitelisted;
        renderSiteState();
      }
    }
  );
});

openDashboardBtn.addEventListener('click', () => {
  // Opens the dashboard as a full page. dashboard.html will be built in Phase 6.
  chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
});

reportIssueBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://github.com/YOUR_USERNAME/adshield-browser-extension/issues/new' });
});

// ─── Boot ─────────────────────────────────────────────────────────────────
init().catch(console.error);
