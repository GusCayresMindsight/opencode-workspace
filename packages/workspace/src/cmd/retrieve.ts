import { loadConfig } from "../config"
import { openDb } from "../db"
import { getToolCount } from "../corpus"
import { search, type SearchHit } from "../search"

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`

export function formatHitsText(hits: SearchHit[]): string {
  if (hits.length === 0) return "No tools found.\n"
  const lines = hits.map((h) => `  ${h.score.toFixed(3)}  ${h.server_name}/${h.tool_name}: ${h.description}`)
  return lines.join("\n") + "\n"
}

export async function cmdRetrieve(query: string, opts: { json?: boolean; k?: number } = {}): Promise<void> {
  if (!query?.trim()) {
    process.stderr.write("ow retrieve: query must not be empty\n")
    process.exit(1)
  }

  const config = loadConfig()
  const k = opts.k ?? config.retrieval?.k ?? 10

  let corpusSize = 0
  try {
    const { db } = openDb()
    corpusSize = getToolCount(db)
  } catch {}

  if (corpusSize === 0) {
    process.stderr.write(yellow("ow: tool corpus is empty.") + " Run `ow index` first.\n")
    if (opts.json) process.stdout.write("[]\n")
    return
  }

  process.stderr.write(
    dim(`Retrieving top-${k} tools for: "${query.slice(0, 60)}${query.length > 60 ? "…" : ""}"\n`),
  )

  let hits: SearchHit[]
  try {
    hits = await search(query, config, k)
  } catch (err: any) {
    process.stderr.write(`ow: retrieval failed (${err.message})\n`)
    if (opts.json) process.stdout.write("[]\n")
    return
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(hits, null, 2) + "\n")
  } else {
    process.stdout.write(formatHitsText(hits))
  }
}
