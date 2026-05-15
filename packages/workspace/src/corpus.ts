import type { Database } from "bun:sqlite"

// ─── float32 helpers ──────────────────────────────────────────────────────────

export function packF32(arr: number[]): Buffer {
  const buf = Buffer.allocUnsafe(arr.length * 4)
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i]!, i * 4)
  return buf
}

export function unpackF32(buf: Buffer): number[] {
  const arr: number[] = new Array(buf.length / 4)
  for (let i = 0; i < arr.length; i++) arr[i] = buf.readFloatLE(i * 4)
  return arr
}

// ─── types ────────────────────────────────────────────────────────────────────

export interface ToolRecord {
  server_name: string
  tool_name: string
  description: string
  input_schema: string
  schema_hash: string
}

export interface ToolHit {
  id: number
  server_name: string
  tool_name: string
  description: string
}

// ─── writes ───────────────────────────────────────────────────────────────────

export function upsertTool(
  db: Database,
  tool: Omit<ToolRecord, "input_schema"> & { input_schema: object },
  embedding: number[],
): void {
  const now = Date.now()

  const upsertTools = db.prepare(`
    INSERT INTO tools (server_name, tool_name, description, input_schema, schema_hash, indexed_at)
    VALUES ($server_name, $tool_name, $description, $input_schema, $schema_hash, $indexed_at)
    ON CONFLICT(server_name, tool_name) DO UPDATE SET
      description  = excluded.description,
      input_schema = excluded.input_schema,
      schema_hash  = excluded.schema_hash,
      indexed_at   = excluded.indexed_at
  `)

  const upsertEmbed = db.prepare(`
    INSERT INTO tool_embeddings (tool_id, embedding)
    VALUES ($tool_id, $embedding)
    ON CONFLICT(tool_id) DO UPDATE SET embedding = excluded.embedding
  `)

  const doUpsert = db.transaction(() => {
    upsertTools.run({
      $server_name: tool.server_name,
      $tool_name: tool.tool_name,
      $description: tool.description ?? "",
      $input_schema: JSON.stringify(tool.input_schema ?? {}),
      $schema_hash: tool.schema_hash,
      $indexed_at: now,
    })

    const row = db.prepare("SELECT id FROM tools WHERE server_name = $s AND tool_name = $t").get({
      $s: tool.server_name,
      $t: tool.tool_name,
    }) as { id: number }

    upsertEmbed.run({
      $tool_id: row.id,
      $embedding: packF32(embedding),
    })
  })

  doUpsert()
}

// ─── reads ────────────────────────────────────────────────────────────────────

export function getToolHash(db: Database, serverName: string, toolName: string): string | null {
  const row = db
    .prepare("SELECT schema_hash FROM tools WHERE server_name = $s AND tool_name = $t")
    .get({ $s: serverName, $t: toolName }) as { schema_hash: string } | undefined
  return row ? row.schema_hash : null
}

export function getAllToolsWithEmbeddings(
  db: Database,
): Array<{ id: number; server_name: string; tool_name: string; description: string; embedding: number[] }> {
  const rows = db
    .prepare(
      `SELECT t.id, t.server_name, t.tool_name, t.description, e.embedding
       FROM tools t JOIN tool_embeddings e ON e.tool_id = t.id`,
    )
    .all() as Array<{ id: number; server_name: string; tool_name: string; description: string; embedding: Buffer }>
  return rows.map((row) => ({ ...row, embedding: unpackF32(row.embedding) }))
}

export function getToolsByIds(db: Database, ids: number[]): ToolHit[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => "?").join(", ")
  return db
    .prepare(`SELECT id, server_name, tool_name, description FROM tools WHERE id IN (${placeholders})`)
    .all(...ids) as ToolHit[]
}

export function getToolCount(db: Database): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM tools").get() as { n: number }
  return row.n
}

export function getIndexedServers(db: Database): string[] {
  const rows = db.prepare("SELECT DISTINCT server_name FROM tools").all() as { server_name: string }[]
  return rows.map((r) => r.server_name)
}
