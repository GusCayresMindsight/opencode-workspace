import path from "path"
import fs from "fs"
import os from "os"
import { loadConfig } from "../config"
import { openDb } from "../db"
import { listToolsForServer, type McpServerConfig } from "../mcp-client"
import { createEmbedder } from "../embedder"
import { upsertTool, getToolHash, getToolCount } from "../corpus"
import { hashTool } from "../hash"
import type { Database } from "bun:sqlite"
import type { Embedder } from "../embedder"

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`

// ─── MCP config resolution ────────────────────────────────────────────────────

/**
 * Resolve which MCP servers to index.
 * Priority: OPENCODE_CONFIG env → .opencode/opencode.json → ~/.config/opencode/opencode.json
 */
function resolveMcpServers(): Record<string, McpServerConfig> {
  const candidates: string[] = []

  if (process.env.OPENCODE_CONFIG) {
    candidates.push(process.env.OPENCODE_CONFIG)
  }

  const projectConfig = path.join(process.cwd(), ".opencode", "opencode.json")
  if (fs.existsSync(projectConfig)) candidates.push(projectConfig)

  const globalConfig = path.join(os.homedir(), ".config", "opencode", "opencode.json")
  if (fs.existsSync(globalConfig)) candidates.push(globalConfig)

  for (const candidate of candidates) {
    try {
      const raw = JSON.parse(fs.readFileSync(candidate, "utf8"))
      if (raw.mcp && typeof raw.mcp === "object") {
        return raw.mcp
      }
    } catch {}
  }

  return {}
}

// ─── per-server indexing ──────────────────────────────────────────────────────

async function indexServer(
  serverName: string,
  serverConfig: McpServerConfig,
  db: Database,
  embedder: Embedder,
  force: boolean,
): Promise<{ indexed: number; skipped: number; failed: boolean; total?: number; error?: string }> {
  let tools: Awaited<ReturnType<typeof listToolsForServer>>
  try {
    tools = await listToolsForServer(serverName, serverConfig)
  } catch (err: any) {
    return { indexed: 0, skipped: 0, failed: true, error: err.message }
  }

  let indexed = 0,
    skipped = 0

  for (const tool of tools) {
    const hash = hashTool(tool.description, tool.inputSchema)
    const stored = getToolHash(db, serverName, tool.name)

    if (!force && stored === hash) {
      skipped++
      continue
    }

    const text = `${serverName} / ${tool.name}: ${tool.description}`
    const embedding = await embedder.embed(text)

    upsertTool(
      db,
      {
        server_name: serverName,
        tool_name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
        schema_hash: hash,
      },
      embedding,
    )

    indexed++
  }

  return { indexed, skipped, failed: false, total: tools.length }
}

// ─── cmdIndex ─────────────────────────────────────────────────────────────────

export async function cmdIndex(opts: { force?: boolean } = {}): Promise<void> {
  const force = !!opts.force

  // Suppress EPIPE from dying MCP child processes
  const epipeGuard = (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE" || err.code === "ECONNRESET") return
    process.nextTick(() => {
      throw err
    })
  }
  process.on("uncaughtException", epipeGuard)

  const servers = Object.entries(resolveMcpServers())

  if (servers.length === 0) {
    console.log("No MCP servers found in ow config. Run `ow` and configure MCP servers first.")
    console.log(
      "ow index reads from: OPENCODE_CONFIG env, .opencode/opencode.json, or ~/.config/opencode/opencode.json",
    )
    return
  }

  const config = loadConfig()
  const { db } = openDb()

  console.log(bold(`Indexing ${servers.length} MCP server(s)…`))
  if (force) console.log(yellow("  --force: re-embedding all tools"))

  const embedder = createEmbedder(config.embedding)

  // Warm up the embedding model
  process.stdout.write(dim("  Loading embedding model…"))
  await embedder.embed("warmup")
  process.stdout.write("\r" + " ".repeat(30) + "\r")

  let totalIndexed = 0,
    totalSkipped = 0,
    failedServers = 0

  const CONCURRENCY = 4
  for (let i = 0; i < servers.length; i += CONCURRENCY) {
    const batch = servers.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(([name, cfg]) => {
        process.stdout.write(`  ${name.padEnd(30)} connecting…\r`)
        return indexServer(name, cfg as McpServerConfig, db, embedder, force).then((r) => ({
          name,
          ...r,
        }))
      }),
    )

    for (const r of results) {
      if (r.failed) {
        console.log(`  ${yellow("⚠")} ${r.name.padEnd(28)} ${yellow("failed")}: ${r.error}`)
        failedServers++
      } else {
        const tag = r.indexed > 0 ? green(`+${r.indexed}`) : dim(`${r.total} tools`)
        const skip = r.skipped > 0 ? dim(` (${r.skipped} unchanged)`) : ""
        console.log(`  ${green("✓")} ${r.name.padEnd(28)} ${tag}${skip}`)
        totalIndexed += r.indexed
        totalSkipped += r.skipped
      }
    }
  }

  const total = getToolCount(db)
  console.log("")
  console.log(
    bold("Done.") +
      `  corpus: ${total} tools` +
      (totalIndexed > 0 ? `  (${green("+" + totalIndexed + " embedded")})` : "") +
      (totalSkipped > 0 ? dim(`  (${totalSkipped} unchanged)`) : "") +
      (failedServers > 0 ? `  ${yellow(failedServers + " server(s) failed")}` : ""),
  )

  if (failedServers === servers.length && servers.length > 0) {
    console.error("All servers failed — check your MCP configuration.")
    process.exit(1)
  }

  await new Promise<void>((r) => setTimeout(r, 200))
  process.removeListener("uncaughtException", epipeGuard)
}
