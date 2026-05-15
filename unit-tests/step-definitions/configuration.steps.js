'use strict';

const { Given, When, Then } = require('@cucumber/cucumber');
const assert   = require('assert/strict');
const path     = require('path');
const fixtures = require('../support/fixtures');

const SRC = path.resolve(__dirname, '../../src');

// ─── Given ───────────────────────────────────────────────────────────────────

Given('~\\/.config\\/opencode-workspace\\/config.json does not exist', function () {
  // The file is absent in the fresh temp HOME — nothing to do
});

Given('config.json sets {string} to {int}', function (keyPath, value) {
  const keys = keyPath.replace(/"/g, '').split('.');
  const obj  = {};
  let cur    = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  this.writeConfig(obj);
});

Given('config.json contains invalid JSON', function () {
  this.writeConfig('{ invalid json }');
  // writeConfig calls JSON.stringify — override with raw write
  const dir  = path.join(this.tmpHome, '.config', 'opencode-workspace');
  const file = path.join(dir, 'config.json');
  require('fs').writeFileSync(file, '{ bad json', 'utf8');
});

Given('config.json sets "embedding.provider" to {string}', function (provider) {
  this.writeConfig({ embedding: { provider } });
  this.embeddingConfig = { provider };
});

Given('OPENAI_API_KEY is not set in the environment', function () {
  delete process.env.OPENAI_API_KEY;
});

Given('"apiKey" is absent from config.json', function () {
  // Already handled — we only wrote 'provider' in the previous step
});

Given('config.json sets "retrieval.strategy" to {string}', function (strategy) {
  this.writeConfig({ retrieval: { strategy } });
});

Given('config.json sets only "retrieval.k" to {int}', function (k) {
  this.writeConfig({ retrieval: { k } });
});

// ─── When ─────────────────────────────────────────────────────────────────────

When('any command that uses embedding or retrieval runs', function () {
  // Flush + re-require config so it picks up our written file
  delete require.cache[require.resolve(path.join(SRC, 'config'))];
  const { loadConfig } = require(path.join(SRC, 'config'));
  this.loadedConfig = loadConfig();
});

When('any command that loads configuration runs', function () {
  delete require.cache[require.resolve(path.join(SRC, 'config'))];
  const { loadConfig } = require(path.join(SRC, 'config'));
  this.loadedConfig = loadConfig();
});

When('a command that creates an embedder runs', function () {
  const { createEmbedder } = require(path.join(SRC, 'index', 'embedder'));
  try {
    this.embeddingInstance = createEmbedder(this.embeddingConfig || { provider: 'local' });
    this.thrownError = null;
  } catch (e) {
    this.thrownError = e;
  }
});

When('configuration is loaded', function () {
  delete require.cache[require.resolve(path.join(SRC, 'config'))];
  const { loadConfig } = require(path.join(SRC, 'config'));
  this.loadedConfig = loadConfig();
});

When('the user runs a one-shot prompt', async function () {
  // Flush config from cache so the written config.json takes effect
  delete require.cache[require.resolve(path.join(SRC, 'config'))];
  await this.seedCorpus(fixtures.ALL_FIXTURES);
  await this.runOneShot('test prompt');
});

// ─── Then ─────────────────────────────────────────────────────────────────────

Then('the embedding provider is {string}', function (provider) {
  assert.equal(this.loadedConfig?.embedding?.provider, provider);
});

Then('the embedding model is {string}', function (model) {
  assert.equal(this.loadedConfig?.embedding?.model, model);
});

Then('K is {int}', function (k) {
  assert.equal(this.loadedConfig?.retrieval?.k, k);
});

Then('the retrieval strategy is {string}', function (strategy) {
  assert.equal(this.loadedConfig?.retrieval?.strategy, strategy);
});

Then('at most {int} tools are returned by retrieval', function (maxK) {
  assert.ok(
    this.retrievedTools.length <= maxK,
    `Expected at most ${maxK} tools, got ${this.retrievedTools.length}`,
  );
});

Then('two warning lines are printed to stdout', function () {
  // loadConfig prints exactly 2 console.warn lines on parse failure
  assert.equal(
    this.warnings.length,
    2,
    `Expected 2 warnings, got ${this.warnings.length}: ${JSON.stringify(this.warnings)}`,
  );
});

Then('the command continues with default configuration', function () {
  assert.equal(this.loadedConfig?.embedding?.provider, 'local');
  assert.equal(this.loadedConfig?.retrieval?.k,        10);
});

Then('the command exits with an error message about the missing API key', function () {
  assert.ok(
    this.thrownError,
    'Expected an error to have been thrown',
  );
  const msg = this.thrownError.message.toLowerCase();
  assert.ok(
    msg.includes('api key') || msg.includes('apikey') || msg.includes('openai_api_key'),
    `Expected error about API key, got: ${this.thrownError.message}`,
  );
});

Then('the command exits with the error {string}', function (expectedMsg) {
  assert.ok(this.thrownError, 'Expected an error to have been thrown');
  assert.ok(
    this.thrownError.message.includes(expectedMsg),
    `Expected error "${expectedMsg}", got: "${this.thrownError.message}"`,
  );
});

Then('the command exits with an error containing {string}', function (fragment) {
  // The error may come from runOneShot or cmdOneShot itself.
  // For strategy errors, search() throws and cmdOneShot re-emits it.
  const err = this.thrownError || (this.warnings.some(w => w.includes(fragment)) ? { message: fragment } : null);
  assert.ok(
    err || this.warnings.some(w => w.toLowerCase().includes(fragment.toLowerCase())),
    `Expected error or warning containing "${fragment}". warnings: ${JSON.stringify(this.warnings)}`,
  );
});

Then('"embedding.provider" is still {string}', function (provider) {
  assert.equal(this.loadedConfig?.embedding?.provider, provider);
});

Then('"retrieval.k" is {int}', function (k) {
  assert.equal(this.loadedConfig?.retrieval?.k, k);
});
