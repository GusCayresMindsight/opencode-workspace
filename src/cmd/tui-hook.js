'use strict';

/**
 * TUI first-message retrieval hook — core logic.
 *
 * Extracted from lib/tool-retrieval.plugin.js so the behaviour can be unit-
 * tested with CommonJS tooling (proxyquire / sinon) without spinning up a real
 * OpenCode process.
 *
 * The OpenCode plugin (lib/tool-retrieval.plugin.js) imports this module via
 * createRequire(import.meta.url) and delegates its event handler to
 * createFirstMessageHandler().
 */

const { loadConfig }    = require('../config');
const { openDb }        = require('../db');
const { getToolCount }  = require('../index/corpus');
const { search: defaultSearch } = require('../retrieval/search');

// ─── formatting ───────────────────────────────────────────────────────────────

/**
 * Format retrieved hits as the "[Tool Retrieval]..." context block that gets
 * injected into the OpenCode session.
 *
 * @param {Array<{ server_name:string, tool_name:string, description:string, score:number }>} hits
 * @returns {string}
 */
function formatToolContext(hits) {
  const lines = [
    '[Tool Retrieval] Most relevant MCP tools for your request:',
    '',
  ];
  for (const h of hits) {
    lines.push(`  \u2022 ${h.server_name}/${h.tool_name}  (score: ${h.score.toFixed(3)})`);
    lines.push(`    ${h.description}`);
  }
  lines.push('', 'These tools are available. Use them if they help with the task.');
  return lines.join('\n');
}

// ─── core injection logic ─────────────────────────────────────────────────────

/**
 * Extract plain text from a message's parts array.
 *
 * @param {{ parts?: Array<{ type:string, text?:string }> }} message
 * @returns {string}
 */
function extractText(message) {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .filter(p => p.type === 'text')
    .map(p => p.text ?? '')
    .join(' ')
    .trim();
}

/**
 * Run retrieval for `text` and inject the results as a system context block
 * into the session via client.session.prompt({ noReply: true }).
 *
 * @param {{
 *   text:      string,
 *   sessionId: string,
 *   client:    object,      — OpenCode SDK client
 *   _searchFn: function?    — override for testing (defaults to real search())
 * }} opts
 * @returns {Promise<{ injected:boolean, hitCount?:number, reason?:string }>}
 */
async function handleFirstMessage({ text, sessionId, client, _searchFn }) {
  const searchFn = _searchFn ?? defaultSearch;
  const config   = loadConfig();
  const k        = config.retrieval?.k ?? 10;

  // ── corpus check ────────────────────────────────────────────────────────────
  let corpusSize = 0;
  try {
    const { db } = openDb();
    corpusSize   = getToolCount(db);
  } catch { /* DB not yet created */ }

  if (corpusSize === 0) {
    return { injected: false, reason: 'empty corpus' };
  }

  // ── retrieval ────────────────────────────────────────────────────────────────
  let hits;
  try {
    hits = await searchFn(text, config, k);
  } catch (err) {
    return { injected: false, reason: `search failed: ${err.message}` };
  }

  if (!hits || hits.length === 0) {
    return { injected: false, reason: 'no hits' };
  }

  // ── inject context ───────────────────────────────────────────────────────────
  await client.session.prompt({
    path: { id: sessionId },
    body: {
      noReply: true,
      parts:   [{ type: 'text', text: formatToolContext(hits) }],
    },
  });

  return { injected: true, hitCount: hits.length };
}

// ─── stateful event-handler factory ──────────────────────────────────────────

/**
 * Create an OpenCode plugin event handler that fires retrieval exactly once
 * per session (on the first user message).
 *
 * Returns an async function compatible with the `message.updated` plugin event.
 *
 * @param {{
 *   client:    object,    — OpenCode SDK client
 *   _searchFn: function?  — override for testing
 * }} opts
 * @returns {Function}
 */
function createFirstMessageHandler({ client, _searchFn } = {}) {
  // seenSessions is captured in the handler's closure — one Set per handler
  // instance, which is one Set per plugin lifecycle (i.e. per opencode session).
  const seenSessions = new Set();

  return async function onMessageUpdated(event) {
    try {
      const message = event?.message ?? event;
      if (!message) return;

      // Only act on user messages
      if (message.role !== 'user') return;

      const sessionId = message.sessionID ?? message.session_id;
      if (!sessionId) return;

      // Fire at most once per session
      if (seenSessions.has(sessionId)) return;
      seenSessions.add(sessionId);

      const text = extractText(message);
      if (!text) return;

      await handleFirstMessage({ text, sessionId, client, _searchFn });
    } catch {
      // Any failure must not surface to the user or interrupt the session
    }
  };
}

module.exports = { handleFirstMessage, createFirstMessageHandler, formatToolContext, extractText };
