import { loadConfig } from "../config"
import { openDb } from "../db"
import { getToolCount } from "../corpus"
import { search, type SearchHit } from "../search"

// ─── formatting ───────────────────────────────────────────────────────────────

export function formatToolContext(hits: SearchHit[]): string {
  const lines = ["[Tool Retrieval] Most relevant MCP tools for your request:", ""]
  for (const h of hits) {
    lines.push(`  \u2022 ${h.server_name}/${h.tool_name}  (score: ${h.score.toFixed(3)})`)
    lines.push(`    ${h.description}`)
  }
  lines.push("", "These tools are available. Use them if they help with the task.")
  return lines.join("\n")
}

// ─── message text extraction ─────────────────────────────────────────────────

function extractText(message: { parts?: Array<{ type: string; text?: string }> }): string {
  const parts = Array.isArray(message.parts) ? message.parts : []
  return parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join(" ")
    .trim()
}

// ─── core injection logic ─────────────────────────────────────────────────────

export async function handleFirstMessage({
  text,
  sessionId,
  client,
  _searchFn,
  _corpusSizeFn,
}: {
  text: string
  sessionId: string
  client: any
  _searchFn?: typeof search
  _corpusSizeFn?: () => number
}): Promise<{ injected: boolean; hitCount?: number; reason?: string }> {
  const searchFn = _searchFn ?? search
  const config = loadConfig()
  const k = config.retrieval?.k ?? 10

  const corpusSize = _corpusSizeFn
    ? _corpusSizeFn()
    : (() => { try { const { db } = openDb(); return getToolCount(db) } catch { return 0 } })()

  if (corpusSize === 0) return { injected: false, reason: "empty corpus" }

  let hits: SearchHit[]
  try {
    hits = await searchFn(text, config, k)
  } catch (err: any) {
    return { injected: false, reason: `search failed: ${err.message}` }
  }

  if (!hits || hits.length === 0) return { injected: false, reason: "no hits" }

  await client.session.prompt({
    path: { id: sessionId },
    body: {
      noReply: true,
      parts: [{ type: "text", text: formatToolContext(hits) }],
    },
  })

  return { injected: true, hitCount: hits.length }
}

// ─── OpenCode plugin export ───────────────────────────────────────────────────

/**
 * Built-in tool-retrieval plugin for ow.
 *
 * Fires on the first user message per session, embeds the text,
 * retrieves the most relevant MCP tools, and injects them as
 * a system context block (noReply: true) before the LLM responds.
 */
export async function ToolRetrievalPlugin({ client }: { client: any }) {
  const seenSessions = new Set<string>()

  async function onMessageUpdated(event: any) {
    try {
      const message = event?.message ?? event
      if (!message) return
      if (message.role !== "user") return

      const sessionId = message.sessionID ?? message.session_id
      if (!sessionId) return
      if (seenSessions.has(sessionId)) return
      seenSessions.add(sessionId)

      const text = extractText(message)
      if (!text) return

      await handleFirstMessage({ text, sessionId, client })
    } catch {
      // Plugin failures must never surface to the user
    }
  }

  return { "message.updated": onMessageUpdated }
}
