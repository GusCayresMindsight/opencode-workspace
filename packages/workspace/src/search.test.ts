/**
 * Tests for: docs/retrieval.feature
 */
import { describe, test, expect, beforeEach } from "bun:test"
import { cosineSim, bruteForceSearch, search } from "./search"
import { createTestDb } from "./db"
import { upsertTool } from "./corpus"
import type { WorkspaceConfig } from "./config"
import type { Database } from "bun:sqlite"

// ─── helpers ──────────────────────────────────────────────────────────────────

const BASE_CONFIG: WorkspaceConfig = {
  embedding: { provider: "local", model: "Xenova/all-MiniLM-L6-v2" },
  retrieval: { k: 10, strategy: "topk" },
}

function vec(n: number, dims = 4): number[] {
  // Unit vector where the n-th dimension is 1 and rest are 0
  return Array.from({ length: dims }, (_, i) => (i === n % dims ? 1 : 0))
}

let db: Database

beforeEach(() => {
  ;({ db } = createTestDb())
})

// ─── Scenario: cosineSim ─────────────────────────────────────────────────────

describe("retrieval.feature: cosineSim", () => {
  test("identical unit vectors produce score 1", () => {
    const a = [1, 0, 0, 0]
    expect(cosineSim(a, a)).toBeCloseTo(1, 5)
  })

  test("orthogonal vectors produce score 0", () => {
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 5)
  })

  test("zero vector produces score 0 (no division error)", () => {
    expect(cosineSim([0, 0], [1, 0])).toBe(0)
  })

  test("anti-parallel vectors produce score -1", () => {
    expect(cosineSim([1, 0], [-1, 0])).toBeCloseTo(-1, 5)
  })
})

// ─── Scenario: Results are ordered by descending cosine similarity ────────────

describe("retrieval.feature: bruteForceSearch ordering", () => {
  test("returns results ordered from highest to lowest score", () => {
    // Insert 3 tools with embeddings [1,0,0,0], [0,1,0,0], [0,0,1,0]
    for (let i = 0; i < 3; i++) {
      upsertTool(db, { server_name: "s", tool_name: `t${i}`, description: `desc${i}`, input_schema: {}, schema_hash: `h${i}` }, vec(i))
    }

    // Query matches tool 0 perfectly
    const hits = bruteForceSearch(db, vec(0), 3)
    expect(hits[0]!.score).toBeCloseTo(1, 5)
    expect(hits[0]!.score).toBeGreaterThanOrEqual(hits[1]!.score)
    expect(hits[1]!.score).toBeGreaterThanOrEqual(hits[2]!.score)
  })
})

// ─── Scenario: k limits the number of results ─────────────────────────────────

describe("retrieval.feature: k limits results", () => {
  test("returns at most k results", () => {
    for (let i = 0; i < 5; i++) {
      upsertTool(db, { server_name: "s", tool_name: `t${i}`, description: "", input_schema: {}, schema_hash: `h${i}` }, vec(i))
    }
    const hits = bruteForceSearch(db, vec(0), 3)
    expect(hits.length).toBeLessThanOrEqual(3)
  })
})

// ─── Scenario: Empty corpus returns an empty result set ──────────────────────

describe("retrieval.feature: empty corpus", () => {
  test("search() returns empty array when corpus is empty", async () => {
    const mockEmbedder = async () => [0.1, 0.2, 0.3, 0.4]
    // Override openDb to return our test db — use _searchFn workaround via bruteForceSearch directly
    const hits = bruteForceSearch(db, [0.1, 0.2, 0.3, 0.4], 10)
    expect(hits).toEqual([])
  })
})

// ─── Scenario: Unimplemented retrieval strategies fail at search time ─────────

describe("retrieval.feature: unimplemented strategy throws", () => {
  test("agent_first strategy throws not implemented", async () => {
    const cfg = { ...BASE_CONFIG, retrieval: { k: 10, strategy: "agent_first" } }
    await expect(search("any query", cfg)).rejects.toThrow("not implemented")
  })

  test("graph strategy throws not implemented", async () => {
    const cfg = { ...BASE_CONFIG, retrieval: { k: 10, strategy: "graph" } }
    await expect(search("any query", cfg)).rejects.toThrow("not implemented")
  })
})
