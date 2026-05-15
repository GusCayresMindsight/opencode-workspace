'use strict';

const path = require('path');
const fs   = require('fs');
const { CONFIG_DIR } = require('./config');

const DB_PATH = path.join(CONFIG_DIR, 'tools.db');

let _db      = null;
let _hasVec  = false;   // true when sqlite-vec extension is loaded

// ─── SQLite adapter ───────────────────────────────────────────────────────────
// Both better-sqlite3 and bun:sqlite implement the same synchronous API that we
// use here (prepare / exec / pragma).  We try bun:sqlite first so that users on
// Bun get the native binding without any extra install.

function requireSqlite() {
  try {
    // bun:sqlite is a built-in; require will throw in Node
    const mod = require('bun:sqlite');
    return { Database: mod.Database, isBun: true };
  } catch {
    return { Database: require('better-sqlite3'), isBun: false };
  }
}

// ─── Migrations ───────────────────────────────────────────────────────────────

const MIGRATIONS = [
  // v1 — core schema
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

  // Embeddings stored as raw float32 BLOBs.  Always written so that cosine
  // search works even without the sqlite-vec extension.
  `CREATE TABLE IF NOT EXISTS tool_embeddings (
    tool_id   INTEGER PRIMARY KEY REFERENCES tools(id) ON DELETE CASCADE,
    embedding BLOB    NOT NULL
  )`,

  // Lightweight schema-version table
  `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`,
  `INSERT OR IGNORE INTO schema_version (version) VALUES (1)`,
];

function runMigrations(db) {
  db.exec('BEGIN');
  try {
    for (const sql of MIGRATIONS) db.exec(sql);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ─── sqlite-vec setup ─────────────────────────────────────────────────────────

function tryLoadVec(db, isBun) {
  if (isBun) {
    // bun:sqlite does not expose loadExtension via the same API; skip silently.
    return false;
  }
  try {
    const sqliteVec = require('sqlite-vec');
    db.loadExtension(sqliteVec.getLoadablePath());

    // Create the virtual vec table if not already present.
    // vec0 uses the standard SQLite rowid; the rowid MUST be bound as BigInt
    // when inserting — see corpus.js for details.
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_tools
      USING vec0(embedding float[384])
    `);
    return true;
  } catch (e) {
    // Not a fatal error: brute-force cosine search is used as fallback
    if (!e.message.includes('already exists')) {
      // Only warn when it's a genuine load failure, not a "table already exists"
      console.warn(
        `opencode-workspace: sqlite-vec not loaded (${e.message}).\n` +
        '  Install with: npm install sqlite-vec\n' +
        '  Falling back to in-process cosine similarity.',
      );
    }
    return false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Open (or return cached) the tools database.
 * Creates the file and all tables on first call.
 *
 * @returns {{ db: import('better-sqlite3').Database, hasVec: boolean }}
 */
function openDb() {
  if (_db) return { db: _db, hasVec: _hasVec };

  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  const { Database, isBun } = requireSqlite();
  const db = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  _hasVec = tryLoadVec(db, isBun);
  runMigrations(db);

  _db = db;
  return { db, hasVec: _hasVec };
}

/** Return the filesystem path of the DB (for diagnostics). */
function dbPath() { return DB_PATH; }

module.exports = { openDb, dbPath };
