/**
 * AdShield — Filter List Parser
 *
 * Parses Adblock Plus / uBlock Origin filter syntax and converts rules
 * to Chrome Declarative Net Request (DNR) JSON format.
 *
 * This is one of the most technically important modules in AdShield.
 *
 * Key concepts:
 *
 * Adblock Plus syntax (used by EasyList, EasyPrivacy, uBlock) is a text
 * format with one rule per line. Rule types include:
 *
 *   ||example.com^            Network block rule (anchor + hostname)
 *   ||example.com^$script     Network block with resource type filter
 *   @@||example.com^          Exception (allow) rule
 *   ##.ad-banner              Cosmetic rule (hide element by CSS selector)
 *   example.com##.ad          Site-specific cosmetic rule
 *   ! Comment                 Comment line
 *   [Adblock Plus 2.0]        Header line
 *
 * Chrome DNR does NOT support all Adblock syntax. We handle three outcomes:
 *   1. Supported    — convert to DNR rule and use it.
 *   2. Cosmetic     — keep for the cosmetic engine (Phase 3).
 *   3. Unsupported  — log and skip. Never silently pretend it is active.
 *
 * DNR Rule format:
 * {
 *   id:       number,          (unique integer)
 *   priority: number,          (higher wins)
 *   action:   { type: 'block' | 'allow' | 'redirect' | 'modifyHeaders' },
 *   condition: {
 *     urlFilter:        string,   (URL pattern)
 *     regexFilter:      string,   (alternative to urlFilter)
 *     resourceTypes:    string[], (script, image, xmlhttprequest, ...)
 *     initiatorDomains: string[], (only match from these domains)
 *     excludedInitiatorDomains: string[],
 *     isUrlFilterCaseSensitive: boolean,
 *   }
 * }
 */

'use strict';

// ─── Resource type mapping from Adblock to DNR ────────────────────────────────

const RESOURCE_TYPE_MAP = {
  'script':        'script',
  'image':         'image',
  'stylesheet':    'stylesheet',
  'object':        'object',
  'xmlhttprequest':'xmlhttprequest',
  'subdocument':   'sub_frame',
  'ping':          'ping',
  'beacon':        'ping',
  'media':         'media',
  'font':          'font',
  'websocket':     'websocket',
  'document':      'main_frame',
  'popup':         'main_frame',
  'other':         'other',
};

// All DNR-supported resource types (used when no type filter is specified)
const ALL_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script',
  'image', 'font', 'xmlhttprequest', 'ping',
  'media', 'websocket', 'other',
];

// ─── FilterListParser ─────────────────────────────────────────────────────────

export const FilterListParser = {

  /**
   * Parse a full filter list text into categorized results.
   *
   * @param {string}  text            - Raw filter list text
   * @param {number}  startId         - Starting DNR rule ID (to avoid collisions)
   * @param {number}  priority        - Base priority for block rules
   * @returns {{
   *   dnrRules:        object[],   // Ready-to-use Chrome DNR rules
   *   cosmeticRules:   string[],   // CSS selectors for Phase 3
   *   skipped:         number,     // Count of unsupported rules
   *   parsed:          number,     // Total lines processed
   * }}
   */
  parse(text, startId = 1, priority = 100) {
    const lines = text.split('\n');
    const dnrRules      = [];
    const cosmeticRules = [];
    let skipped = 0;
    let currentId = startId;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();

      // Skip empty lines
      if (!raw) continue;

      // Skip comments and headers
      if (raw.startsWith('!') || raw.startsWith('[')) continue;

      // Detect cosmetic rules (##, #@#, #?#, etc.)
      if (this._isCosmeticRule(raw)) {
        const cosmetic = this._parseCosmeticRule(raw);
        if (cosmetic) cosmeticRules.push(cosmetic);
        continue;
      }

      // Skip snippet/scriptlet rules (unsupported in MV3)
      if (raw.includes('##+js(') || raw.includes('#$#')) {
        skipped++;
        continue;
      }

      // Try to convert to DNR rule
      const dnrRule = this._convertToDNR(raw, currentId, priority);
      if (dnrRule) {
        dnrRules.push(dnrRule);
        currentId++;
      } else {
        skipped++;
      }
    }

    return {
      dnrRules,
      cosmeticRules,
      skipped,
      parsed: lines.length,
    };
  },

  // ── Private: Rule Type Detection ──────────────────────────────────────────

  _isCosmeticRule(line) {
    return (
      line.includes('##') ||
      line.includes('#@#') ||
      line.includes('#?#') ||
      line.includes('#$#')
    );
  },

  // ── Private: Cosmetic Rule Extraction ─────────────────────────────────────

  /**
   * Extract the CSS selector from a cosmetic rule.
   * Returns null for exception cosmetic rules (we cannot un-hide via CSS injection).
   *
   * Examples:
   *   ##.ad-banner          → { selector: '.ad-banner', domains: [], exception: false }
   *   example.com##.ad      → { selector: '.ad', domains: ['example.com'], exception: false }
   *   example.com#@#.ad     → null (exception — skip)
   */
  _parseCosmeticRule(line) {
    // Exception cosmetic rules (un-hide) — skip
    if (line.includes('#@#')) return null;

    const sepIndex = line.indexOf('##');
    if (sepIndex === -1) return null;

    const domainPart   = line.substring(0, sepIndex);
    const selectorPart = line.substring(sepIndex + 2).trim();

    // Skip extended CSS selectors (:has, :matches-css, etc.) — not standard CSS
    if (selectorPart.startsWith(':') || selectorPart.includes(':-abp-')) return null;

    const domains = domainPart
      ? domainPart.split(',').map(d => d.trim()).filter(Boolean)
      : [];

    return { selector: selectorPart, domains, exception: false };
  },

  // ── Private: Convert ABP/uBO Rule to DNR ──────────────────────────────────

  /**
   * Convert a single Adblock Plus network rule to a DNR rule object.
   * Returns null if the rule cannot be represented in DNR.
   *
   * @param {string}  raw       - Raw filter rule text
   * @param {number}  id        - Unique integer ID for this rule
   * @param {number}  priority  - Rule priority
   * @returns {object|null}
   */
  _convertToDNR(raw, id, priority) {
    // Exception (allow) rules start with @@
    const isException = raw.startsWith('@@');
    const rule = isException ? raw.slice(2) : raw;

    // Split pattern from options (options follow a $)
    const dollarIndex = rule.lastIndexOf('$');
    let pattern = dollarIndex !== -1 ? rule.substring(0, dollarIndex) : rule;
    const optionsPart = dollarIndex !== -1 ? rule.substring(dollarIndex + 1) : '';

    // Parse options
    const options = this._parseOptions(optionsPart);

    // Skip rules with unsupported options
    if (options.unsupported) return null;

    // Skip rules with no meaningful pattern
    if (!pattern || pattern === '*') return null;

    // Convert pattern to DNR urlFilter
    const urlFilter = this._convertPattern(pattern);
    if (!urlFilter) return null;

    // Build the DNR rule
    const dnrRule = {
      id,
      priority: isException ? 1000 : priority,
      action: { type: isException ? 'allow' : 'block' },
      condition: {},
    };

    // Apply URL filter
    // Chrome DNR urlFilter supports: * ? | ^ but not full regex by default
    // If the pattern needs regex, use regexFilter (Chrome 88+)
    if (options.useRegex || this._needsRegex(urlFilter)) {
      const regexPattern = this._toRegex(pattern);
      if (!regexPattern) return null;
      dnrRule.condition.regexFilter = regexPattern;
    } else {
      dnrRule.condition.urlFilter = urlFilter;
    }

    // Resource types
    if (options.resourceTypes && options.resourceTypes.length > 0) {
      dnrRule.condition.resourceTypes = options.resourceTypes;
    } else if (!isException) {
      // Block rules without explicit types apply to common resource types
      // We exclude main_frame by default to avoid blocking entire pages
      dnrRule.condition.resourceTypes = [
        'sub_frame', 'stylesheet', 'script', 'image',
        'font', 'xmlhttprequest', 'ping', 'media', 'other',
      ];
    }

    // Domain restrictions
    if (options.domains && options.domains.length > 0) {
      dnrRule.condition.initiatorDomains = options.domains;
    }
    if (options.excludedDomains && options.excludedDomains.length > 0) {
      dnrRule.condition.excludedInitiatorDomains = options.excludedDomains;
    }

    return dnrRule;
  },

  // ── Private: Options Parser ────────────────────────────────────────────────

  /**
   * Parse the options string after $ in a filter rule.
   * Example: "script,image,domain=example.com|~other.com"
   *
   * @returns {{
   *   resourceTypes:    string[],
   *   domains:          string[],
   *   excludedDomains:  string[],
   *   unsupported:      boolean,
   *   useRegex:         boolean,
   * }}
   */
  _parseOptions(optionsPart) {
    const result = {
      resourceTypes:   [],
      domains:         [],
      excludedDomains: [],
      unsupported:     false,
      useRegex:        false,
    };

    if (!optionsPart) return result;

    const parts = optionsPart.split(',');

    for (const part of parts) {
      const opt = part.trim().toLowerCase();

      if (!opt) continue;

      // Skip rules that modify headers or redirect — complex, Phase 7+
      if (opt === 'redirect' || opt.startsWith('redirect=') ||
          opt === 'csp'      || opt.startsWith('csp=') ||
          opt === 'rewrite'  || opt.startsWith('rewrite=')) {
        result.unsupported = true;
        return result;
      }

      // Skip rules requiring JS injection
      if (opt === 'inline-script' || opt === 'inline-font') {
        result.unsupported = true;
        return result;
      }

      // Resource type options
      if (RESOURCE_TYPE_MAP[opt]) {
        result.resourceTypes.push(RESOURCE_TYPE_MAP[opt]);
        continue;
      }

      // Negated resource types (e.g. ~script means "not script")
      if (opt.startsWith('~') && RESOURCE_TYPE_MAP[opt.slice(1)]) {
        // We handle this by using all types minus the excluded one
        // For now, skip the negation and use all types (safe default)
        continue;
      }

      // Domain option: domain=example.com|~other.com
      if (opt.startsWith('domain=')) {
        const domainList = opt.slice(7).split('|');
        for (const d of domainList) {
          if (d.startsWith('~')) {
            result.excludedDomains.push(d.slice(1));
          } else {
            result.domains.push(d);
          }
        }
        continue;
      }

      // Known ignorable options (don't affect DNR behavior)
      const ignorable = [
        'third-party', 'first-party', '3p', '1p',
        'important', 'match-case', 'collapse', 'generichide',
        'ghide', 'elemhide', 'ehide', 'specifichide',
        'popup', 'empty', 'mp4',
      ];
      if (ignorable.includes(opt) || ignorable.includes(opt.replace('~', ''))) {
        continue;
      }

      // If we see an option we don't recognize, skip the whole rule
      // to avoid incorrect behavior
      result.unsupported = true;
      return result;
    }

    return result;
  },

  // ── Private: Pattern Conversion ───────────────────────────────────────────

  /**
   * Convert an Adblock Plus URL pattern to a Chrome DNR urlFilter string.
   *
   * DNR urlFilter special characters:
   *   ||  — domain anchor (matches at the start of the domain component)
   *   |   — URL anchor (matches at start or end of URL)
   *   ^   — separator character (matches /, ?, &, = or end of URL)
   *   *   — wildcard (matches any sequence of characters)
   *
   * This maps almost directly to Adblock syntax, so the conversion is
   * mostly pass-through, with a few normalization steps.
   */
  _convertPattern(pattern) {
    if (!pattern) return null;

    // Remove trailing wildcard — it means nothing in DNR
    let p = pattern.replace(/\*+$/, '');

    // If only anchors remain, the rule is too broad — skip
    if (p === '||' || p === '|' || p === '^' || p === '') return null;

    // DNR has a 2000 character limit on urlFilter
    if (p.length > 2000) return null;

    return p;
  },

  /**
   * Check if a pattern requires regex rather than plain urlFilter.
   */
  _needsRegex(urlFilter) {
    // Patterns with | in the middle (not at start/end) need special handling
    // Most Adblock patterns work fine as urlFilter — keep this conservative.
    return false;
  },

  /**
   * Convert a pattern to a DNR-safe regex string.
   * Returns null if conversion fails.
   */
  _toRegex(pattern) {
    try {
      // Escape regex special chars except the ones Adblock uses
      let r = pattern
        .replace(/[.+?{}[\]\\]/g, '\\$&')  // Escape regex metacharacters
        .replace(/\*/g, '.*')              // * → .*
        .replace(/\^/g, '(?:[/?&#]|$)')   // ^ → separator
        .replace(/^\|\|/, '(?:https?://(?:[^/]+\\.)?)')  // || → domain anchor
        .replace(/^\|/, '^')              // | at start → start anchor
        .replace(/\|$/, '$');             // | at end → end anchor

      // Validate the regex compiles
      new RegExp(r);
      return r;
    } catch {
      return null;
    }
  },

  // ── Deduplication ─────────────────────────────────────────────────────────

  /**
   * Remove duplicate DNR rules from an array.
   * Two rules are considered duplicates if they have the same urlFilter/regexFilter
   * and the same action type. We keep the first occurrence.
   *
   * @param {object[]} rules
   * @returns {object[]}
   */
  deduplicate(rules) {
    const seen = new Set();
    return rules.filter(rule => {
      const key = [
        rule.action.type,
        rule.condition.urlFilter    ?? '',
        rule.condition.regexFilter  ?? '',
        (rule.condition.resourceTypes ?? []).sort().join(','),
        (rule.condition.initiatorDomains ?? []).sort().join(','),
      ].join('|');

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Validate a DNR rule array for common issues.
   * Returns { valid: rule[], invalid: {rule, reason}[] }
   */
  validate(rules) {
    const valid   = [];
    const invalid = [];

    for (const rule of rules) {
      const reason = this._validateRule(rule);
      if (reason) {
        invalid.push({ rule, reason });
      } else {
        valid.push(rule);
      }
    }

    return { valid, invalid };
  },

  _validateRule(rule) {
    if (!rule.id || typeof rule.id !== 'number') return 'Missing or invalid id';
    if (!rule.priority || typeof rule.priority !== 'number') return 'Missing or invalid priority';
    if (!rule.action || !rule.action.type) return 'Missing action';
    if (!rule.condition) return 'Missing condition';

    const hasFilter = rule.condition.urlFilter || rule.condition.regexFilter;
    if (!hasFilter) return 'Missing urlFilter or regexFilter';

    if (rule.condition.urlFilter && rule.condition.urlFilter.length > 2000) {
      return 'urlFilter exceeds 2000 character limit';
    }

    return null; // Valid
  },
};
