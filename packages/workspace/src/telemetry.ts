import path from "path"
import fs from "fs"
import { CONFIG_DIR } from "./config"

const SESSIONS_FILE = path.join(CONFIG_DIR, "sessions.jsonl")

// ─── types ────────────────────────────────────────────────────────────────────

export interface SessionRecord {
  ts: string
  session_id: string
  prompt: string
  retrieved_tools: Array<{ server: string; tool: string; score: number }>
  corpus_size: number
  embedding_model: string
  k: number
}

export interface Stats {
  total: number
  toolFreq: Array<{ key: string; count: number }>
  avgScore: number | null
  avgK: number | null
  avgCorpus: number | null
  models: string[]
}

// ─── write ────────────────────────────────────────────────────────────────────

export function appendSession(data: SessionRecord): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  const line = JSON.stringify(data) + "\n"
  fs.appendFileSync(SESSIONS_FILE, line, "utf8")
}

// ─── read ─────────────────────────────────────────────────────────────────────

export function readSessions(last: number = Infinity): SessionRecord[] {
  if (!fs.existsSync(SESSIONS_FILE)) return []
  const lines = fs.readFileSync(SESSIONS_FILE, "utf8").split("\n")
  const parsed: SessionRecord[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      parsed.push(JSON.parse(line))
    } catch {}
  }
  if (last === Infinity || last >= parsed.length) return parsed
  return parsed.slice(-last)
}

// ─── compute stats ────────────────────────────────────────────────────────────

export function computeStats(sessions: SessionRecord[]): Stats {
  if (sessions.length === 0) {
    return { total: 0, toolFreq: [], avgScore: null, avgK: null, avgCorpus: null, models: [] }
  }

  const toolCounts = new Map<string, number>()
  let totalScore = 0,
    scoreCount = 0
  let totalK = 0,
    totalCorpus = 0
  const models = new Set<string>()

  for (const s of sessions) {
    if (s.embedding_model) models.add(s.embedding_model)
    if (typeof s.k === "number") totalK += s.k
    if (typeof s.corpus_size === "number") totalCorpus += s.corpus_size

    for (const t of s.retrieved_tools ?? []) {
      const key = `${t.server}/${t.tool}`
      toolCounts.set(key, (toolCounts.get(key) ?? 0) + 1)
      if (typeof t.score === "number") {
        totalScore += t.score
        scoreCount++
      }
    }
  }

  const toolFreq = [...toolCounts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)

  return {
    total: sessions.length,
    toolFreq,
    avgScore: scoreCount > 0 ? totalScore / scoreCount : null,
    avgK: sessions.length > 0 ? totalK / sessions.length : null,
    avgCorpus: sessions.length > 0 ? totalCorpus / sessions.length : null,
    models: [...models],
  }
}

export function formatStats(stats: Stats, topN = 15): string {
  if (stats.total === 0) return "No sessions recorded yet."

  const lines = [
    `Sessions:       ${stats.total}`,
    `Avg K:          ${stats.avgK?.toFixed(1) ?? "n/a"}`,
    `Avg corpus:     ${stats.avgCorpus?.toFixed(0) ?? "n/a"} tools`,
    `Avg top score:  ${stats.avgScore?.toFixed(3) ?? "n/a"}`,
    `Embedding:      ${stats.models.join(", ") || "n/a"}`,
    "",
    "Top retrieved tools:",
  ]

  for (const { key, count } of stats.toolFreq.slice(0, topN)) {
    lines.push(`  ${count.toString().padStart(4)}x  ${key}`)
  }

  return lines.join("\n")
}
