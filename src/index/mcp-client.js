'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');

const MCP_ENV_PATH = path.join(os.homedir(), '.local', 'share', 'opencode', 'mcp.env');

// ─── env helpers ──────────────────────────────────────────────────────────────

/** Load ~/.local/share/opencode/mcp.env → { KEY: value } */
function loadMcpEnv() {
  const env = {};
  if (!fs.existsSync(MCP_ENV_PATH)) return env;
  for (const line of fs.readFileSync(MCP_ENV_PATH, 'utf8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return env;
}

/**
 * Resolve OpenCode's `{env:VAR_NAME}` interpolation syntax.
 * Falls back to empty string for missing vars (same as OpenCode behaviour).
 */
function resolveEnvVars(value, mcpEnv) {
  const all = { ...process.env, ...mcpEnv };
  return String(value).replace(/\{env:([^}]+)\}/g, (_, name) => all[name] ?? '');
}

function resolveServerEnv(serverConfig, mcpEnv) {
  if (!serverConfig.environment) return {};
  return Object.fromEntries(
    Object.entries(serverConfig.environment).map(([k, v]) => [k, resolveEnvVars(v, mcpEnv)]),
  );
}

// ─── MCP connection ───────────────────────────────────────────────────────────

/**
 * Connect to a single MCP server, call listTools(), then disconnect.
 *
 * @param {string} serverName  — key from the mcp config (used in error messages)
 * @param {object} serverConfig — one entry from the template's "mcp" section
 * @param {number} [timeoutMs=15_000]
 * @returns {Promise<Array<{name:string, description:string, inputSchema:object}>>}
 */
async function listToolsForServer(serverName, serverConfig, timeoutMs = 15_000) {
  const { Client }   = await import('@modelcontextprotocol/sdk/client/index.js');

  const mcpEnv    = loadMcpEnv();
  const resolvedEnv = resolveServerEnv(serverConfig, mcpEnv);

  let transport;

  if (serverConfig.type === 'local') {
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const [command, ...args] = serverConfig.command;

    transport = new StdioClientTransport({
      command,
      args,
      env: {
        ...process.env,
        ...resolvedEnv,
      },
    });
  } else if (serverConfig.type === 'remote') {
    // Try the newer Streamable HTTP transport first; fall back to legacy SSE.
    const url = new URL(serverConfig.url);
    try {
      const { StreamableHTTPClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/streamableHttp.js'
      );
      transport = new StreamableHTTPClientTransport(url);
    } catch {
      const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
      transport = new SSEClientTransport(url);
    }
  } else {
    throw new Error(`Unknown MCP server type "${serverConfig.type}" for server "${serverName}"`);
  }

  const client = new Client(
    { name: 'opencode-workspace-indexer', version: '1.0.0' },
    { capabilities: {} },
  );

  // Hard timeout: close the transport if the server never responds
  let timedOut = false;
  const timer = setTimeout(async () => {
    timedOut = true;
    try { await client.close(); } catch { /* ignore */ }
  }, timeoutMs);

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    clearTimeout(timer);
    await client.close();
    return tools.map(t => ({
      name:        t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema ?? {},
    }));
  } catch (err) {
    clearTimeout(timer);
    try { await client.close(); } catch { /* ignore */ }
    if (timedOut) throw new Error(`Timed out after ${timeoutMs}ms`);
    throw err;
  }
}

module.exports = { listToolsForServer, loadMcpEnv };
