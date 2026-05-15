'use strict';

const { spawnSync }           = require('child_process');
const { randomUUID }          = require('crypto');
const { loadConfig }          = require('../config');
const { openDb }              = require('../db');
const { getToolCount }        = require('../index/corpus');
const { search }              = require('../retrieval/search');
const { composeTempConfig, cleanupTempConfig, templateServers } = require('../retrieval/config-composer');
const { appendSession }       = require('../telemetry/sessions');

// ─── helpers ──────────────────────────────────────────────────────────────────

function dim(s)    { return `\x1b[2m${s}\x1b[0m`; }
function green(s)  { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }

// ─── passthrough (no retrieval) ───────────────────────────────────────────────

function runPassthrough(prompt, extraEnv = {}) {
  const result = spawnSync('opencode', ['run', prompt], {
    stdio:  'inherit',
    env:    { ...process.env, ...extraEnv },
  });
  if (result.error) {
    console.error(`opencode-workspace: failed to spawn opencode: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 0);
}

// ─── cmdOneShot ───────────────────────────────────────────────────────────────

/**
 * One-shot flow:
 *   1. Respect OPENCODE_WORKSPACE_RETRIEVAL=off kill-switch
 *   2. Check tool corpus exists
 *   3. Embed prompt → cosine search → top-K tools
 *   4. Compose temp config with deny rules
 *   5. Write telemetry
 *   6. Spawn `opencode run "<prompt>"` with OPENCODE_CONFIG pointing at temp file
 *   7. Cleanup temp file
 *
 * @param {string} prompt — the raw user prompt (joined args)
 */
async function cmdOneShot(prompt) {
  // ── kill-switch ──────────────────────────────────────────────────────────
  if (process.env.OPENCODE_WORKSPACE_RETRIEVAL === 'off') {
    runPassthrough(prompt);   // never returns
  }

  const config = loadConfig();

  // ── corpus check ─────────────────────────────────────────────────────────
  let corpusSize = 0;
  try {
    const { db } = openDb();
    corpusSize   = getToolCount(db);
  } catch { /* DB doesn't exist yet */ }

  if (corpusSize === 0) {
    console.log(
      yellow('opencode-workspace: tool corpus is empty.') +
      ' Run `opencode-workspace index` first.\n' +
      dim('Launching without tool filtering.'),
    );
    runPassthrough(prompt);   // never returns
  }

  // ── retrieval ─────────────────────────────────────────────────────────────
  const k = config.retrieval?.k ?? 10;
  process.stderr.write(dim(`Retrieving top-${k} tools for: "${prompt.slice(0, 60)}${prompt.length > 60 ? '…' : ''}"\n`));

  let hits;
  try {
    hits = await search(prompt, config, k);
  } catch (err) {
    console.warn(`opencode-workspace: retrieval failed (${err.message}). Launching without filtering.`);
    runPassthrough(prompt);   // never returns
  }

  // ── print retrieved tools ──────────────────────────────────────────────────
  if (hits.length > 0) {
    process.stderr.write(dim('Retrieved tools:\n'));
    for (const h of hits) {
      process.stderr.write(dim(`  ${h.score.toFixed(3)}  ${h.server_name}/${h.tool_name}\n`));
    }
    process.stderr.write('\n');
  }

  // ── generate temp config ──────────────────────────────────────────────────
  let tempPath, deniedServers;
  try {
    ({ tempPath, deniedServers } = composeTempConfig(hits));
  } catch (err) {
    console.warn(`opencode-workspace: could not compose temp config (${err.message}). Launching without filtering.`);
    runPassthrough(prompt);   // never returns
  }

  if (deniedServers.length > 0) {
    process.stderr.write(dim(`Suppressed servers: ${deniedServers.join(', ')}\n\n`));
  }

  // ── telemetry ─────────────────────────────────────────────────────────────
  try {
    appendSession({
      ts:              new Date().toISOString(),
      session_id:      randomUUID(),
      prompt,
      retrieved_tools: hits.map(h => ({
        server: h.server_name,
        tool:   h.tool_name,
        score:  h.score,
      })),
      corpus_size:     corpusSize,
      embedding_model: config.embedding?.model ?? 'Xenova/all-MiniLM-L6-v2',
      k,
    });
  } catch (err) {
    // Telemetry failures must never block the session
    console.warn(`opencode-workspace: telemetry write failed: ${err.message}`);
  }

  // ── spawn opencode run ────────────────────────────────────────────────────
  const result = spawnSync('opencode', ['run', prompt], {
    stdio: 'inherit',
    env: {
      ...process.env,
      OPENCODE_CONFIG: tempPath,
    },
  });

  // ── cleanup ───────────────────────────────────────────────────────────────
  cleanupTempConfig(tempPath);

  if (result.error) {
    console.error(`opencode-workspace: failed to spawn opencode: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 0);
}

module.exports = { cmdOneShot };
