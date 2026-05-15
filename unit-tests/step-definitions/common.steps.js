'use strict';

const { Given, When, Then } = require('@cucumber/cucumber');
const assert   = require('assert/strict');
const fs       = require('fs');
const path     = require('path');
const fixtures = require('../support/fixtures');

// ─── Shared Given ─────────────────────────────────────────────────────────────

Given('the tool corpus has been indexed', async function () {
  await this.seedCorpus(fixtures.ALL_FIXTURES);
});

Given('the tool corpus has been indexed with the GitHub MCP server', async function () {
  await this.seedCorpus({ github: fixtures.GITHUB_TOOLS });
});

Given('the tool corpus has not been built', function () {
  // No seeding — DB file will be absent or empty after the Before hook flush
});

Given('OPENCODE_WORKSPACE_RETRIEVAL is set to {string}', function (value) {
  process.env.OPENCODE_WORKSPACE_RETRIEVAL = value;
});

Given('sessions.jsonl cannot be written', async function () {
  // Seed the corpus so retrieval succeeds and reaches appendSession
  await this.seedCorpus(fixtures.ALL_FIXTURES);
  // Make sessions.jsonl a directory so appendFileSync throws EISDIR
  const dir  = path.join(this.tmpHome, '.config', 'opencode-workspace');
  const file = path.join(dir, 'sessions.jsonl');
  fs.mkdirSync(dir,  { recursive: true });
  fs.mkdirSync(file);
});

// ─── Shared When ──────────────────────────────────────────────────────────────

When('the user runs {string}', async function (cmdLine) {
  // Strip the leading "opencode-workspace " prefix
  const args = cmdLine.replace(/^opencode-workspace\s*/, '').trim();

  if (args === 'index') {
    await this.runIndex({ force: false });
  } else if (args === 'index --force') {
    await this.runIndex({ force: true });
  } else if (args === 'stats') {
    await this.runStats({});
  } else if (args.startsWith('stats ')) {
    const m = args.match(/--last[= ](\d+)/);
    await this.runStats(m ? { last: m[1] } : {});
  } else {
    // Treat as a one-shot prompt (may be bare words or a quoted string)
    const prompt = args.replace(/^["']|["']$/g, '');
    await this.runOneShot(prompt);
  }
});

When('a retrieval session runs', async function () {
  await this.runOneShot('test retrieval session');
});

When('a new session completes', async function () {
  await this.runOneShot('test session completion prompt');
});

When('the user runs any one-shot prompt', async function () {
  await this.runOneShot('any prompt');
});

// ─── Shared Then ──────────────────────────────────────────────────────────────

Then('exits with code 0', function () {
  assert.equal(this.exitCode, 0);
});

Then('exits with code 1', function () {
  assert.equal(this.exitCode, 1);
});

Then('a warning is printed', function () {
  assert.ok(
    this.warnings.length > 0,
    `Expected at least one console.warn call, got none. logs: ${JSON.stringify(this.logs)}`,
  );
});

Then('opencode is still spawned normally', function () {
  assert.ok(
    this.spawnedCalls.some(c => c.cmd === 'opencode' && c.args[0] === 'run'),
    'Expected opencode run to have been spawned',
  );
});

Then('"opencode run" is still spawned normally', function () {
  assert.ok(
    this.spawnedCalls.some(c => c.cmd === 'opencode' && c.args[0] === 'run'),
    'Expected opencode run to have been spawned',
  );
});

Then('"opencode run" is spawned without filtering', function () {
  const call = this.spawnedCalls.find(c => c.cmd === 'opencode' && c.args[0] === 'run');
  assert.ok(call, 'Expected opencode run to have been spawned');
  assert.ok(
    !call.env || !call.env.OPENCODE_CONFIG,
    `Expected OPENCODE_CONFIG to be absent (passthrough), but got: ${call.env?.OPENCODE_CONFIG}`,
  );
});

Then('no session is recorded in sessions.jsonl', function () {
  assert.equal(
    this.sessionsExist(),
    false,
    'Expected sessions.jsonl to be absent',
  );
});

Then('sessions.jsonl is not modified', function () {
  // Either the file doesn't exist, or it was unchanged from what we wrote in Given
  // We track the initial line count during the Given step
  const sessions = this.sessionsExist() ? this.readSessions() : [];
  assert.equal(
    sessions.length,
    this._sessionCountBefore ?? 0,
    `Expected session count to remain ${this._sessionCountBefore ?? 0}, got ${sessions.length}`,
  );
});
