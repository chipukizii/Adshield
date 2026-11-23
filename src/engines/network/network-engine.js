/**
 * AdShield — Network Filtering Engine
 *
 * This module is the central coordinator for all network-level ad blocking.
 * It sits between the service worker and Chrome's Declarative Net Request API.
 *
 * Responsibilities:
 *   - Enable and disable static rulesets declared in manifest.json.
 *   - Add and remove dynamic rules at runtime (whitelist exceptions, user rules).
 *   - Add and remove session rules (rules that reset when the browser closes).
 *   - Track rule counts and report them for the UI.
 *   - Enforce Chrome's hard limits on rule counts.
 *
 * Key concept — three rule scopes in Chrome DNR:
 *
 *   Static rules  — Declared in manifest.json. Stored as JSON files bundled
 *                   with the extension. Enabled/disabled as named rulesets.
 *                   Limit: 30,000 rules across all static rulesets combined.
 *                   These survive browser restarts.
 *
 *   Dynamic rules — Added at runtime via updateDynamicRules(). Survive restarts.
 *                   Limit: 5,000 rules. Used for per-user whitelist exceptions.
 *
 *   Session rules — Added at runtime via updateSessionRules(). Reset on restart.
 *                   Limit: 5,000 rules. Used for temporary per-session overrides.
 *
 * Rule priority: higher number wins. We use:
 *   1000 — allow rules (whitelist — must override everything)
 *    100 — block rules (standard ad block)
 *     90 — tracker block
 *     80 — popup/redirect block
 */

'use strict';

import { RULESET_IDS, RULE_PRIORITIES, BLOCK_CATEGORIES } from '../shared/constants.js';
import { StorageManager } from '../shared/storage.js';

// Chrome DNR hard limits
const DNR_LIMITS = {
  MAX_DYNAMIC_RULES:  5000,
  MAX_SESSION_RULES:  5000,
  MAX_STATIC_RULES:  30000,
};

// Dynamic rule ID ranges (to avoid collisions between categories)
// We reserve blocks of IDs so we know which range a rule came from.
const DYNAMIC_ID_RANGES = {
  WHITELIST_START:   10000,  // 10000–14999 — per-site allow rules
  WHITELIST_END:     14999,
  USER_BLOCK_START:  15000,  // 15000–19999 — user-added custom block rules
  USER_BLOCK_END:    19999,
};

// ─── NetworkFilteringEngine ───────────────────────────────────────────────────

export const NetworkFilteringEngine = {

  // ── Initialization ────────────────────────────────────────────────────────

  /**
   * Called by the service worker on install and on startup.
   * Ensures rulesets are in the correct enabled/disabled state based on
   * the user's current settings in storage.
   */
  async initialize() {
    try {
      const settings = await StorageManager.get(['protectionEnabled', 'whitelistedSites']);
      const protectionEnabled = settings.protectionEnabled ?? true;

      await this.setStaticRulesetEnabled(RULESET_IDS.BASE, protectionEnabled);
      await this.syncWhitelistRules(settings.whitelistedSites ?? {});

      const counts = await this.getRuleCounts();
      console.log('[NetworkEngine] Initialized. Rule counts:', counts);
      return { success: true, counts };
    } catch (err) {
      console.error('[NetworkEngine] Initialization failed:', err);
      return { success: false, error: err.message };
    }
  },

  // ── Static Ruleset Management ─────────────────────────────────────────────

  /**
   * Enable or disable a named static ruleset.
   *
   * Static rulesets are declared in manifest.json under declarative_net_request.
   * We can only flip them on or off — not modify their content at runtime.
   * Content changes require shipping a new extension version.
   *
   * @param {string}  rulesetId  - Must match an ID in manifest.json
   * @param {boolean} enabled
   */
  async setStaticRulesetEnabled(rulesetId, enabled) {
    try {
      const update = enabled
        ? { enableRulesetIds: [rulesetId],  disableRulesetIds: [] }
        : { enableRulesetIds: [],           disableRulesetIds: [rulesetId] };

      await chrome.declarativeNetRequest.updateEnabledRulesets(update);
      console.log(`[NetworkEngine] Ruleset "${rulesetId}" → ${enabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      // Chrome throws if the ruleset ID is unknown — surface a clear error.
      console.error(`[NetworkEngine] Failed to toggle ruleset "${rulesetId}":`, err.message);
      throw err;
    }
  },

  /**
   * Get the list of currently enabled static ruleset IDs.
   * @returns {Promise<string[]>}
   */
  async getEnabledRulesets() {
    const rulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
    return rulesets;
  },

  // ── Dynamic Rule Management ───────────────────────────────────────────────

  /**
   * Add dynamic rules.
   * Dynamic rules survive browser restarts and count toward the 5,000 limit.
   *
   * @param {chrome.declarativeNetRequest.Rule[]} rules
   */
  async addDynamicRules(rules) {
    if (!rules || rules.length === 0) return;

    const current = await this.getDynamicRuleCount();
    if (current + rules.length > DNR_LIMITS.MAX_DYNAMIC_RULES) {
      throw new Error(
        `Dynamic rule limit would be exceeded. Current: ${current}, Adding: ${rules.length}, Limit: ${DNR_LIMITS.MAX_DYNAMIC_RULES}`
      );
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules:    rules,
      removeRuleIds: [],
    });
    console.log(`[NetworkEngine] Added ${rules.length} dynamic rule(s).`);
  },

  /**
   * Remove dynamic rules by their IDs.
   * @param {number[]} ruleIds
   */
  async removeDynamicRules(ruleIds) {
    if (!ruleIds || ruleIds.length === 0) return;

    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules:    [],
      removeRuleIds: ruleIds,
    });
    console.log(`[NetworkEngine] Removed ${ruleIds.length} dynamic rule(s).`);
  },

  /**
   * Replace all dynamic rules atomically.
   * Useful when rebuilding the full whitelist from storage.
   *
   * @param {chrome.declarativeNetRequest.Rule[]} newRules
   */
  async replaceDynamicRules(newRules) {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existing.map(r => r.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules:      newRules,
      removeRuleIds: existingIds,
    });
    console.log(`[NetworkEngine] Replaced dynamic rules. New count: ${newRules.length}`);
  },

  /**
   * Get all current dynamic rules.
   * @returns {Promise<chrome.declarativeNetRequest.Rule[]>}
   */
  async getDynamicRules() {
    return chrome.declarativeNetRequest.getDynamicRules();
  },

  /**
   * Count current dynamic rules.
   * @returns {Promise<number>}
   */
  async getDynamicRuleCount() {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    return rules.length;
  },

  // ── Session Rule Management ───────────────────────────────────────────────

  /**
   * Add session rules (reset on browser restart).
   * @param {chrome.declarativeNetRequest.Rule[]} rules
   */
  async addSessionRules(rules) {
    if (!rules || rules.length === 0) return;

    await chrome.declarativeNetRequest.updateSessionRules({
      addRules:    rules,
      removeRuleIds: [],
    });
    console.log(`[NetworkEngine] Added ${rules.length} session rule(s).`);
  },

  /**
   * Remove session rules by IDs.
   * @param {number[]} ruleIds
   */
  async removeSessionRules(ruleIds) {
    if (!ruleIds || ruleIds.length === 0) return;

    await chrome.declarativeNetRequest.updateSessionRules({
      addRules:    [],
      removeRuleIds: ruleIds,
    });
  },

  // ── Whitelist (Allow) Rule Management ─────────────────────────────────────

  /**
   * Rebuild whitelist allow-rules from the stored whitelistedSites map.
   *
   * For each whitelisted origin, we create a high-priority allow rule that
   * overrides all block rules for requests initiated from that origin.
   *
   * We use initiatorDomains rather than urlFilter so we allow ALL resources
   * the page loads, not just resources matching the domain pattern.
   *
   * @param {Object} whitelistedSites  - { "https://example.com": true, ... }
   */
  async syncWhitelistRules(whitelistedSites) {
    const origins = Object.keys(whitelistedSites).filter(k => whitelistedSites[k] === true);
    const rules = [];

    origins.forEach((origin, index) => {
      let hostname;
      try {
        hostname = new URL(origin).hostname;
      } catch {
        return; // Skip malformed origins
      }

      rules.push({
        id:       DYNAMIC_ID_RANGES.WHITELIST_START + index,
        priority: RULE_PRIORITIES.ALLOW_EXCEPTION,
        action:   { type: 'allow' },
        condition: {
          // Allow all resource types when the request comes from this site
          initiatorDomains: [hostname],
          resourceTypes: [
            'main_frame', 'sub_frame', 'stylesheet', 'script',
            'image', 'font', 'xmlhttprequest', 'ping',
            'csp_report', 'media', 'websocket', 'webtransport', 'other',
          ],
        },
      });
    });

    await this.replaceDynamicRules(rules);
    console.log(`[NetworkEngine] Whitelist sync complete. ${rules.length} site(s) whitelisted.`);
  },

  // ── Global Protection Toggle ───────────────────────────────────────────────

  /**
   * Enable or disable all network filtering.
   * Toggles the static base ruleset and any additional enabled rulesets.
   *
   * @param {boolean} enabled
   */
  async setProtectionEnabled(enabled) {
    await this.setStaticRulesetEnabled(RULESET_IDS.BASE, enabled);
    await StorageManager.set({ protectionEnabled: enabled });
    console.log(`[NetworkEngine] Global protection → ${enabled ? 'ON' : 'OFF'}`);
  },

  // ── Rule Count Reporting ───────────────────────────────────────────────────

  /**
   * Get a summary of current rule counts for the UI.
   * @returns {Promise<{static: number, dynamic: number, session: number}>}
   */
  async getRuleCounts() {
    const [dynamicRules, sessionRules] = await Promise.all([
      chrome.declarativeNetRequest.getDynamicRules(),
      chrome.declarativeNetRequest.getSessionRules(),
    ]);

    return {
      dynamic: dynamicRules.length,
      session: sessionRules.length,
      limits: DNR_LIMITS,
    };
  },

  /**
   * Check if a request to a URL would be blocked by current rules.
   * Uses the testMatchOutcome API (Chrome 103+, requires declarativeNetRequestFeedback permission).
   *
   * @param {string}  url         - Full URL to test
   * @param {string}  tabId       - Tab making the request
   * @param {string}  type        - Resource type (e.g. 'script', 'image')
   * @returns {Promise<object>}   - Match result from Chrome
   */
  async testUrl(url, tabId, type = 'script') {
    try {
      const result = await chrome.declarativeNetRequest.testMatchOutcome({
        request: {
          url,
          type,
          tabId: tabId ?? -1,
          initiator: url,
        },
      });
      return result;
    } catch (err) {
      return { error: err.message };
    }
  },
};
