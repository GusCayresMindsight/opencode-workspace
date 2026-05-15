/**
 * Tests for: docs/indexing.feature (corpus CRUD unit portion)
 */
import { describe, test, expect, beforeEach } from "bun:test"
import { createTestDb } from "./db"
import {
  upsertTool,
  getToolHash,
  getAllToolsWithEmbeddings,
  getToolsByIds,
  getToolCount,
  getIndexedServers,
  packF32,
  unpackF32,
} from "./corpus"
import type { Database } from "bun:sqlite"

let db: Database

beforeEach(() => {
  ;({ db } = createTestDb())
})

const EMBEDDING = Array.from({ length: 384 }, (_, i) => i / 384)

function insertTool(name = "my_tool", server = "my_server", desc = "does stuff", schema = {}) {
  upsertTool(db, { server_name: server, tool_name: name, description: desc, input_schema: schema, schema_hash: "abc" }, EMBEDDING)
}

// ─── Scenario: First-time indexing stores all tools ───────────────────────────

describe("indexing.feature: upsertTool stores tool and embedding", () => {
  test("tool count increases after insert", () => {
    expect(getToolCount(db)).toBe(0)
    insertTool()
    expect(getToolCount(db)).toBe(1)
  })

  test("stored tool can be retrieved by ID", () => {
    insertTool("my_tool", "my_server", "does stuff")
    const tools = getToolsByIds(db, [1])
    expect(tools).toHaveLength(1)
    expect(tools[0]!.tool_name).toBe("my_tool")
    expect(tools[0]!.server_name).toBe("my_server")
    expect(tools[0]!.description).toBe("does stuff")
  })

  test("getToolHash returns the stored hash", () => {
    upsertTool(db, { server_name: "s", tool_name: "t", description: "d", input_schema: {}, schema_hash: "myhash" }, EMBEDDING)
    expect(getToolHash(db, "s", "t")).toBe("myhash")
  })

  test("getAllToolsWithEmbeddings returns embeddings as number arrays", () => {
    insertTool()
    const all = getAllToolsWithEmbeddings(db)
    expect(all).toHaveLength(1)
    expect(Array.isArray(all[0]!.embedding)).toBe(true)
    expect(all[0]!.embedding).toHaveLength(384)
  })
})

// ─── Scenario: getToolHash returns null for missing tool ─────────────────────

describe("indexing.feature: getToolHash for missing tool", () => {
  test("returns null when the tool does not exist", () => {
    expect(getToolHash(db, "nonexistent", "tool")).toBeNull()
  })
})

// ─── Scenario: Incremental run skips unchanged tools ─────────────────────────

describe("indexing.feature: upsert on conflict updates the row", () => {
  test("updating description changes the stored value", () => {
    upsertTool(db, { server_name: "s", tool_name: "t", description: "old", input_schema: {}, schema_hash: "h1" }, EMBEDDING)
    upsertTool(db, { server_name: "s", tool_name: "t", description: "new", input_schema: {}, schema_hash: "h2" }, EMBEDDING)
    expect(getToolCount(db)).toBe(1)
    expect(getToolHash(db, "s", "t")).toBe("h2")
    const tools = getToolsByIds(db, [1])
    expect(tools[0]!.description).toBe("new")
  })
})

// ─── getToolsByIds ────────────────────────────────────────────────────────────

describe("indexing.feature: getToolsByIds", () => {
  test("returns empty array for empty id list", () => {
    expect(getToolsByIds(db, [])).toEqual([])
  })

  test("only returns requested IDs", () => {
    insertTool("t1", "s")
    insertTool("t2", "s")
    const all = getAllToolsWithEmbeddings(db)
    const firstId = all.find((t) => t.tool_name === "t1")!.id
    const result = getToolsByIds(db, [firstId])
    expect(result).toHaveLength(1)
    expect(result[0]!.tool_name).toBe("t1")
  })
})

// ─── getIndexedServers ────────────────────────────────────────────────────────

describe("indexing.feature: getIndexedServers", () => {
  test("returns distinct server names", () => {
    insertTool("t1", "serverA")
    insertTool("t2", "serverA")
    insertTool("t3", "serverB")
    const servers = getIndexedServers(db)
    expect(servers.sort()).toEqual(["serverA", "serverB"])
  })
})

// ─── packF32 / unpackF32 roundtrip ───────────────────────────────────────────

describe("corpus: packF32 / unpackF32 roundtrip", () => {
  test("exact values are preserved after pack → unpack", () => {
    const original = [0.1, 0.5, -0.3, 1.0, 0.0]
    const packed = packF32(original)
    const unpacked = unpackF32(packed)
    for (let i = 0; i < original.length; i++) {
      expect(unpacked[i]!).toBeCloseTo(original[i]!, 5)
    }
  })
})
