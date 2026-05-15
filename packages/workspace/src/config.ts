import path from "path"
import fs from "fs"
import os from "os"

export const CONFIG_DIR = path.join(os.homedir(), ".config", "ow")
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json")

/** MCP secrets file (kept compatible with old opencode location) */
export const MCP_ENV_PATH = path.join(os.homedir(), ".local", "share", "opencode", "mcp.env")

export interface EmbeddingConfig {
  provider: string
  model?: string
  apiKey?: string
}

export interface RetrievalConfig {
  k: number
  strategy: string
}

export interface WorkspaceConfig {
  embedding: EmbeddingConfig
  retrieval: RetrievalConfig
}

const DEFAULTS: WorkspaceConfig = {
  embedding: {
    provider: "local",
    model: "Xenova/all-MiniLM-L6-v2",
  },
  retrieval: {
    k: 10,
    strategy: "topk",
  },
}

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base } as T
  for (const key of Object.keys(override) as (keyof T)[]) {
    const v = override[key]
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      result[key] = deepMerge(base[key] as object, v as object) as T[keyof T]
    } else if (v !== undefined) {
      result[key] = v as T[keyof T]
    }
  }
  return result
}

export function loadConfig(): WorkspaceConfig {
  if (!fs.existsSync(CONFIG_FILE)) return structuredClone(DEFAULTS)
  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"))
  } catch (e: any) {
    process.stderr.write(`ow: could not parse ${CONFIG_FILE}: ${e.message}\n`)
    process.stderr.write(`ow: using defaults\n`)
    return structuredClone(DEFAULTS)
  }
  return deepMerge(DEFAULTS, raw as Partial<WorkspaceConfig>)
}
