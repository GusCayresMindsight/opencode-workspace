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
 *
 * Exports:
 *   createMcpServer(sdk) — builds and returns a configured Server instance.
 *                          Accepts SDK dependencies explicitly so it can be
 *                          unit-tested with a mock Server (no stdio transport).
 *   startServer()        — loads the real SDK, calls createMcpServer, attaches
 *                          a StdioServerTransport, and connects.  Called by
 *                          bin/cli.js for the mcp-serve command.
 */

const { handleSearchTools } = require('./search-tools-handler');

// ── server factory ────────────────────────────────────────────────────────────

/**
 * Create and configure the MCP Server instance.
 *
 * Accepts the SDK constructors/schemas as explicit parameters so this function
 * can be unit-tested without spawning a real stdio transport.
 *
 * @param {object} sdk
 * @param {Function} sdk.Server                   - Server constructor
 * @param {object}  sdk.ListToolsRequestSchema     - Zod schema for tools/list
 * @param {object}  sdk.CallToolRequestSchema      - Zod schema for tools/call
 * @returns {object} configured MCP Server instance
 */
function createMcpServer({ Server, ListToolsRequestSchema, CallToolRequestSchema }) {
  const server = new Server(
    { name: 'tool-retrieval', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  // ── tool list ─────────────────────────────────────────────────────────────
  server.setRequestHandler(
    ListToolsRequestSchema,
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
    CallToolRequestSchema,
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

  return server;
}

// ── transport entry point ─────────────────────────────────────────────────────

/**
 * Load the real MCP SDK, build the server via createMcpServer(), attach a
 * StdioServerTransport, and connect.
 *
 * Called explicitly by bin/cli.js for the `mcp-serve` command — NOT invoked
 * automatically at module load time so that unit tests can safely require()
 * this module and call createMcpServer() without triggering stdio binding.
 */
async function startServer() {
  const { Server }               = await import('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { ListToolsRequestSchema, CallToolRequestSchema } =
    await import('@modelcontextprotocol/sdk/types.js');

  const server    = createMcpServer({ Server, ListToolsRequestSchema, CallToolRequestSchema });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on('SIGTERM', () => server.close());
  process.on('SIGINT',  () => server.close());
}

module.exports = { createMcpServer, startServer };
