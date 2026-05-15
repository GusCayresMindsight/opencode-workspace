import { Database } from "bun:sqlite"
import fs from "fs"
import path from "path"
import { CONFIG_DIR } from "./config"

const DB_PATH = path.join(CONFIG_DIR, "tools.db")

let _db: Database | null = null

// ─── Migrations ───────────────────────────────────────────────────────────────

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS tools (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    server_name  TEXT    NOT NULL,
    tool_name    TEXT    NOT NULL,
    description  TEXT,
    input_schema TEXT    NOT NULL DEFAULT '{}',
    schema_hash  TEXT    NOT NULL,
    indexed_at   INTEGER NOT NULL,
    UNIQUE(server_name, tool_name)
  )`,
  `CREATE TABLE IF NOT EXISTS tool_embeddings (
    tool_id   INTEGER PRIMARY KEY REFERENCES tools(id) ON DELETE CASCADE,
    embedding BLOB    NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`,
  `INSERT OR IGNORE INTO schema_version (version) VALUES (1)`,
]

function runMigrations(db: Database): void {
  db.exec("BEGIN")
  try {
    for (const sql of MIGRATIONS) db.exec(sql)
    db.exec("COMMIT")
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Open (or return cached) the tools database. Creates file and tables on first call. */
export function openDb(): { db: Database; hasVec: false } {
  if (_db) return { db: _db, hasVec: false }

  fs.mkdirSync(CONFIG_DIR, { recursive: true })

  const db = new Database(DB_PATH)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA foreign_keys = ON")

  runMigrations(db)

  _db = db
  // bun:sqlite does not support loadExtension — we always use brute-force cosine
  return { db, hasVec: false }
}

/** Return the filesystem path of the DB (for diagnostics). */
export function dbPath(): string {
  return DB_PATH
}

/**
 * Create an isolated in-memory database with all migrations applied.
 * Use this in tests — never touches the filesystem.
 */
export function createTestDb(): { db: Database; hasVec: false } {
  const db = new Database(":memory:")
  db.exec("PRAGMA foreign_keys = ON")
  runMigrations(db)
  return { db, hasVec: false }
}
