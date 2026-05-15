'use strict';

const { When, Then } = require('@cucumber/cucumber');
const assert = require('assert/strict');
const fs     = require('fs');
const path   = require('path');

const TEMPLATE_PATH = path.resolve(__dirname, '../../lib/opencode.json.template');

// ─── When ─────────────────────────────────────────────────────────────────────

When('lib\\/opencode.json.template is read', function () {
  const raw         = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  this._template    = JSON.parse(raw);
  this._servers     = this._template.mcp || {};
  this._currentServer = null;
});

// ─── Then ─────────────────────────────────────────────────────────────────────

Then('a server named {string} is defined', function (name) {
  assert.ok(
    Object.prototype.hasOwnProperty.call(this._servers, name),
    `Expected server "${name}" in template. Found: [${Object.keys(this._servers).join(', ')}]`,
  );
  // Store for chained assertions in the same scenario.
  this._currentServer = this._servers[name];
});

Then('its type is {string}', function (expectedType) {
  assert.equal(
    this._currentServer.type,
    expectedType,
    `Expected type="${expectedType}", got "${this._currentServer.type}"`,
  );
});

Then('its command starts with {string}', function (prefix) {
  const cmd = this._currentServer.command;
  assert.ok(Array.isArray(cmd), `Expected "command" to be an array, got ${typeof cmd}`);
  assert.equal(
    cmd[0],
    prefix,
    `Expected command[0]="${prefix}", got "${cmd[0]}"`,
  );
});

Then('its command sequence is {string}', function (commaSeparated) {
  const expected = commaSeparated.split(',');
  const cmd      = this._currentServer.command;
  assert.ok(Array.isArray(cmd), `Expected "command" to be an array, got ${typeof cmd}`);
  assert.deepEqual(
    cmd,
    expected,
    `Expected command ${JSON.stringify(expected)}, got ${JSON.stringify(cmd)}`,
  );
});

Then('its url is {string}', function (expectedUrl) {
  assert.equal(
    this._currentServer.url,
    expectedUrl,
    `Expected url="${expectedUrl}", got "${this._currentServer.url}"`,
  );
});

Then('its environment references {string}', function (envRef) {
  const env = this._currentServer.environment;
  assert.ok(env, `Expected server to have an "environment" field`);
  const envStr = JSON.stringify(env);
  assert.ok(
    envStr.includes(envRef),
    `Expected environment to contain "${envRef}". Got: ${envStr}`,
  );
});
