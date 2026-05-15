/**
 * Tests for: docs/configuration.feature
 */
import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { loadConfigFromFile } from "./config"
import { createEmbedder } from "./embedder"

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ow-config-test-"))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ─── Scenario: Defaults apply when no config file exists ──────────────────────

describe("configuration.feature: defaults when no config file exists", () => {
  test("embedding provider is local", () => {
    const cfg = loadConfigFromFile(join(tmpDir, "config.json"))
    expect(cfg.embedding.provider).toBe("local")
  })

  test("embedding model is Xenova/all-MiniLM-L6-v2", () => {
    const cfg = loadConfigFromFile(join(tmpDir, "config.json"))
    expect(cfg.embedding.model).toBe("Xenova/all-MiniLM-L6-v2")
  })

  test("K is 10", () => {
    const cfg = loadConfigFromFile(join(tmpDir, "config.json"))
    expect(cfg.retrieval.k).toBe(10)
  })

  test("retrieval strategy is topk", () => {
    const cfg = loadConfigFromFile(join(tmpDir, "config.json"))
    expect(cfg.retrieval.strategy).toBe("topk")
  })
})

// ─── Scenario: A custom K is respected ───────────────────────────────────────

describe("configuration.feature: custom K is respected", () => {
  test("returns the configured K value", () => {
    const file = join(tmpDir, "config.json")
    writeFileSync(file, JSON.stringify({ retrieval: { k: 5 } }))
    const cfg = loadConfigFromFile(file)
    expect(cfg.retrieval.k).toBe(5)
  })
})

// ─── Scenario: Malformed config falls back to defaults with two warnings ──────

describe("configuration.feature: malformed config falls back to defaults", () => {
  test("writes two warning lines to stderr and returns defaults", () => {
    const file = join(tmpDir, "config.json")
    writeFileSync(file, "{ this is not json }")

    const warnings: string[] = []
    const spy = spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      warnings.push(String(chunk))
      return true
    })

    const cfg = loadConfigFromFile(file)

    spy.mockRestore()

    expect(warnings).toHaveLength(2)
    expect(cfg.embedding.provider).toBe("local")
    expect(cfg.retrieval.k).toBe(10)
  })
})

// ─── Scenario: OpenAI provider requires API key at construction time ──────────

describe("configuration.feature: OpenAI provider requires API key", () => {
  test("throws when OPENAI_API_KEY is absent and no apiKey in config", () => {
    const saved = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY

    expect(() => createEmbedder({ provider: "openai" })).toThrow(/API key/)

    if (saved !== undefined) process.env.OPENAI_API_KEY = saved
  })
})

// ─── Scenario: Unknown embedding provider causes immediate error ──────────────

describe("configuration.feature: unknown embedding provider", () => {
  test('throws Unknown embedding provider: "anthropic"', () => {
    expect(() => createEmbedder({ provider: "anthropic" })).toThrow(
      'Unknown embedding provider: "anthropic"',
    )
  })
})

// ─── Scenario: Deep merge keeps unspecified defaults ─────────────────────────

describe("configuration.feature: deep merge keeps unspecified defaults", () => {
  test("embedding.provider stays local when only retrieval.k is set", () => {
    const file = join(tmpDir, "config.json")
    writeFileSync(file, JSON.stringify({ retrieval: { k: 20 } }))
    const cfg = loadConfigFromFile(file)
    expect(cfg.embedding.provider).toBe("local")
    expect(cfg.retrieval.k).toBe(20)
  })
})
