'use strict';

/**
 * search_tools MCP tool handler — core logic.
 *
 * Extracted from src/mcp/tool-retrieval-server.js so the behaviour can be
 * unit-tested directly without spinning up a real MCP stdio server.
 *
 * The MCP server imports and delegates its tools/call handler to
 * handleSearchTools().
 */

const { loadConfig }   = require('../config');
const { openDb }       = require('../db');
const { getToolCount } = require('../index/corpus');
const { search: defaultSearch } = require('../retrieval/search');

// ─── formatting ───────────────────────────────────────────────────────────────

/**
 * Format retrieved hits into a human-readable string suitable for LLM context.
 *
 * @param {Array<{ server_name:string, tool_name:string, description:string, score:number }>} hits
 * @param {string} query  — echoed back so the agent sees what was searched
 * @returns {string}
 */
function formatResults(hits, query) {
  if (hits.length === 0) {
    return (
      `No tools found matching: "${query}"\n\n` +
      'The tool corpus may be empty. Run: opencode-workspace index'
    );
  }

  const lines = [
    `Top ${hits.length} MCP tool${hits.length === 1 ? '' : 's'} matching: "${query}"`,
    '',
  ];

  for (const h of hits) {
    lines.push(`${h.server_name} / ${h.tool_name}  (relevance: ${h.score.toFixed(3)})`);
    lines.push(`  ${h.description}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── handler ──────────────────────────────────────────────────────────────────

/**
 * Handle a search_tools tool call.
 *
 * @param {{ query:string, k?:number }} args
 * @param {{ _searchFn?:function }} [opts={}]  — pass _searchFn to override in tests
 * @returns {Promise<{ content: Array<{type:string,text:string}>, isError:boolean }>}
 */
async function handleSearchTools(args, opts = {}) {
  const searchFn = opts._searchFn ?? defaultSearch;
  const { query, k: kArg } = args ?? {};

  // ── validate ────────────────────────────────────────────────────────────────
  if (!query || typeof query !== 'string' || !query.trim()) {
    return {
      content: [{
        type: 'text',
        text: 'search_tools: "query" argument is required and must be a non-empty string.',
      }],
      isError: true,
    };
  }

  const config = loadConfig();
  const k = (typeof kArg === 'number' && kArg > 0)
    ? Math.floor(kArg)
    : (config.retrieval?.k ?? 10);

  // ── corpus check ────────────────────────────────────────────────────────────
  let corpusSize = 0;
  try {
    const { db } = openDb();
    corpusSize   = getToolCount(db);
  } catch { /* DB not yet created */ }

  if (corpusSize === 0) {
    return {
      content: [{
        type: 'text',
        text: 'The tool corpus is empty. Run `opencode-workspace index` to build it before searching.',
      }],
      isError: false,
    };
  }

  // ── retrieval ────────────────────────────────────────────────────────────────
  let hits;
  try {
    hits = await searchFn(query.trim(), config, k);
  } catch (err) {
    return {
      content: [{ type: 'text', text: `search_tools failed: ${err.message}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text', text: formatResults(hits, query.trim()) }],
    isError: false,
  };
}

module.exports = { handleSearchTools, formatResults };
