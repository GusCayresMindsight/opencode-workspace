'use strict';

/**
 * Corpus: low-level DB read/write for the tool index.
 *
 * All functions accept the `db` and `hasVec` pair returned by openDb() so
 * callers decide when to open the database.
 */

// ─── float32 helpers ──────────────────────────────────────────────────────────

/** Pack a JS number[] into a Buffer of float32 little-endian values. */
function packF32(arr) {
  const buf = Buffer.allocUnsafe(arr.length * 4);
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i], i * 4);
  return buf;
}

/** Unpack a Buffer of float32 little-endian values into a number[]. */
function unpackF32(buf) {
  const arr = new Array(buf.length / 4);
  for (let i = 0; i < arr.length; i++) arr[i] = buf.readFloatLE(i * 4);
  return arr;
}

// ─── writes ───────────────────────────────────────────────────────────────────

/**
 * Insert or replace a tool + its embedding.
 *
 * @param {object} db        — better-sqlite3 / bun:sqlite connection
 * @param {boolean} hasVec   — whether sqlite-vec virtual table is available
 * @param {object} tool      — { server_name, tool_name, description, input_schema, schema_hash }
 * @param {number[]} embedding — raw float32 vector
 */
function upsertTool(db, hasVec, tool, embedding) {
  const now = Date.now();

  const upsertTools = db.prepare(`
    INSERT INTO tools (server_name, tool_name, description, input_schema, schema_hash, indexed_at)
    VALUES (@server_name, @tool_name, @description, @input_schema, @schema_hash, @indexed_at)
    ON CONFLICT(server_name, tool_name) DO UPDATE SET
      description  = excluded.description,
      input_schema = excluded.input_schema,
      schema_hash  = excluded.schema_hash,
      indexed_at   = excluded.indexed_at
  `);

  const upsertEmbed = db.prepare(`
    INSERT INTO tool_embeddings (tool_id, embedding)
    VALUES (@tool_id, @embedding)
    ON CONFLICT(tool_id) DO UPDATE SET embedding = excluded.embedding
  `);

  const doUpsert = db.transaction(() => {
    upsertTools.run({
      server_name:  tool.server_name,
      tool_name:    tool.tool_name,
      description:  tool.description ?? '',
      input_schema: JSON.stringify(tool.input_schema ?? {}),
      schema_hash:  tool.schema_hash,
      indexed_at:   now,
    });

    const row = db.prepare(
      'SELECT id FROM tools WHERE server_name = ? AND tool_name = ?',
    ).get(tool.server_name, tool.tool_name);

    const embBlob = packF32(embedding);
    upsertEmbed.run({ tool_id: row.id, embedding: embBlob });

    // Keep the sqlite-vec virtual table in sync when available.
    // vec0:
    //   - Uses the standard SQLite rowid (not a named column).
    //   - Rowid MUST be bound as BigInt; a plain JS number causes SQLITE_ERROR.
    //   - Does not support ON CONFLICT … DO UPDATE, so DELETE then INSERT.
    if (hasVec) {
      const bigId = BigInt(row.id);
      db.prepare('DELETE FROM vec_tools WHERE rowid = ?').run(bigId);
      db.prepare('INSERT INTO vec_tools(rowid, embedding) VALUES (?, ?)').run(bigId, embBlob);
    }
  });

  doUpsert();
}

// ─── reads ────────────────────────────────────────────────────────────────────

/**
 * Return the current schema_hash for a (server, tool) pair, or null if absent.
 *
 * @returns {string|null}
 */
function getToolHash(db, serverName, toolName) {
  const row = db.prepare(
    'SELECT schema_hash FROM tools WHERE server_name = ? AND tool_name = ?',
  ).get(serverName, toolName);
  return row ? row.schema_hash : null;
}

/**
 * Return all tools with their embeddings (for brute-force cosine search).
 *
 * @returns {Array<{ id:number, server_name:string, tool_name:string, description:string, embedding:number[] }>}
 */
function getAllToolsWithEmbeddings(db) {
  return db.prepare(`
    SELECT t.id, t.server_name, t.tool_name, t.description, e.embedding
    FROM tools t
    JOIN tool_embeddings e ON e.tool_id = t.id
  `).all().map(row => ({
    ...row,
    embedding: unpackF32(row.embedding),
  }));
}

/**
 * Fetch specific tools by their IDs (used after vector search gives back IDs).
 *
 * @param {number[]} ids
 * @returns {Array<{ id:number, server_name:string, tool_name:string, description:string }>}
 */
function getToolsByIds(db, ids) {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  return db.prepare(
    `SELECT id, server_name, tool_name, description FROM tools WHERE id IN (${placeholders})`,
  ).all(...ids);
}

/**
 * Total number of indexed tools.
 * @returns {number}
 */
function getToolCount(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM tools').get().n;
}

/**
 * All distinct server names in the corpus.
 * @returns {string[]}
 */
function getIndexedServers(db) {
  return db.prepare('SELECT DISTINCT server_name FROM tools').all().map(r => r.server_name);
}

module.exports = {
  upsertTool,
  getToolHash,
  getAllToolsWithEmbeddings,
  getToolsByIds,
  getToolCount,
  getIndexedServers,
  packF32,
};
