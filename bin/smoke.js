#!/usr/bin/env node
/**
 * Smoke test: run after `opencode-workspace index` to verify that the
 * embedding + retrieval pipeline produces sensible results.
 *
 * Exit 0 = pass, exit 1 = fail.
 *
 * Checks:
 *   1. Tool corpus is non-empty.
 *   2. Querying "list open pull requests on GitHub" returns at least one result.
 *   3. The top-1 result comes from the "github" server.
 */
'use strict';

const { openDb }     = require('../src/db');
const { getToolCount } = require('../src/index/corpus');
const { search }     = require('../src/retrieval/search');
const { loadConfig } = require('../src/config');

function pass(msg)  { console.log(`\x1b[32m  PASS\x1b[0m  ${msg}`); }
function fail(msg)  { console.error(`\x1b[31m  FAIL\x1b[0m  ${msg}`); process.exit(1); }

(async () => {
  console.log('opencode-workspace smoke test\n');

  // ── 1. corpus non-empty ───────────────────────────────────────────────────
  let corpusSize;
  try {
    const { db } = openDb();
    corpusSize   = getToolCount(db);
  } catch (e) {
    fail(`Could not open tool corpus: ${e.message}\n  Run: opencode-workspace index`);
  }

  if (corpusSize === 0) {
    fail('Tool corpus is empty. Run: opencode-workspace index');
  }
  pass(`Corpus contains ${corpusSize} tools`);

  // ── 2. retrieval returns results ──────────────────────────────────────────
  const query   = 'list open pull requests on GitHub';
  const config  = loadConfig();
  const results = await search(query, config, 5);

  if (results.length === 0) {
    fail(`No results returned for query: "${query}"`);
  }
  pass(`Query returned ${results.length} result(s)`);

  // ── 3. top-1 is a GitHub tool ─────────────────────────────────────────────
  const top = results[0];
  if (top.server_name !== 'github') {
    const got = `${top.server_name}/${top.tool_name} (score=${top.score.toFixed(3)})`;
    fail(`Expected top result from server "github", got: ${got}`);
  }
  pass(`Top result: github/${top.tool_name}  score=${top.score.toFixed(3)}`);

  console.log('\nAll smoke checks passed.');
})().catch(e => {
  console.error(`\x1b[31m  ERROR\x1b[0m  ${e.message}`);
  process.exit(1);
});
