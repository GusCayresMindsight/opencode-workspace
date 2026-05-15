import { loadConfig } from "../config"
import { openDb } from "../db"
import { getToolCount } from "../corpus"
import { search, type SearchHit } from "../search"

// ─── formatting ───────────────────────────────────────────────────────────────

export function formatResults(hits: SearchHit[], query: string): string {
  if (hits.length === 0) {
    return `No tools found matching: "${query}"\n\nThe tool corpus may be empty. Run: ow corpus index`
  }

  const lines = [`Top ${hits.length} MCP tool${hits.length === 1 ? "" : "s"} matching: "${query}"`, ""]

  for (const h of hits) {
    lines.push(`${h.server_name} / ${h.tool_name}  (relevance: ${h.score.toFixed(3)})`)
    lines.push(`  ${h.description}`)
    lines.push("")
  }

  return lines.join("\n")
}

// ─── handler (extracted for testability) ─────────────────────────────────────

export interface McpToolResult {
  content: Array<{ type: string; text: string }>
  isError: boolean
}

/**
 * Core logic for the search_tools MCP tool call.
 * Extracted from the server so it can be tested without a real MCP transport.
 */
export async function handleSearchTools(
  args: { query?: string; k?: number },
  opts: { _searchFn?: typeof search; _corpusSizeFn?: () => number } = {},
): Promise<McpToolResult> {
  const searchFn = opts._searchFn ?? search
  const { query, k: kArg } = args ?? {}

  if (!query?.trim()) {
    return {
      content: [{ type: "text", text: 'search_tools: "query" argument is required.' }],
      isError: true,
    }
  }

  const config = loadConfig()
  const k = typeof kArg === "number" && kArg > 0 ? Math.floor(kArg) : (config.retrieval?.k ?? 10)

  const corpusSize = opts._corpusSizeFn
    ? opts._corpusSizeFn()
    : (() => { try { const { db } = openDb(); return getToolCount(db) } catch { return 0 } })()

  if (corpusSize === 0) {
    return {
      content: [{ type: "text", text: "The tool corpus is empty. Run `ow corpus index` to build it." }],
      isError: false,
    }
  }

  let hits: SearchHit[]
  try {
    hits = await searchFn(query.trim(), config, k)
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `search_tools failed: ${err.message}` }],
      isError: true,
    }
  }

  return {
    content: [{ type: "text", text: formatResults(hits, query.trim()) }],
    isError: false,
  }
}

// ─── MCP server ───────────────────────────────────────────────────────────────

export async function startMcpServer(): Promise<void> {
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js")
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js")
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import("@modelcontextprotocol/sdk/types.js")

  const server = new Server({ name: "ow-tool-retrieval", version: "1.0.0" }, { capabilities: { tools: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "search_tools",
        description:
          "Search the indexed MCP tool corpus using semantic similarity. " +
          "Call this proactively when you think you need a capability that may be provided by an MCP server " +
          "you haven't used yet, or when you are unsure which tool to use for a task.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Natural language description of the capability or task you need a tool for.",
            },
            k: {
              type: "number",
              description: "Maximum number of tools to return (default: 10).",
            },
          },
          required: ["query"],
        },
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    if (name !== "search_tools") {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      }
    }

    return handleSearchTools((args ?? {}) as { query?: string; k?: number })
  })

  const transport = new StdioServerTransport()

  process.on("SIGTERM", async () => {
    await server.close()
    process.exit(0)
  })
  process.on("SIGINT", async () => {
    await server.close()
    process.exit(0)
  })

  await server.connect(transport)
}
