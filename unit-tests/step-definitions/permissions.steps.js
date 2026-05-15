'use strict';

const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert/strict');
const fs     = require('fs');
const path   = require('path');

const TEMPLATE = path.resolve(__dirname, '../../lib/opencode.json.template');

// ─── Given ───────────────────────────────────────────────────────────────────

Given(/^the workspace template defines servers: (.+)$/, function (serverList) {
  const requested = serverList.split(',').map(s => s.trim());
  const template  = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  for (const s of requested) {
    assert.ok(s in (template.mcp || {}), `Template is missing server "${s}"`);
  }
  // Store for use by When step
  this._templateServers = Object.keys(template.mcp || {});
});

Given('retrieval returns tools only from {string}', function (serverName) {
  this.hits = [
    { server_name: serverName, tool_name: 'dummy_tool', description: 'dummy', score: 0.9 },
  ];
});

Given('retrieval returns tools from every configured server', function () {
  const template = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  this.hits = Object.keys(template.mcp || {}).map(s => ({
    server_name: s, tool_name: 'dummy_tool', description: 'dummy', score: 0.5,
  }));
});

Given('retrieval returns tools from {string}', function (serverName) {
  this.hits = [
    { server_name: serverName, tool_name: 'dummy_tool', description: 'dummy', score: 0.9 },
  ];
});

Given('retrieval returns no tools from {string}', function (serverName) {
  // Ensure hits contain tools from some OTHER server, not the specified one
  this.hits = [
    { server_name: 'github', tool_name: 'get_pull_request', description: 'Get a PR', score: 0.9 },
  ].filter(h => h.server_name !== serverName);
});

Given(/^the user's global OpenCode config contains "([^"]+)": "([^"]+)"$/, function (key, value) {
  this.writeUserPermissions({ [key]: value });
});

Given(/^the user's global OpenCode config already contains "([^"]+)": "([^"]+)"$/, function (key, value) {
  this.writeUserPermissions({ [key]: value });
});

Given('any retrieval result', function () {
  this.hits = [
    { server_name: 'github', tool_name: 'get_pull_request', description: 'Get a pull request', score: 0.9 },
  ];
});

Given('a server exposes ten tools', function () {
  this._tenToolServer = 'github';
  this.hits = [];   // set by next step
});

Given('retrieval returns exactly one of those ten tools', function () {
  this.hits = [
    { server_name: this._tenToolServer, tool_name: 'tool_0', description: 'Tool 0', score: 0.8 },
  ];
});

// ─── When ─────────────────────────────────────────────────────────────────────

When('the temp config is composed', function () {
  const { composeTempConfig } = require('../../src/retrieval/config-composer');
  this.composeTempResult = composeTempConfig(this.hits);
  this.tempConfigPaths.push(this.composeTempResult.tempPath);
  this.composedConfig = JSON.parse(fs.readFileSync(this.composeTempResult.tempPath, 'utf8'));
});

// ─── Then ─────────────────────────────────────────────────────────────────────

Then(/^the temp config contains "([^"]+)": "([^"]+)"$/, function (key, value) {
  const perms = this.composedConfig?.permission || {};
  assert.equal(
    perms[key],
    value,
    `Expected permission["${key}"] = "${value}", got: ${JSON.stringify(perms)}`,
  );
});

Then('the temp config contains no permission rule for {string}', function (serverName) {
  const perms = this.composedConfig?.permission || {};
  const key   = `mcp_${serverName}_*`;
  assert.ok(
    !(key in perms),
    `Expected no permission rule for "${serverName}", but found: "${perms[key]}"`,
  );
});

Then('the temp config adds no permission deny rules', function () {
  const perms    = this.composedConfig?.permission || {};
  const template = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  const allServers = Object.keys(template.mcp || {});

  for (const s of allServers) {
    const key = `mcp_${s}_*`;
    assert.ok(
      !(key in perms),
      `Expected no deny rule for "${s}" when all servers are retrieved, but found: "${perms[key]}"`,
    );
  }
});

Then(/^"([^"]+)": "([^"]+)" is present in the temp config$/, function (key, value) {
  const perms = this.composedConfig?.permission || {};
  assert.equal(
    perms[key],
    value,
    `Expected permission["${key}"] = "${value}", got: ${JSON.stringify(perms)}`,
  );
});

Then(/^"([^"]+)" appears exactly once in the permission map$/, function (key) {
  const perms = this.composedConfig?.permission || {};
  const occurrences = Object.keys(perms).filter(k => k === key).length;
  assert.equal(occurrences, 1, `Expected "${key}" exactly once in permissions, got ${occurrences}`);
});

Then('every generated permission entry uses the value {string}', function (expectedValue) {
  const perms = this.composedConfig?.permission || {};
  for (const [key, val] of Object.entries(perms)) {
    assert.equal(
      val,
      expectedValue,
      `Expected permission["${key}"] = "${expectedValue}", got "${val}"`,
    );
  }
});

Then('no {string} values are present among the generated entries', function (forbidden) {
  const perms = this.composedConfig?.permission || {};
  for (const [key, val] of Object.entries(perms)) {
    assert.notEqual(
      val,
      forbidden,
      `Found forbidden value "${forbidden}" for permission key "${key}"`,
    );
  }
});

Then('no deny rule is added for that server', function () {
  const perms = this.composedConfig?.permission || {};
  const key   = `mcp_${this._tenToolServer}_*`;
  assert.ok(
    !(key in perms),
    `Expected no deny rule for server "${this._tenToolServer}"`,
  );
});

Then('all ten of its tools remain accessible to opencode', function () {
  // There is no deny rule for the server (verified in the prior step).
  // Without a deny rule, all tools on that server are accessible.
  const perms = this.composedConfig?.permission || {};
  const key   = `mcp_${this._tenToolServer}_*`;
  assert.ok(!(key in perms));
});
