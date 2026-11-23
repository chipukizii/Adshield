/**
 * AdShield — Background Service Worker (Phase 2)
 *
 * This is the central nervous system of the extension.
 * Phase 2 adds:
 *   - Network filtering engine initialization.
 *   - Filter list loading on first install.
 *   - Whitelist synchronization on settings change.
 *   - Message routing for network engine operations.
 */

'use strict';

import { NetworkFilteringEngine } from '../engines/network/network-engine.js';
import { FilterManager }          from '../engines/filter-manager/filter-manager.js';
import { StorageManager }         from '../shared/storage.js';

// ─── Extension Lifecycle ───────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[AdShield] onInstalled — reason:', details.reason);

  if (details.reason === 'install') {
    await initializeDefaultSettings();
    await loadFiltersAndInitializeEngine();
    console.log('[AdShield] First install complete.');
  }

  if (details.reason === 'update') {
    console.log('[AdShield] Updated from', details.previousVersion, '→', chrome.runtime.getManifest().version);
    await NetworkFilteringEngine.initialize();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[AdShield] Service worker woke up (browser startup).');
  await NetworkFilteringEngine.initialize();
});

// ─── Default Settings ──────────────────────────────────────────────────────

async function initializeDefaultSettings() {
  const defaults = {
    protectionEnabled: true,
    engines: {
      network:  true,
      cosmetic: true,
      video:    true,
      privacy:  true,
      popup:    true,
    },
    whitelistedSites: {},
    stats: {
      totalBlocked:  0,
      blockedToday:  0,
      lastResetDate: new Date().toDateString(),
      byCategory: {
        ads:      0,
        trackers: 0,
        popups:   0,
        video:    0,
      },
    },
    filterLists:      [],
    installedVersion: chrome.runtime.getManifest().version,
  };
  await StorageManager.set(defaults);
}

// ─── Filter Loading ────────────────────────────────────────────────────────

/**
 * Load bundled filter lists, parse them, and initialize the network engine.
 * This runs on first install. On subsequent startups, the static ruleset
 * is already in place and only needs to be enabled/disabled.
 */
async function loadFiltersAndInitializeEngine() {
  try {
    console.log('[AdShield] Loading bundled filter lists...');
    const result = await FilterManager.loadBundledFilters();
    console.log(
      `[AdShield] Filter loading complete. DNR rules: ${result.totalDnrRules}, ` +
      `Cosmetic: ${result.totalCosmeticRules}, Skipped: ${result.skipped}`
    );

    // Initialize the network engine (enables/disables rulesets, syncs whitelist)
    await NetworkFilteringEngine.initialize();
  } catch (err) {
    console.error('[AdShield] Failed to load filters:', err);
  }
}

// ─── Message Routing ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.action !== 'string') {
    console.warn('[AdShield] Malformed message:', message);
    return false;
  }
  handleMessage(message, sender, sendResponse);
  return true;
});

async function handleMessage(message, sender, sendResponse) {
  try {
    switch (message.action) {

      case 'getSettings': {
        const settings = await StorageManager.get(null);
        sendResponse({ success: true, data: settings });
        break;
      }

      case 'setProtection': {
        const enabled = Boolean(message.enabled);
        await NetworkFilteringEngine.setProtectionEnabled(enabled);
        sendResponse({ success: true, protectionEnabled: enabled });
        break;
      }

      case 'toggleProtection': {
        const current = await StorageManager.getValue('protectionEnabled', true);
        const newState = !current;
        await NetworkFilteringEngine.setProtectionEnabled(newState);
        sendResponse({ success: true, protectionEnabled: newState });
        break;
      }

      case 'whitelistSite': {
        const { origin, whitelisted } = message;
        if (!origin) { sendResponse({ success: false, error: 'No origin provided' }); break; }

        const sites = await StorageManager.getValue('whitelistedSites', {});
        if (whitelisted) {
          sites[origin] = true;
        } else {
          delete sites[origin];
        }
        await StorageManager.set({ whitelistedSites: sites });
        await NetworkFilteringEngine.syncWhitelistRules(sites);
        sendResponse({ success: true });
        break;
      }

      case 'getStats': {
        const data = await StorageManager.getValue('stats', {});
        sendResponse({ success: true, stats: data });
        break;
      }

      case 'getRuleCounts': {
        const counts = await NetworkFilteringEngine.getRuleCounts();
        sendResponse({ success: true, counts });
        break;
      }

      case 'reloadFilters': {
        const result = await FilterManager.loadBundledFilters();
        await NetworkFilteringEngine.initialize();
        sendResponse({ success: true, result });
        break;
      }

      case 'testUrl': {
        const { url, type } = message;
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id ?? -1;
        const result = await NetworkFilteringEngine.testUrl(url, tabId, type);
        sendResponse({ success: true, result });
        break;
      }

      case 'ping': {
        sendResponse({ success: true, alive: true });
        break;
      }

      default:
        console.warn('[AdShield] Unknown action:', message.action);
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (err) {
    console.error('[AdShield] Error in message handler:', message.action, err);
    sendResponse({ success: false, error: err.message });
  }
}

// ─── Tab Tracking ──────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Phase 3: Trigger cosmetic engine injection here.
  }
});

console.log('[AdShield] Service worker initialized. AdShield v' + chrome.runtime.getManifest().version);
