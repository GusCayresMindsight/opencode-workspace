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
 * The handler logic lives in src/mcp/search-tools-handler.js (CommonJS) and
 * is imported here so it can be unit-tested independently of the MCP server
 * lifecycle.
 *
 * Intended uses:
 *   1. The agent calls search_tools proactively when it believes it could
 *      use more or different MCP capabilities than are currently active.
 *   2. Complements the TUI first-message hook (lib/tool-retrieval.plugin.js)
 *      by giving the agent on-demand access to the retrieval pipeline at any
 *      point in the conversation.
 */

const { handleSearchTools } = require('./search-tools-handler');

async function startServer() {
  const { Server }               = await import('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');

  const server = new Server(
    { name: 'tool-retrieval', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  // ── tool list ─────────────────────────────────────────────────────────────
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

  // ── tool call ─────────────────────────────────────────────────────────────
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

      return handleSearchTools(args);
    },
  );

  // ── transport ─────────────────────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on('SIGTERM', () => server.close());
  process.on('SIGINT',  () => server.close());
}

startServer().catch(err => {
  process.stderr.write(`tool-retrieval-server: fatal error: ${err.message}\n`);
  process.exit(1);
});
