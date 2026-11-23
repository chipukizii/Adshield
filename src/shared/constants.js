/**
 * AdShield — Shared Constants
 *
 * Central definitions used across all modules.
 * Import this file into any module that needs these values.
 * This prevents "magic strings" scattered across the codebase.
 */

'use strict';

// Extension identity
export const ADSHIELD_NAME    = 'AdShield';
export const ADSHIELD_VERSION = '0.1.0';

// Storage keys — always use these constants, never raw strings.
export const STORAGE_KEYS = {
  PROTECTION_ENABLED: 'protectionEnabled',
  ENGINES:            'engines',
  WHITELISTED_SITES:  'whitelistedSites',
  STATS:              'stats',
  FILTER_LISTS:       'filterLists',
  INSTALLED_VERSION:  'installedVersion',
};

// Message action names — the internal event bus vocabulary.
export const ACTIONS = {
  GET_SETTINGS:      'getSettings',
  TOGGLE_PROTECTION: 'toggleProtection',
  SET_PROTECTION:    'setProtection',
  WHITELIST_SITE:    'whitelistSite',
  GET_STATS:         'getStats',
  SETTINGS_UPDATED:  'settingsUpdated',
  PING:              'ping',
};

// DNR ruleset IDs (must match manifest.json exactly)
export const RULESET_IDS = {
  BASE: 'adshield_base_rules',
};

// Rule priority levels (higher number = higher priority)
export const RULE_PRIORITIES = {
  ALLOW_EXCEPTION: 1000,  // Whitelist overrides everything
  BLOCK_AD:          100,  // Standard ad block
  BLOCK_TRACKER:      90,  // Privacy tracker block
  BLOCK_POPUP:        80,  // Pop-up/redirect block
};

// Categories for statistics
export const BLOCK_CATEGORIES = {
  ADS:      'ads',
  TRACKERS: 'trackers',
  POPUPS:   'popups',
  VIDEO:    'video',
};
