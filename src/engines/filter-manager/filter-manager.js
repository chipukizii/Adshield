/**
 * AdShield — Filter Manager
 *
 * Responsible for:
 *   - Loading bundled filter lists from the extension package.
 *   - Coordinating parsing via FilterListParser.
 *   - Storing parsed DNR rules as JSON for use by the network engine.
 *   - Tracking filter list metadata (version, rule count, last updated).
 *   - Deduplicating and validating rules before applying them.
 *
 * In Phase 2, we use a bundled filter list (shipped with the extension).
 * In Phase 7, we add remote update support.
 *
 * Filter list data flow:
 *
 *   Raw .txt filter list
 *       ↓
 *   FilterListParser.parse()
 *       ↓
 *   Deduplicate + Validate
 *       ↓
 *   Save to chrome.storage.local as parsed JSON
 *       ↓
 *   Update manifest-declared static ruleset OR dynamic rules
 */

'use strict';

import { FilterListParser } from './filter-parser.js';
import { StorageManager }   from '../../shared/storage.js';

// Storage key for the parsed rules cache
const PARSED_RULES_STORAGE_KEY = 'parsedFilterRules';

// Starting rule ID for filter-list-derived rules.
// We start at 1 and let the parser increment. The network engine's whitelist
// rules use IDs starting at 10000, so there is no collision.
const FILTER_RULE_ID_START = 1;

export const FilterManager = {

  /**
   * Load and process all bundled filter lists.
   *
   * Returns a summary of what was parsed.
   * The actual DNR rules are saved to storage and also returned
   * so the network engine can apply them.
   *
   * @returns {Promise<{
   *   totalDnrRules:      number,
   *   totalCosmeticRules: number,
   *   skipped:            number,
   *   lists:              object[],
   * }>}
   */
  async loadBundledFilters() {
    const lists = this._getBundledListManifest();
    const allDnrRules      = [];
    const allCosmeticRules = [];
    let   totalSkipped     = 0;
    const listSummaries    = [];

    for (const list of lists) {
      try {
        console.log(`[FilterManager] Loading: ${list.name}`);
        const text   = await this._fetchBundledList(list.path);
        const result = FilterListParser.parse(
          text,
          FILTER_RULE_ID_START + allDnrRules.length,
          list.priority
        );

        allDnrRules.push(...result.dnrRules);
        allCosmeticRules.push(...result.cosmeticRules);
        totalSkipped += result.skipped;

        listSummaries.push({
          id:           list.id,
          name:         list.name,
          dnrRules:     result.dnrRules.length,
          cosmetic:     result.cosmeticRules.length,
          skipped:      result.skipped,
          parsed:       result.parsed,
          loadedAt:     new Date().toISOString(),
        });

        console.log(
          `[FilterManager] ${list.name}: ${result.dnrRules.length} DNR rules, ` +
          `${result.cosmeticRules.length} cosmetic, ${result.skipped} skipped`
        );
      } catch (err) {
        console.error(`[FilterManager] Failed to load list "${list.name}":`, err.message);
        listSummaries.push({
          id:    list.id,
          name:  list.name,
          error: err.message,
        });
      }
    }

    // Deduplicate across all lists
    const beforeDedup = allDnrRules.length;
    const deduped     = FilterListParser.deduplicate(allDnrRules);
    const dupsRemoved = beforeDedup - deduped.length;

    // Validate
    const { valid, invalid } = FilterListParser.validate(deduped);

    if (invalid.length > 0) {
      console.warn(`[FilterManager] ${invalid.length} rules failed validation and were removed.`);
    }

    if (dupsRemoved > 0) {
      console.log(`[FilterManager] Removed ${dupsRemoved} duplicate rules.`);
    }

    // Re-assign sequential IDs after dedup/validation (IDs must be unique integers)
    const finalRules = valid.map((rule, index) => ({
      ...rule,
      id: FILTER_RULE_ID_START + index,
    }));

    // Save parsed cosmetic rules to storage for the cosmetic engine (Phase 3)
    await StorageManager.set({
      cosmeticRules:  allCosmeticRules,
      filterLists:    listSummaries,
      [PARSED_RULES_STORAGE_KEY]: {
        rules:     finalRules,
        savedAt:   new Date().toISOString(),
        ruleCount: finalRules.length,
      },
    });

    console.log(`[FilterManager] Processing complete. Final DNR rule count: ${finalRules.length}`);

    return {
      totalDnrRules:      finalRules.length,
      totalCosmeticRules: allCosmeticRules.length,
      skipped:            totalSkipped,
      lists:              listSummaries,
      rules:              finalRules,
    };
  },

  /**
   * Get the previously parsed rules from storage.
   * @returns {Promise<object[]>}
   */
  async getCachedRules() {
    const data = await StorageManager.getValue(PARSED_RULES_STORAGE_KEY, null);
    return data ? data.rules : [];
  },

  /**
   * Define which bundled filter lists to load.
   * Each entry maps to a file in filters/bundled/.
   *
   * Priority guide:
   *   100 = standard ad block
   *    90 = tracker/privacy block
   *    80 = popup/redirect block
   */
  _getBundledListManifest() {
    return [
      {
        id:       'adshield-base',
        name:     'AdShield Base Filters',
        path:     '/filters/bundled/adshield-base.txt',
        priority: 100,
      },
      {
        id:       'adshield-privacy',
        name:     'AdShield Privacy Filters',
        path:     '/filters/bundled/adshield-privacy.txt',
        priority: 90,
      },
    ];
  },

  /**
   * Fetch a bundled filter list by its extension-relative path.
   * Uses fetch() with the chrome-extension:// URL scheme.
   *
   * @param {string} path  - e.g. "/filters/bundled/adshield-base.txt"
   * @returns {Promise<string>}
   */
  async _fetchBundledList(path) {
    const url = chrome.runtime.getURL(path);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${path}`);
    }
    return response.text();
  },
};
