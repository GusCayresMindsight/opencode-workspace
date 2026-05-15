/**
 * Tests for: docs/mcp-env.feature (env parsing only — no live MCP connections)
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { loadMcpEnvFromFile } from "./mcp-client"

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ow-mcp-test-"))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ─── Scenario: mcp.env uses KEY=value format ──────────────────────────────────

describe("mcp-env.feature: KEY=value parsing", () => {
  test("parses a single KEY=value pair", () => {
    const f = join(tmpDir, "mcp.env")
    writeFileSync(f, "GITHUB_TOKEN=ghp_abc123\n")
    const env = loadMcpEnvFromFile(f)
    expect(env["GITHUB_TOKEN"]).toBe("ghp_abc123")
  })

  test("parses multiple keys on separate lines", () => {
    const f = join(tmpDir, "mcp.env")
    writeFileSync(f, "GITHUB_TOKEN=ghp_abc123\nNOTION_TOKEN=secret_xyz\n")
    const env = loadMcpEnvFromFile(f)
    expect(env["GITHUB_TOKEN"]).toBe("ghp_abc123")
    expect(env["NOTION_TOKEN"]).toBe("secret_xyz")
  })
})

// ─── Scenario: Missing file returns an empty map ──────────────────────────────

describe("mcp-env.feature: missing file", () => {
  test("returns an empty object when file does not exist", () => {
    const env = loadMcpEnvFromFile(join(tmpDir, "nonexistent.env"))
    expect(env).toEqual({})
  })
})

// ─── Scenario: Lines without = are ignored ────────────────────────────────────

describe("mcp-env.feature: lines without = are ignored", () => {
  test("non-key=value lines do not appear in the result", () => {
    const f = join(tmpDir, "mcp.env")
    writeFileSync(f, "# this is a comment\nVALID_KEY=value\nno-equals-sign\n")
    const env = loadMcpEnvFromFile(f)
    expect(Object.keys(env)).toEqual(["VALID_KEY"])
  })
})

// ─── Scenario: Values containing = are preserved ─────────────────────────────

describe("mcp-env.feature: values containing = are preserved", () => {
  test("only the first = is used as a separator", () => {
    const f = join(tmpDir, "mcp.env")
    writeFileSync(f, "TOKEN=abc=def\n")
    const env = loadMcpEnvFromFile(f)
    expect(env["TOKEN"]).toBe("abc=def")
  })
})
