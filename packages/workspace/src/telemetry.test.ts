/**
 * Tests for: docs/telemetry.feature
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, readFileSync, appendFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  appendSessionToFile,
  readSessionsFromFile,
  computeStats,
  formatStats,
  type SessionRecord,
} from "./telemetry"

let tmpDir: string
let sessionsFile: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ow-telemetry-test-"))
  sessionsFile = join(tmpDir, "sessions.jsonl")
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function makeRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    ts: new Date().toISOString(),
    session_id: "ses_test",
    prompt: "test prompt",
    retrieved_tools: [{ server: "github", tool: "list_prs", score: 0.9 }],
    corpus_size: 100,
    embedding_model: "Xenova/all-MiniLM-L6-v2",
    k: 10,
    ...overrides,
  }
}

// ─── Scenario: A session record is appended ───────────────────────────────────

describe("telemetry.feature: appendSession appends valid JSONL", () => {
  test("file contains the appended record", () => {
    appendSessionToFile(sessionsFile, makeRecord())
    const sessions = readSessionsFromFile(sessionsFile)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.prompt).toBe("test prompt")
  })

  test("record contains all required fields", () => {
    appendSessionToFile(sessionsFile, makeRecord())
    const s = readSessionsFromFile(sessionsFile)[0]!
    expect(s.ts).toBeDefined()
    expect(s.session_id).toBeDefined()
    expect(s.prompt).toBeDefined()
    expect(s.retrieved_tools).toBeDefined()
    expect(s.corpus_size).toBeDefined()
    expect(s.embedding_model).toBeDefined()
    expect(s.k).toBeDefined()
  })
})

// ─── Scenario: sessions.jsonl is valid JSONL after every run ─────────────────

describe("telemetry.feature: sessions.jsonl stays valid JSONL", () => {
  test("each line is independently parseable JSON", () => {
    appendSessionToFile(sessionsFile, makeRecord({ session_id: "s1" }))
    appendSessionToFile(sessionsFile, makeRecord({ session_id: "s2" }))
    const lines = readFileSync(sessionsFile, "utf8").split("\n").filter(Boolean)
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
  })
})

// ─── Scenario: A corrupt line is silently skipped ────────────────────────────

describe("telemetry.feature: corrupt lines are silently skipped", () => {
  test("valid records before and after a corrupt line are returned", () => {
    appendSessionToFile(sessionsFile, makeRecord({ session_id: "s1" }))
    // Manually inject a corrupt line
    appendFileSync(sessionsFile, "this is not json\n")
    appendSessionToFile(sessionsFile, makeRecord({ session_id: "s3" }))

    const sessions = readSessionsFromFile(sessionsFile)
    expect(sessions).toHaveLength(2)
    expect(sessions.map((s) => s.session_id)).toEqual(["s1", "s3"])
  })
})

// ─── Scenario: stats --last N limits sessions ────────────────────────────────

describe("telemetry.feature: readSessionsFromFile(last=N)", () => {
  test("returns only the most recent N sessions", () => {
    for (let i = 0; i < 7; i++) {
      appendSessionToFile(sessionsFile, makeRecord({ session_id: `s${i}`, prompt: `prompt ${i}` }))
    }
    const recent = readSessionsFromFile(sessionsFile, 5)
    expect(recent).toHaveLength(5)
    expect(recent[0]!.prompt).toBe("prompt 2")
    expect(recent[4]!.prompt).toBe("prompt 6")
  })
})

// ─── Scenario: computeStats ──────────────────────────────────────────────────

describe("telemetry.feature: computeStats on empty array", () => {
  test("returns zeroed stats", () => {
    const stats = computeStats([])
    expect(stats.total).toBe(0)
    expect(stats.avgScore).toBeNull()
    expect(stats.avgK).toBeNull()
    expect(stats.avgCorpus).toBeNull()
    expect(stats.toolFreq).toEqual([])
    expect(stats.models).toEqual([])
  })
})

describe("telemetry.feature: computeStats aggregation", () => {
  test("counts total sessions", () => {
    const sessions = [makeRecord(), makeRecord()]
    expect(computeStats(sessions).total).toBe(2)
  })

  test("aggregates tool frequency in descending order", () => {
    const sessions = [
      makeRecord({ retrieved_tools: [{ server: "github", tool: "list_prs", score: 0.9 }] }),
      makeRecord({ retrieved_tools: [{ server: "github", tool: "list_prs", score: 0.8 }] }),
      makeRecord({ retrieved_tools: [{ server: "notion", tool: "search", score: 0.7 }] }),
    ]
    const stats = computeStats(sessions)
    expect(stats.toolFreq[0]!.key).toBe("github/list_prs")
    expect(stats.toolFreq[0]!.count).toBe(2)
    expect(stats.toolFreq[1]!.key).toBe("notion/search")
  })

  test("collects unique embedding models", () => {
    const sessions = [
      makeRecord({ embedding_model: "model-a" }),
      makeRecord({ embedding_model: "model-b" }),
      makeRecord({ embedding_model: "model-a" }),
    ]
    const stats = computeStats(sessions)
    expect(stats.models.sort()).toEqual(["model-a", "model-b"])
  })

  test("computes average K", () => {
    const sessions = [makeRecord({ k: 5 }), makeRecord({ k: 15 })]
    expect(computeStats(sessions).avgK).toBeCloseTo(10, 5)
  })
})

// ─── Scenario: formatStats ───────────────────────────────────────────────────

describe("telemetry.feature: formatStats", () => {
  test("returns 'No sessions recorded yet.' for empty stats", () => {
    expect(formatStats(computeStats([]))).toBe("No sessions recorded yet.")
  })

  test("includes Sessions count", () => {
    const output = formatStats(computeStats([makeRecord(), makeRecord()]))
    expect(output).toContain("Sessions:       2")
  })

  test("includes Top retrieved tools section", () => {
    const output = formatStats(computeStats([makeRecord()]))
    expect(output).toContain("Top retrieved tools:")
    expect(output).toContain("github/list_prs")
  })
})
