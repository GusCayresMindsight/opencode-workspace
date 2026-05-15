import { createHash } from "crypto"

/**
 * Stable cache key for a tool: SHA-256 of description + full input schema.
 * Changing either invalidates the cache and forces a re-embed.
 */
export function hashTool(description: string | null | undefined, inputSchema: object | null | undefined): string {
  const content = (description ?? "") + JSON.stringify(inputSchema ?? {})
  return createHash("sha256").update(content, "utf8").digest("hex")
}
