'use strict';

const { loadConfig } = require('../config');
const { openDb }     = require('../db');
const { getToolCount } = require('../index/corpus');
const { search }     = require('../retrieval/search');

// ─── formatting helpers ───────────────────────────────────────────────────────

function dim(s)    { return `\x1b[2m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }

/**
 * Format a hit list as human-readable text lines.
 *
 * @param {Array<{ server_name:string, tool_name:string, description:string, score:number }>} hits
 * @returns {string}
 */
function formatHitsText(hits) {
  if (hits.length === 0) return 'No tools found.\n';
  const lines = hits.map(h =>
    `  ${h.score.toFixed(3)}  ${h.server_name}/${h.tool_name}: ${h.description}`,
  );
  return lines.join('\n') + '\n';
}

// ─── cmdRetrieve ──────────────────────────────────────────────────────────────

/**
 * Embed `query` against the tool corpus and print the top-K results.
 *
 * Options:
 *   --json      Emit a JSON array to stdout (default: human-readable text)
 *   --k N       Override the configured retrieval.k
 *
 * Exit codes:
 *   0  — results printed (even if corpus is empty)
 *   1  — unrecoverable error
 *
 * @param {string} query
 * @param {{ json?: boolean, k?: number }} [opts={}]
 */
async function cmdRetrieve(query, opts = {}) {
  if (!query || !query.trim()) {
    process.stderr.write('opencode-workspace retrieve: query must not be empty\n');
    process.exit(1);
  }

  const config = loadConfig();
  const k = opts.k ?? config.retrieval?.k ?? 10;

  // ── corpus check ─────────────────────────────────────────────────────────
  let corpusSize = 0;
  try {
    const { db } = openDb();
    corpusSize   = getToolCount(db);
  } catch { /* DB doesn't exist yet */ }

  if (corpusSize === 0) {
    process.stderr.write(
      yellow('opencode-workspace: tool corpus is empty.') +
      ' Run `opencode-workspace index` first.\n',
    );
    if (opts.json) {
      process.stdout.write('[]\n');
    }
    return;
  }

  // ── retrieval ─────────────────────────────────────────────────────────────
  process.stderr.write(
    dim(`Retrieving top-${k} tools for: "${query.slice(0, 60)}${query.length > 60 ? '…' : ''}"\n`),
  );

  let hits;
  try {
    hits = await search(query, config, k);
  } catch (err) {
    process.stderr.write(`opencode-workspace: retrieval failed (${err.message})\n`);
    if (opts.json) {
      process.stdout.write('[]\n');
    }
    return;
  }

  // ── output ────────────────────────────────────────────────────────────────
  if (opts.json) {
    process.stdout.write(JSON.stringify(hits, null, 2) + '\n');
  } else {
    process.stdout.write(formatHitsText(hits));
  }
}

module.exports = { cmdRetrieve, formatHitsText };
