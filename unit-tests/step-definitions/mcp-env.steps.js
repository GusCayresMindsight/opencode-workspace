'use strict';

const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert/strict');
const fs     = require('fs');
const path   = require('path');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Absolute path to mcp.env inside the scenario's isolated HOME. */
function mcpEnvPath(home) {
  return path.join(home, '.local', 'share', 'opencode', 'mcp.env');
}

/** Parse a mcp.env file's content into a plain object. */
function parseEnvFile(content) {
  const entries = {};
  for (const line of content.split('\n')) {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      entries[line.slice(0, eqIdx)] = line.slice(eqIdx + 1);
    }
  }
  return entries;
}

/** Write an entries object to mcp.env, creating the directory if needed. */
function writeEnvEntries(home, entries) {
  const filePath = mcpEnvPath(home);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const output = Object.entries(entries).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(filePath, output, 'utf8');
}

// ─── Given ────────────────────────────────────────────────────────────────────

Given('~\\/.local\\/share\\/opencode\\/ does not exist', function () {
  // The isolated temp HOME created by the Before hook has no .local/share/opencode.
  // Nothing to do — the directory is absent by default.
});

Given('~\\/.local\\/share\\/opencode\\/mcp.env contains:', function (docString) {
  const filePath = mcpEnvPath(this.tmpHome);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, docString.trim() + '\n', 'utf8');
});

Given('~\\/.local\\/share\\/opencode\\/mcp.env already contains {string}', function (entry) {
  const eqIdx = entry.indexOf('=');
  const key   = entry.slice(0, eqIdx);
  const value = entry.slice(eqIdx + 1);
  writeEnvEntries(this.tmpHome, { [key]: value });
});

// ─── When ─────────────────────────────────────────────────────────────────────

When('the mcp.env file is parsed', function () {
  const filePath = mcpEnvPath(this.tmpHome);
  const content  = fs.readFileSync(filePath, 'utf8');
  this._parsedEnv = parseEnvFile(content);
});

When('{string} is added to mcp.env', function (entry) {
  const eqIdx = entry.indexOf('=');
  const key   = entry.slice(0, eqIdx);
  const value = entry.slice(eqIdx + 1);
  const filePath = mcpEnvPath(this.tmpHome);

  let existing = {};
  if (fs.existsSync(filePath)) {
    existing = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
  }
  existing[key] = value;
  writeEnvEntries(this.tmpHome, existing);
  this._parsedEnv = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
});

When('{string} is written to mcp.env', function (entry) {
  const eqIdx = entry.indexOf('=');
  const key   = entry.slice(0, eqIdx);
  const value = entry.slice(eqIdx + 1);
  const filePath = mcpEnvPath(this.tmpHome);

  let existing = {};
  if (fs.existsSync(filePath)) {
    existing = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
  }
  existing[key] = value;
  writeEnvEntries(this.tmpHome, existing);
  this._parsedEnv = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
});

When('the mcp.env file is written', function () {
  // Write any single entry to exercise the directory-creation path.
  writeEnvEntries(this.tmpHome, { TEST_KEY: 'test_value' });
});

// ─── Then ─────────────────────────────────────────────────────────────────────

Then('{word} resolves to {string}', function (key, expectedValue) {
  assert.ok(
    this._parsedEnv,
    'No parsed env available — did you call "When the mcp.env file is parsed"?',
  );
  assert.equal(
    this._parsedEnv[key],
    expectedValue,
    `Expected ${key}="${expectedValue}", got ${key}="${this._parsedEnv[key]}"`,
  );
});

Then('both {word} and {word} are present in mcp.env', function (key1, key2) {
  assert.ok(
    Object.prototype.hasOwnProperty.call(this._parsedEnv, key1),
    `Expected "${key1}" to be present in mcp.env`,
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(this._parsedEnv, key2),
    `Expected "${key2}" to be present in mcp.env`,
  );
});

Then('there is only one {word} entry in mcp.env', function (key) {
  const filePath = mcpEnvPath(this.tmpHome);
  const content  = fs.readFileSync(filePath, 'utf8');
  const matches  = content.split('\n').filter(l => l.startsWith(key + '='));
  assert.equal(
    matches.length,
    1,
    `Expected exactly 1 line starting with "${key}=", found ${matches.length}: ${JSON.stringify(matches)}`,
  );
});

Then('the directory ~\\/.local\\/share\\/opencode\\/ is created automatically', function () {
  const dir = path.join(this.tmpHome, '.local', 'share', 'opencode');
  assert.ok(
    fs.existsSync(dir),
    `Expected directory ${dir} to exist after writing mcp.env`,
  );
});
