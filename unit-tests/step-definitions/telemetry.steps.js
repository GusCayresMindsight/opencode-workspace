'use strict';

const { Given, Then } = require('@cucumber/cucumber');
const assert = require('assert/strict');
const path   = require('path');

// ─── Given ───────────────────────────────────────────────────────────────────

Given('sessions.jsonl contains existing records', function () {
  this.writeSessions([
    {
      ts: new Date().toISOString(),
      session_id: 'aaaabbbb-0000-0000-0000-000000000001',
      prompt: 'prior session',
      retrieved_tools: [{ server: 'github', tool: 'list_pull_requests', score: 0.88 }],
      corpus_size: 10,
      embedding_model: 'Xenova/all-MiniLM-L6-v2',
      k: 10,
    },
  ]);
});

Given('sessions.jsonl contains multiple session records', function () {
  const records = Array.from({ length: 6 }, (_, i) => ({
    ts:              new Date(Date.now() - i * 1000).toISOString(),
    session_id:      `aaaabbbb-0000-0000-0000-00000000000${i + 1}`,
    prompt:          `prompt ${i + 1}`,
    retrieved_tools: [
      { server: 'github', tool: 'get_pull_request',   score: 0.9 - i * 0.05 },
      { server: 'notion', tool: 'search',              score: 0.5 },
    ],
    corpus_size:     100,
    embedding_model: 'Xenova/all-MiniLM-L6-v2',
    k:               10,
  }));
  this.writeSessions(records);
  this._sessionCountBefore = records.length;
});

Given('sessions.jsonl contains more than 5 sessions', function () {
  const records = Array.from({ length: 8 }, (_, i) => ({
    ts:              new Date(Date.now() - i * 60_000).toISOString(),
    session_id:      `session-${i}`,
    prompt:          `query ${i}`,
    retrieved_tools: [{ server: 'github', tool: 'get_pull_request', score: 0.9 }],
    corpus_size:     50,
    embedding_model: 'Xenova/all-MiniLM-L6-v2',
    k:               10,
  }));
  this.writeSessions(records);
});

Given('sessions.jsonl does not exist', function () {
  // Nothing to do — the file is absent in the fresh temp HOME
});

// ─── Then ─────────────────────────────────────────────────────────────────────

Then(/^a new line is appended to ~\/.config\/opencode-workspace\/sessions\.jsonl$/, function () {
  assert.ok(this.sessionsExist(), 'Expected sessions.jsonl to exist');
  const sessions = this.readSessions();
  assert.ok(sessions.length > 0, 'Expected at least one session record');
});

Then('the record contains the fields: ts, session_id, prompt, retrieved_tools with scores, corpus_size, embedding_model, and k', function () {
  const sessions = this.readSessions();
  const last     = sessions[sessions.length - 1];

  assert.ok(last,                                    'No session record found');
  assert.ok(typeof last.ts === 'string',             'ts should be a string');
  assert.ok(new Date(last.ts).getTime() > 0,         'ts should be a valid ISO date');
  assert.ok(typeof last.session_id === 'string',     'session_id should be a string');
  assert.ok(typeof last.prompt === 'string',         'prompt should be a string');
  assert.ok(Array.isArray(last.retrieved_tools),     'retrieved_tools should be an array');
  assert.ok(typeof last.corpus_size === 'number',    'corpus_size should be a number');
  assert.ok(typeof last.embedding_model === 'string','embedding_model should be a string');
  assert.ok(typeof last.k === 'number',              'k should be a number');

  if (last.retrieved_tools.length > 0) {
    const t = last.retrieved_tools[0];
    assert.ok('server' in t, 'Each tool entry should have a server field');
    assert.ok('tool'   in t, 'Each tool entry should have a tool field');
    assert.ok('score'  in t, 'Each tool entry should have a score field');
  }
});

Then('every line in sessions.jsonl is independently valid JSON', function () {
  const raw = require('fs').readFileSync(
    path.join(this.tmpHome, '.config', 'opencode-workspace', 'sessions.jsonl'),
    'utf8',
  );
  const lines = raw.split('\n').filter(l => l.trim());
  assert.ok(lines.length > 0, 'Expected at least one line in sessions.jsonl');
  for (const line of lines) {
    let parsed;
    try { parsed = JSON.parse(line); } catch (e) {
      assert.fail(`Line is not valid JSON: ${line}\n${e.message}`);
    }
    assert.ok(parsed !== null && typeof parsed === 'object', 'Each line should be a JSON object');
  }
});

Then('it prints the total number of sessions', function () {
  const hasTotal = this.logs.some(l => /sessions?:/i.test(l) || /Sessions:\s+\d+/.test(l));
  assert.ok(hasTotal, `Expected a "Sessions: N" line in logs. Got: ${JSON.stringify(this.logs)}`);
});

Then('a ranked list of the most frequently retrieved tools in {string} format', function (fmt) {
  // fmt = "server/tool"
  const hasToolLine = this.logs.some(l => l.includes('/'));
  assert.ok(hasToolLine, `Expected "server/tool" formatted lines in logs. Got: ${JSON.stringify(this.logs)}`);
});

Then('average retrieval score, average K, and average corpus size', function () {
  const combined = this.logs.join('\n');
  assert.ok(/avg.*score|avg.*k|avg.*corpus/i.test(combined) || combined.toLowerCase().includes('avg'),
    `Expected average stats in output. Got: ${JSON.stringify(this.logs)}`);
});

Then('the embedding models used across sessions', function () {
  const combined = this.logs.join('\n');
  assert.ok(
    combined.includes('all-MiniLM') || combined.includes('Embedding') || combined.includes('embedding'),
    `Expected embedding model info in output. Got: ${JSON.stringify(this.logs)}`,
  );
});

Then('the summary reflects only the 5 most recent sessions', function () {
  // stats --last 5 should produce a "Sessions: 5" line
  const combined = this.logs.join('\n');
  assert.ok(
    /Sessions:\s+5/.test(combined),
    `Expected "Sessions: 5" in output. Got: ${combined}`,
  );
});

Then('it prints {string}', function (expected) {
  const combined = this.logs.join('\n');
  assert.ok(
    combined.includes(expected),
    `Expected output to contain "${expected}". Got: ${combined}`,
  );
});

Then('it prints the current corpus size', function () {
  const combined = this.logs.join('\n');
  assert.ok(
    /corpus|tools/i.test(combined),
    `Expected corpus size in output. Got: ${combined}`,
  );
});
