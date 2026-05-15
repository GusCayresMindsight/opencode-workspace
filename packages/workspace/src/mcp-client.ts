import path from "path"
import fs from "fs"
import os from "os"

const MCP_ENV_PATH = path.join(os.homedir(), ".local", "share", "opencode", "mcp.env")

// ─── env helpers ──────────────────────────────────────────────────────────────

export function loadMcpEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  if (!fs.existsSync(MCP_ENV_PATH)) return env
  for (const line of fs.readFileSync(MCP_ENV_PATH, "utf8").split("\n")) {
    const eq = line.indexOf("=")
    if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1)
  }
  return env
}

function resolveEnvVars(value: string, mcpEnv: Record<string, string>): string {
  const all = { ...process.env, ...mcpEnv }
  return String(value).replace(/\{env:([^}]+)\}/g, (_, name: string) => all[name] ?? "")
}

function resolveServerEnv(
  serverConfig: { environment?: Record<string, string> },
  mcpEnv: Record<string, string>,
): Record<string, string> {
  if (!serverConfig.environment) return {}
  return Object.fromEntries(
    Object.entries(serverConfig.environment).map(([k, v]) => [k, resolveEnvVars(v, mcpEnv)]),
  )
}

// ─── MCP tool listing ─────────────────────────────────────────────────────────

export interface McpTool {
  name: string
  description: string
  inputSchema: object
}

export interface McpServerConfig {
  type: "local" | "remote"
  command?: string[]
  url?: string
  environment?: Record<string, string>
}

/**
 * Connect to a single MCP server, call listTools(), then disconnect.
 */
export async function listToolsForServer(
  serverName: string,
  serverConfig: McpServerConfig,
  timeoutMs = 15_000,
): Promise<McpTool[]> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js")

  const mcpEnv = loadMcpEnv()
  const resolvedEnv = resolveServerEnv(serverConfig, mcpEnv)

  let transport: any

  if (serverConfig.type === "local") {
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js")
    const [command, ...args] = serverConfig.command!

    transport = new StdioClientTransport({
      command,
      args,
      env: {
        ...process.env,
        ...resolvedEnv,
      },
    })
  } else if (serverConfig.type === "remote") {
    const url = new URL(serverConfig.url!)
    try {
      const { StreamableHTTPClientTransport } = await import(
        "@modelcontextprotocol/sdk/client/streamableHttp.js"
      )
      transport = new StreamableHTTPClientTransport(url)
    } catch {
      const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js")
      transport = new SSEClientTransport(url)
    }
  } else {
    throw new Error(`Unknown MCP server type "${(serverConfig as any).type}" for server "${serverName}"`)
  }

  const client = new Client({ name: "ow-indexer", version: "1.0.0" }, { capabilities: {} })

  let timedOut = false
  const timer = setTimeout(async () => {
    timedOut = true
    try {
      await client.close()
    } catch {}
  }, timeoutMs)

  try {
    await client.connect(transport)
    const { tools } = await client.listTools()
    clearTimeout(timer)
    await client.close()
    return tools.map((t: any) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema ?? {},
    }))
  } catch (err) {
    clearTimeout(timer)
    try {
      await client.close()
    } catch {}
    if (timedOut) throw new Error(`Timed out after ${timeoutMs}ms`)
    throw err
  }
}
