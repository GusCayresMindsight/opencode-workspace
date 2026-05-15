'use strict';

/**
 * tool-retrieval MCP server
 *
 * A lightweight MCP stdio server that exposes a single tool:
 *
 *   search_tools({ query, k? })
 *     → Returns the top-K most relevant MCP tools from the local corpus,
 *       ranked by embedding cosine similarity.
 *
 * Launched by opencode-workspace via:
 *   "command": ["opencode-workspace", "mcp-serve"]
 *
 * Intended uses:
 *   1. The agent calls search_tools proactively when it believes it could
 *      use more or different MCP capabilities than are currently active.
 *   2. The TUI first-message hook (lib/tool-retrieval.plugin.js) calls
 *      opencode-workspace retrieve to seed initial context — this server
 *      provides the same capability as an always-on MCP tool.
 */

const { loadConfig }  = require('../config');
const { openDb }      = require('../db');
const { getToolCount } = require('../index/corpus');
const { search }      = require('../retrieval/search');

// ─── formatting ───────────────────────────────────────────────────────────────

/**
 * Format retrieved hits into a human-readable string the LLM can consume.
 *
 * @param {Array<{ server_name:string, tool_name:string, description:string, score:number }>} hits
 * @param {string} query   — echoed back so the agent sees what was searched
 * @returns {string}
 */
function formatResults(hits, query) {
  if (hits.length === 0) {
    return `No tools found matching: "${query}"\n\nThe tool corpus may be empty. Run: opencode-workspace index`;
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

// ─── server bootstrap ─────────────────────────────────────────────────────────

async function startServer() {
  const { Server }               = await import('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');

  const server = new Server(
    { name: 'tool-retrieval', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  // ── tool: search_tools ────────────────────────────────────────────────────
  server.setRequestHandler(
    { method: 'tools/list' },
    async () => ({
      tools: [
        {
          name: 'search_tools',
          description:
            'Search the local MCP tool corpus for tools relevant to a given context or task. ' +
            'Returns a ranked list of MCP tool names, servers, descriptions, and relevance scores. ' +
            'Call this when you believe additional or different MCP tools could help with the current task, ' +
            'or when you are unsure which server provides a needed capability.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description:
                  'A natural-language description of the capability or task you are looking for. ' +
                  'For example: "query a database", "browse GitHub pull requests", ' +
                  '"run browser automation", "search the web".',
              },
              k: {
                type: 'number',
                description: 'Maximum number of results to return (default: 10).',
              },
            },
            required: ['query'],
          },
        },
      ],
    }),
  );

  server.setRequestHandler(
    { method: 'tools/call' },
    async (request) => {
      const { name, arguments: args } = request.params;

      if (name !== 'search_tools') {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      const query = args?.query;
      if (!query || typeof query !== 'string' || !query.trim()) {
        return {
          content: [{ type: 'text', text: 'search_tools: "query" argument is required and must be a non-empty string.' }],
          isError: true,
        };
      }

      const config = loadConfig();
      const k = (typeof args?.k === 'number' && args.k > 0) ? Math.floor(args.k) : (config.retrieval?.k ?? 10);

      // Corpus availability check
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

      // Run retrieval
      let hits;
      try {
        hits = await search(query.trim(), config, k);
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
    },
  );

  // ── transport ─────────────────────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep the process alive — the server exits when stdin closes (opencode disconnects)
  process.on('SIGTERM', () => server.close());
  process.on('SIGINT',  () => server.close());
}

startServer().catch(err => {
  process.stderr.write(`tool-retrieval-server: fatal error: ${err.message}\n`);
  process.exit(1);
});
