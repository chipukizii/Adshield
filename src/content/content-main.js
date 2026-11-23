/**
 * AdShield — Content Script Entry Point (Phase 1 Scaffold)
 *
 * Content scripts run in the context of every webpage.
 * They can read and modify the DOM, but they run in an isolated world —
 * they cannot access page JavaScript variables directly.
 *
 * run_at: document_start means this fires before any page HTML is parsed,
 * giving us the earliest possible chance to block content.
 *
 * Phase 1: Establish the content script scaffold.
 * Phase 3+: Cosmetic filtering engine will be initialized here.
 * Phase 5+: Video protection engine will be initialized here.
 */

'use strict';

(function adShieldContentMain() {

  // Avoid injecting twice in the same frame (e.g. iframes can be re-navigated).
  if (window.__adShieldInjected) return;
  window.__adShieldInjected = true;

  const ADSHIELD_VERSION = '0.1.0';
  const isMainFrame = window.self === window.top;

  // ─── Logging Utility ──────────────────────────────────────────────────

  const log = (...args) => {
    // Only log in development. In production builds this will be stripped.
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      // console.debug('[AdShield Content]', ...args);
    }
  };

  log(`Initialized in ${isMainFrame ? 'main' : 'sub'} frame — ${document.location.href}`);

  // ─── Settings Cache ───────────────────────────────────────────────────

  /**
   * We cache settings locally to avoid a storage read on every DOM event.
   * Settings are refreshed when the background sends an update message.
   */
  let settings = {
    protectionEnabled: true,
    whitelistedSites:  {},
    engines:           { cosmetic: true, video: true, popup: true },
  };

  // ─── Check if this Origin is Whitelisted ──────────────────────────────

  function isWhitelisted() {
    const origin = window.location.origin;
    return settings.whitelistedSites[origin] === true;
  }

  // ─── Message Listener ─────────────────────────────────────────────────

  /**
   * Listen for messages from the background service worker.
   * Future phases will use this to trigger filter reloads, whitelist updates, etc.
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.action !== 'string') return;

    switch (message.action) {
      case 'settingsUpdated':
        settings = { ...settings, ...message.settings };
        log('Settings updated:', settings);
        sendResponse({ success: true });
        break;

      case 'ping':
        // Health-check used by the popup to verify content script is alive.
        sendResponse({ success: true, alive: true, url: document.location.href });
        break;

      default:
        // Not a content-script message — ignore silently.
        break;
    }
  });

  // ─── Load Initial Settings ────────────────────────────────────────────

  /**
   * Ask the background for the current settings on startup.
   * We do this asynchronously so we don't block document_start.
   */
  chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
    if (chrome.runtime.lastError) {
      // Service worker may not be ready yet — harmless on first load.
      return;
    }
    if (response && response.success && response.data) {
      settings = {
        protectionEnabled: response.data.protectionEnabled ?? true,
        whitelistedSites:  response.data.whitelistedSites  ?? {},
        engines:           response.data.engines            ?? settings.engines,
      };
      log('Initial settings loaded. Protection:', settings.protectionEnabled, 'Whitelisted:', isWhitelisted());
    }
  });

  // ─── Phase Hooks (Stubs for Future Engines) ───────────────────────────

  /**
   * These functions are stubs.
   * Phase 3 will implement initCosmeticEngine().
   * Phase 5 will implement initVideoEngine().
   * Phase 4 will implement initPopupProtection().
   */

  function initCosmeticEngine() {
    // TODO Phase 3: Import and initialize the cosmetic filtering engine.
    log('Cosmetic engine stub — Phase 3');
  }

  function initVideoEngine() {
    // TODO Phase 5: Import and initialize the video protection engine.
    log('Video engine stub — Phase 5');
  }

  function initPopupProtection() {
    // TODO Phase 4: Import and initialize the pop-up protection engine.
    log('Pop-up protection stub — Phase 4');
  }

  // We call these after the DOM is available so engines can observe it.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDOMReady);
  } else {
    onDOMReady();
  }

  function onDOMReady() {
    if (!settings.protectionEnabled || isWhitelisted()) {
      log('Protection disabled or site whitelisted — content script standing down.');
      return;
    }
    if (settings.engines.cosmetic) initCosmeticEngine();
    if (settings.engines.video)    initVideoEngine();
    if (settings.engines.popup)    initPopupProtection();
  }

})();
