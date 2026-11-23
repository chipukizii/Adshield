/**
 * AdShield — Background Service Worker (Phase 1 Scaffold)
 *
 * This is the central nervous system of the extension.
 * In Manifest V3, the background page is replaced by a Service Worker.
 * It wakes on events (install, message, tab update) and sleeps between them.
 *
 * Phase 1: Establish the event backbone and basic storage initialization.
 * Future phases will import and coordinate the filtering engines here.
 */

'use strict';

// ─── Extension Lifecycle ───────────────────────────────────────────────────

/**
 * Fires once when the extension is first installed or updated.
 * Use this to initialize default settings in storage.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[AdShield] onInstalled — reason:', details.reason);

  if (details.reason === 'install') {
    await initializeDefaultSettings();
    console.log('[AdShield] First install complete. Default settings applied.');
  }

  if (details.reason === 'update') {
    console.log('[AdShield] Extension updated from', details.previousVersion, '→', chrome.runtime.getManifest().version);
    // Future: migrate settings between versions here.
  }
});

/**
 * Fires when Chrome starts and the service worker wakes up.
 * Re-establish any runtime state that doesn't persist across sleep cycles.
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('[AdShield] Service worker started (browser startup).');
});

// ─── Default Settings ──────────────────────────────────────────────────────

/**
 * Write the default configuration to chrome.storage.local on first install.
 *
 * chrome.storage.local persists across browser restarts.
 * We use it for settings and per-site overrides.
 * We NEVER store sensitive browsing data here.
 */
async function initializeDefaultSettings() {
  const defaults = {
    // Master switch — all protection on/off
    protectionEnabled: true,

    // Individual engine toggles (for future use)
    engines: {
      network:  true,
      cosmetic: true,
      video:    true,
      privacy:  true,
      popup:    true,
    },

    // Sites where the user has paused protection (origin → true)
    // Example: { "https://example.com": true }
    whitelistedSites: {},

    // Statistics counters
    stats: {
      totalBlocked:    0,
      blockedToday:    0,
      lastResetDate:   new Date().toDateString(),
      byCategory: {
        ads:      0,
        trackers: 0,
        popups:   0,
        video:    0,
      },
    },

    // Filter list metadata (populated in Phase 2)
    filterLists: [],

    // Extension version for migration tracking
    installedVersion: chrome.runtime.getManifest().version,
  };

  await chrome.storage.local.set(defaults);
}

// ─── Message Routing ───────────────────────────────────────────────────────

/**
 * Central message bus between content scripts, popup and dashboard.
 *
 * All internal communication goes through sendMessage → onMessage.
 * Never trust message senders blindly — validate the action field.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate basic message shape
  if (!message || typeof message.action !== 'string') {
    console.warn('[AdShield] Malformed message received:', message);
    return false;
  }

  handleMessage(message, sender, sendResponse);

  // Return true to signal we may send a response asynchronously.
  return true;
});

async function handleMessage(message, sender, sendResponse) {
  try {
    switch (message.action) {

      case 'getSettings': {
        const settings = await chrome.storage.local.get(null);
        sendResponse({ success: true, data: settings });
        break;
      }

      case 'toggleProtection': {
        const current = await chrome.storage.local.get('protectionEnabled');
        const newState = !current.protectionEnabled;
        await chrome.storage.local.set({ protectionEnabled: newState });
        console.log('[AdShield] Protection toggled →', newState);
        sendResponse({ success: true, protectionEnabled: newState });
        break;
      }

      case 'setProtection': {
        const enabled = Boolean(message.enabled);
        await chrome.storage.local.set({ protectionEnabled: enabled });
        console.log('[AdShield] Protection set to:', enabled);
        sendResponse({ success: true, protectionEnabled: enabled });
        break;
      }

      case 'whitelistSite': {
        const { origin, whitelisted } = message;
        if (!origin) { sendResponse({ success: false, error: 'No origin provided' }); break; }
        const data = await chrome.storage.local.get('whitelistedSites');
        const sites = data.whitelistedSites || {};
        if (whitelisted) {
          sites[origin] = true;
        } else {
          delete sites[origin];
        }
        await chrome.storage.local.set({ whitelistedSites: sites });
        sendResponse({ success: true });
        break;
      }

      case 'getStats': {
        const data = await chrome.storage.local.get('stats');
        sendResponse({ success: true, stats: data.stats });
        break;
      }

      default:
        console.warn('[AdShield] Unknown message action:', message.action);
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (err) {
    console.error('[AdShield] Error handling message:', message.action, err);
    sendResponse({ success: false, error: err.message });
  }
}

// ─── Tab Event Hooks (Scaffold) ────────────────────────────────────────────

/**
 * Fires when a tab finishes loading.
 * Future: inject cosmetic filters, check whitelist, update popup badge.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Phase 2+: check whitelist, trigger content script initialization.
    // console.log('[AdShield] Tab loaded:', tab.url);
  }
});

console.log('[AdShield] Service worker initialized. AdShield v' + chrome.runtime.getManifest().version);
