'use strict';

const { Given, When, Then } = require('@cucumber/cucumber');
const assert   = require('assert/strict');
const fs       = require('fs');
const path     = require('path');
const fixtures = require('../support/fixtures');

const TEMPLATE = path.resolve(__dirname, '../../lib/opencode.json.template');

// ─── Given ───────────────────────────────────────────────────────────────────

Given('the tool corpus has been indexed with more than 3 tools', async function () {
  // ALL_FIXTURES has github(4) + notion(2) + playwright(2) + semgrep(1) + fetch(2) = 11 tools
  await this.seedCorpus(fixtures.ALL_FIXTURES);
});

Given('the configured retrieval.k is {int}', function (k) {
  this.writeConfig({ retrieval: { k } });
});

Given('the tool-retrieval MCP server is running', function () {
  // We call the handler directly — no real MCP server needed for unit tests.
});

Given('the one-shot session retrieves tools that do NOT include the tool-retrieval server', function () {
  // hits from github only — tool-retrieval is absent from retrieved set
  this.hits = [
    { server_name: 'github', tool_name: 'list_pull_requests', description: 'List PRs', score: 0.9 },
  ];
});

Given('an opencode session is active with no specific browser tools in context', function () {
  // Qualifier only — no setup needed; the session context is irrelevant to the
  // handler which reads from the corpus directly.
});

Given('the tool corpus has been indexed with the Playwright MCP server', async function () {
  await this.seedCorpus({ playwright: fixtures.PLAYWRIGHT_TOOLS });
});

// ─── When ─────────────────────────────────────────────────────────────────────

When('the agent calls search_tools with query {string}', async function (query) {
  await this.runSearchTools(query);
});

When('the agent calls search_tools with query {string} and k={int}', async function (query, k) {
  await this.runSearchTools(query, { k });
});

When('the agent calls search_tools with only a query argument', async function () {
  await this.runSearchTools('find available tools');
});

When('the agent calls search_tools with any query', async function () {
  await this.runSearchTools('any query');
});

When('the agent calls search_tools without a query argument', async function () {
  await this.runSearchTools(null);
});

When('the temp config permission rules are generated', function () {
  const { composeTempConfig } = require('../../src/retrieval/config-composer');
  this.composeTempResult = composeTempConfig(this.hits);
  this.tempConfigPaths.push(this.composeTempResult.tempPath);
  this.composedConfig = JSON.parse(fs.readFileSync(this.composeTempResult.tempPath, 'utf8'));
});

// ─── Then ─────────────────────────────────────────────────────────────────────

Then('the response contains a ranked list of MCP tools', function () {
  const result = this._searchToolsResult;
  assert.ok(result, 'Expected _searchToolsResult to be set');
  assert.equal(result.isError, false, `Expected isError: false, got: ${result.isError}`);
  const text = result.content?.[0]?.text ?? '';
  // Each entry has "server / tool_name  (relevance: X.XXX)"
  assert.ok(
    /relevance: \d+\.\d{3}/.test(text),
    `Expected ranked tool entries with relevance scores.\nActual:\n${text}`,
  );
});

Then('each entry includes the server name, tool name, relevance score, and description', function () {
  const text = this._searchToolsResult?.content?.[0]?.text ?? '';
  assert.ok(/relevance: \d+\.\d{3}/.test(text), 'Expected relevance scores');
  // Entries have the pattern "server / tool_name"
  assert.ok(
    /\w+ \/ \w+/.test(text),
    `Expected "server / tool_name" entries.\nActual:\n${text}`,
  );
});

Then('the results are ordered by descending relevance score', function () {
  const text = this._searchToolsResult?.content?.[0]?.text ?? '';
  const scores = [...text.matchAll(/relevance: (\d+\.\d+)/g)].map(m => parseFloat(m[1]));
  assert.ok(scores.length > 0, 'Expected at least one relevance score in results');
  for (let i = 1; i < scores.length; i++) {
    assert.ok(
      scores[i] <= scores[i - 1],
      `Expected descending scores, but ${scores[i - 1]} → ${scores[i]} at position ${i}`,
    );
  }
});

Then('the response contains at most {int} tools', function (maxCount) {
  const text = this._searchToolsResult?.content?.[0]?.text ?? '';
  const count = [...text.matchAll(/relevance: \d+\.\d{3}/g)].length;
  assert.ok(
    count <= maxCount,
    `Expected at most ${maxCount} tools in response, got ${count}.\nActual:\n${text}`,
  );
});

Then('the response text instructs the user to run {string}', function (cmd) {
  const text = this._searchToolsResult?.content?.[0]?.text ?? '';
  assert.ok(
    text.includes(cmd),
    `Expected response to mention "${cmd}".\nActual:\n${text}`,
  );
});

Then(/^isError is false \(this is a graceful informational response\)$/, function () {
  assert.equal(
    this._searchToolsResult?.isError,
    false,
    `Expected isError: false, got: ${this._searchToolsResult?.isError}`,
  );
});

Then('the response has isError set to true', function () {
  assert.equal(
    this._searchToolsResult?.isError,
    true,
    `Expected isError: true, got: ${this._searchToolsResult?.isError}`,
  );
});

Then('the error message states that the query argument is required', function () {
  const text = this._searchToolsResult?.content?.[0]?.text ?? '';
  assert.ok(
    text.toLowerCase().includes('required'),
    `Expected "required" in error text.\nActual: "${text}"`,
  );
});

Then('no deny rule is emitted for the {string} server', function (serverName) {
  const perms = this.composedConfig?.permission ?? {};
  const key   = `mcp_${serverName}_*`;
  assert.ok(
    !(key in perms),
    `Expected no deny rule for "${serverName}", but found: "${perms[key]}"`,
  );
});

Then('the agent can still call search_tools during the session', function () {
  // Follows from "no deny rule" — no deny = tool is accessible.
  // Re-assert for clarity.
  const perms = this.composedConfig?.permission ?? {};
  const key   = 'mcp_tool-retrieval_*';
  assert.ok(
    !(key in perms),
    `Expected tool-retrieval to be accessible (no deny rule), but found: "${perms[key]}"`,
  );
});

Then('at least one tool from the {string} server appears in the results', function (serverName) {
  const text = this._searchToolsResult?.content?.[0]?.text ?? '';
  assert.ok(
    text.includes(`${serverName} /`),
    `Expected a tool from "${serverName}" in results.\nActual:\n${text}`,
  );
});

// ─── Server-wiring When ────────────────────────────────────────────────────────

When('the MCP server is configured with a mock SDK', async function () {
  await this.runStartServer();
});

When('the MCP server handles a list-tools request via in-memory transport', async function () {
  await this.runWireListTools();
});

When('the MCP server handles a call-tool request for {string} via in-memory transport',
  async function (toolName) {
    await this.runWireCallTool(toolName, { query: 'test query' });
  },
);

// ─── Server-wiring Then ────────────────────────────────────────────────────────

Then('setRequestHandler was called twice', function () {
  assert.equal(
    this._serverCalls?.length,
    2,
    `Expected setRequestHandler to be called exactly 2 times, got: ${this._serverCalls?.length}`,
  );
});

Then('the list-tools handler schema is a valid Zod schema', function () {
  const schema = this._serverCalls?.[0]?.schema;
  assert.ok(
    typeof schema?.parse === 'function',
    'Expected list-tools schema to be a Zod schema with a .parse() method; ' +
    'got a plain object — this is the bug: setRequestHandler needs a Zod schema, not { method: "..." }',
  );
  const result = schema.safeParse({ method: 'tools/list', params: {} });
  assert.ok(
    result.success,
    `Expected list-tools schema to accept a { method: "tools/list" } request.\n` +
    `safeParse error: ${JSON.stringify(result.error)}`,
  );
});

Then('the call-tool handler schema is a valid Zod schema', function () {
  const schema = this._serverCalls?.[1]?.schema;
  assert.ok(
    typeof schema?.parse === 'function',
    'Expected call-tool schema to be a Zod schema with a .parse() method; ' +
    'got a plain object — this is the bug: setRequestHandler needs a Zod schema, not { method: "..." }',
  );
  const result = schema.safeParse({ method: 'tools/call', params: { name: 'search_tools', arguments: {} } });
  assert.ok(
    result.success,
    `Expected call-tool schema to accept a tools/call request.\n` +
    `safeParse error: ${JSON.stringify(result.error)}`,
  );
});

Then('the response contains a tool named {string}', function (toolName) {
  const tools = this._wireToolsList?.tools ?? [];
  const found = tools.find(t => t.name === toolName);
  assert.ok(
    found,
    `Expected a tool named "${toolName}" in the tools/list response.\n` +
    `Got: ${tools.map(t => t.name).join(', ') || '(empty)'}`,
  );
});

Then('the search_tools tool declares a required {string} input parameter', function (paramName) {
  const tools = this._wireToolsList?.tools ?? [];
  const tool  = tools.find(t => t.name === 'search_tools');
  assert.ok(tool, 'Expected search_tools to be present in tools/list response');
  const required = tool.inputSchema?.required ?? [];
  assert.ok(
    required.includes(paramName),
    `Expected "${paramName}" to be in inputSchema.required.\nGot: ${JSON.stringify(required)}`,
  );
});

Then('the response is a valid CallToolResult with a content array', function () {
  const result = this._wireCallResult;
  assert.ok(result, 'Expected _wireCallResult to be set (tools/call produced no response)');
  assert.ok(
    Array.isArray(result.content),
    `Expected result.content to be an array.\nGot: ${JSON.stringify(result)}`,
  );
  assert.ok(result.content.length > 0, 'Expected result.content to be non-empty');
});

Then('the content text is a non-empty string', function () {
  const text = this._wireCallResult?.content?.[0]?.text;
  assert.ok(
    typeof text === 'string' && text.trim().length > 0,
    `Expected content[0].text to be a non-empty string.\nGot: ${JSON.stringify(text)}`,
  );
});
