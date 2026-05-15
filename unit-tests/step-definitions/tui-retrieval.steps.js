'use strict';

const { Given, When, Then } = require('@cucumber/cucumber');
const assert   = require('assert/strict');
const fixtures = require('../support/fixtures');

// ─── Given ───────────────────────────────────────────────────────────────────

Given(/^the ow-tool-retrieval plugin is installed in ~\/.config\/opencode\/plugins\/$/, function () {
  // The plugin file is tested via its underlying CommonJS module (tui-hook.js).
  // No file installation is required for unit tests.
});

Given('the ow-tool-retrieval plugin is installed', function () {
  // Same as above — no-op for unit tests.
});

Given('the tool corpus has been indexed with the GitHub and Notion MCP servers', async function () {
  await this.seedCorpus({ github: fixtures.GITHUB_TOOLS, notion: fixtures.NOTION_TOOLS });
});

// "tool corpus does not exist (index has not been run)" — DB is absent by default;
// reuse the existing 'the tool corpus does not exist' Given from common.steps.js.
Given(/^the tool corpus does not exist \(index has not been run\)$/, function () {
  // DB file absent by default in fresh temp HOME — no setup needed.
});

Given('the search function is configured to throw an error', function () {
  this._hookThrowSearch = true;
});

// ─── When ─────────────────────────────────────────────────────────────────────

When('the user opens an opencode TUI session via opencode-workspace', function () {
  // Initialise per-scenario state; actual hook fires in the next When step.
  this._tuiSessionId       = 'test-session-1';
  this._capturedInjections = [];
  this._hookHandler        = null;   // ensure a fresh handler is created
});

When('the user types their first message {string}', async function (text) {
  await this.runHook(text, this._tuiSessionId, {
    throwSearch: this._hookThrowSearch,
  });
});

When('the user sends a first message in a session', async function () {
  this._tuiSessionId       = 'dedup-session-1';
  this._capturedInjections = [];
  this._hookHandler        = null;
  await this.runHook('list open pull requests', this._tuiSessionId);
});

When('the user sends a second message in the same session', async function () {
  // Reuse the same handler (same seenSessions Set) — should NOT inject again.
  await this.runHook('another message about something else', this._tuiSessionId, {
    reuseHandler: true,
  });
});

When('the session receives an assistant message update', async function () {
  this._capturedInjections = [];
  this._hookHandler        = null;
  await this.runHook('assistant reply text', 'assistant-session-1', {
    role: 'assistant',
  });
});

When('the user opens an opencode TUI session and sends a first message', async function () {
  this._tuiSessionId       = 'silent-session-1';
  this._capturedInjections = [];
  this._hookHandler        = null;
  // Always soft-fails — errors must not propagate
  await this.runHook('any message here', this._tuiSessionId, {
    throwSearch: this._hookThrowSearch,
  });
});

When("the user's first message is {string}", async function (text) {
  this._tuiSessionId       = 'context-session-1';
  this._capturedInjections = [];
  this._hookHandler        = null;
  await this.runHook(text, this._tuiSessionId);
});

// ─── Then ─────────────────────────────────────────────────────────────────────

Then('the plugin detects the first user message in the session', function () {
  assert.ok(
    this._capturedInjections.length >= 1,
    'Expected at least one context injection (plugin should have detected the first user message)',
  );
});

Then('it calls {string} with the message text as the query', function (cmdDescription) {
  // _hookLastQuery is set by the _searchFn wrapper in world.runHook
  assert.ok(
    this._hookLastQuery && this._hookLastQuery.length > 0,
    `Expected a retrieval query to have been executed (cmdDescription: "${cmdDescription}")`,
  );
});

Then('it injects the retrieval results as a system context block via client.session.prompt', function () {
  assert.ok(
    this._capturedInjections.length >= 1,
    'Expected client.session.prompt to have been called with retrieval context',
  );
});

Then('the injected message has noReply set to true so no extra AI turn is triggered', function () {
  const first = this._capturedInjections[0];
  assert.ok(first, 'Expected at least one injection');
  assert.equal(
    first.body?.noReply,
    true,
    `Expected noReply: true in injected message body, got: ${JSON.stringify(first.body)}`,
  );
});

Then('the injected text begins with {string}', function (prefix) {
  const first = this._capturedInjections[0];
  assert.ok(first, 'Expected at least one injection');
  const text = first.body?.parts?.[0]?.text ?? '';
  assert.ok(
    text.startsWith(prefix),
    `Expected injected text to begin with "${prefix}".\nActual: "${text.slice(0, 80)}..."`,
  );
});

Then('the plugin only fires retrieval for the first message', function () {
  // After two messages in the same session, only one injection should have occurred
  assert.equal(
    this._capturedInjections.length,
    1,
    `Expected exactly 1 injection after two messages in the same session, got ${this._capturedInjections.length}`,
  );
});

Then('no context injection occurs for subsequent messages in the same session', function () {
  // Same assertion — injection count must be exactly 1 (first message only)
  assert.equal(
    this._capturedInjections.length,
    1,
    'Expected no additional injection for the second message in the same session',
  );
});

Then('the plugin calls {string} which exits with empty output', function (_label) {
  // corpus is empty → search returns [] → no injection
  assert.equal(
    this._capturedInjections.length,
    0,
    'Expected no context injection when corpus is empty',
  );
});

Then('no context injection is performed', function () {
  assert.equal(
    this._capturedInjections.length,
    0,
    `Expected no context injection, got ${this._capturedInjections.length}`,
  );
});

Then('the TUI session continues normally without errors', function () {
  // If runHook threw, the When step would have failed — reaching this Then
  // means no error propagated.  Assert that no exception was captured.
  assert.equal(
    this.thrownError,
    null,
    `Expected no error to propagate from the plugin, got: ${this.thrownError?.message}`,
  );
});

Then('the retrieve subprocess call fails', function () {
  // After refactor, "subprocess" is the in-process _searchFn.
  // If it threw, no injection occurred — verified by 'no context injection'.
  assert.equal(this._capturedInjections.length, 0);
});

Then('the plugin swallows the error silently', function () {
  // Error swallowed ↔ no exception propagated AND no injection occurred.
  assert.equal(this.thrownError, null, 'Expected silent swallow — no thrown error');
  assert.equal(this._capturedInjections.length, 0, 'Expected no injection after error');
});

Then('the plugin does not trigger retrieval', function () {
  assert.equal(
    this._capturedInjections.length,
    0,
    'Expected no retrieval injection for non-user message',
  );
});

Then('the injected context lists tools from the {string} server near the top', function (serverName) {
  const first = this._capturedInjections[0];
  assert.ok(first, 'Expected at least one injection');
  const text = first.body?.parts?.[0]?.text ?? '';
  assert.ok(
    text.includes(`${serverName}/`),
    `Expected injected context to mention "${serverName}/" tools.\nActual text:\n${text}`,
  );
});

Then('each entry shows the server name, tool name, relevance score, and description', function () {
  const first = this._capturedInjections[0];
  assert.ok(first, 'Expected at least one injection');
  const text = first.body?.parts?.[0]?.text ?? '';
  // Each injected entry has "server/tool_name  (score: 0.NNN)"
  assert.ok(
    /score: \d+\.\d{3}/.test(text),
    `Expected entries with "(score: X.XXX)" in injected context.\nActual text:\n${text}`,
  );
  // And a description line below each bullet
  assert.ok(
    text.includes('•'),
    'Expected bullet-point entries in injected context',
  );
});
