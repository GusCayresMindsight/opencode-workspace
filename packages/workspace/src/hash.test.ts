/**
 * Tests for: hashTool() — pure function
 */
import { describe, test, expect } from "bun:test"
import { hashTool } from "./hash"

describe("hashTool: determinism", () => {
  test("same description + schema produces the same hash", () => {
    const a = hashTool("does the thing", { type: "object" })
    const b = hashTool("does the thing", { type: "object" })
    expect(a).toBe(b)
  })

  test("different description produces a different hash", () => {
    const a = hashTool("does the thing", { type: "object" })
    const b = hashTool("does something else", { type: "object" })
    expect(a).not.toBe(b)
  })

  test("different schema produces a different hash", () => {
    const a = hashTool("same description", { type: "object", required: ["x"] })
    const b = hashTool("same description", { type: "object", required: ["y"] })
    expect(a).not.toBe(b)
  })
})

describe("hashTool: null / undefined handling", () => {
  test("null description is handled without throwing", () => {
    expect(() => hashTool(null, { type: "object" })).not.toThrow()
  })

  test("undefined description is handled without throwing", () => {
    expect(() => hashTool(undefined, {})).not.toThrow()
  })

  test("null schema is handled without throwing", () => {
    expect(() => hashTool("desc", null)).not.toThrow()
  })

  test("null description and schema produce a consistent hash", () => {
    expect(hashTool(null, null)).toBe(hashTool(null, null))
  })
})

describe("hashTool: output format", () => {
  test("returns a 64-character hex string (SHA-256)", () => {
    const h = hashTool("desc", {})
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
})
