import { openDb } from "./db"
import { createEmbedder } from "./embedder"
import { getAllToolsWithEmbeddings, getToolsByIds, getToolCount, packF32 } from "./corpus"
import type { WorkspaceConfig } from "./config"

// ─── cosine similarity (brute-force) ─────────────────────────────────────────

function cosineSim(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

// ─── search implementations ───────────────────────────────────────────────────

export function bruteForceSearch(
  db: import("bun:sqlite").Database,
  queryVec: number[],
  k: number,
): Array<{ tool_id: number; score: number }> {
  const tools = getAllToolsWithEmbeddings(db)
  return tools
    .map((t) => ({ tool_id: t.id, score: cosineSim(queryVec, t.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

// ─── public API ───────────────────────────────────────────────────────────────

export interface SearchHit {
  server_name: string
  tool_name: string
  description: string
  score: number
}

/**
 * Embed `query` and return the top-K most relevant tools from the corpus.
 */
export async function search(
  query: string,
  config: WorkspaceConfig,
  kOverride?: number,
): Promise<SearchHit[]> {
  const strategy = config.retrieval?.strategy ?? "topk"

  if (strategy === "agent_first" || strategy === "graph" || strategy === "active") {
    throw new Error(`retrieval strategy "${strategy}": not implemented`)
  }

  const k = kOverride ?? config.retrieval?.k ?? 10
  const { db } = openDb()
  const corpus = getToolCount(db)

  if (corpus === 0) return []

  const embedder = createEmbedder(config.embedding ?? { provider: "local" })
  const queryVec = await embedder.embed(query)

  const hits = bruteForceSearch(db, queryVec, k)

  const byId = Object.fromEntries(
    getToolsByIds(
      db,
      hits.map((h) => h.tool_id),
    ).map((t) => [t.id, t]),
  )

  return hits
    .filter((h) => byId[h.tool_id])
    .map((h) => {
      const t = byId[h.tool_id]!
      return {
        server_name: t.server_name,
        tool_name: t.tool_name,
        description: t.description,
        score: h.score,
      }
    })
}

export { cosineSim }
