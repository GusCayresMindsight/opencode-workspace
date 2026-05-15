'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');

const CONFIG_DIR  = path.join(os.homedir(), '.config', 'opencode-workspace');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/** Resolved defaults — every field that the rest of the code may read. */
const DEFAULTS = {
  embedding: {
    provider: 'local',            // 'local' | 'openai' | 'voyage' | 'cohere'
    model: 'Xenova/all-MiniLM-L6-v2',
    // apiKey: undefined          // read from env when needed
  },
  retrieval: {
    k: 10,
    strategy: 'topk',            // 'topk' | 'agent_first' | 'graph' | 'active'
  },
};

/**
 * Load ~/.config/opencode-workspace/config.json, merged on top of DEFAULTS.
 * Missing file → returns DEFAULTS unchanged.
 * Parse error → warns and returns DEFAULTS unchanged.
 *
 * @returns {typeof DEFAULTS}
 */
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return structuredClone(DEFAULTS);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    console.warn(`opencode-workspace: could not parse ${CONFIG_FILE}: ${e.message}`);
    console.warn('opencode-workspace: using defaults');
    return structuredClone(DEFAULTS);
  }
  return deepMerge(DEFAULTS, raw);
}

/** Shallow-recursive merge: override wins at each leaf. */
function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const v = override[key];
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      result[key] = deepMerge(base[key] || {}, v);
    } else {
      result[key] = v;
    }
  }
  return result;
}

module.exports = { loadConfig, CONFIG_DIR, CONFIG_FILE, DEFAULTS };
