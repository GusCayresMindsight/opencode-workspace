'use strict';

const path = require('path');
const fs   = require('fs');
const { CONFIG_DIR } = require('../config');

const SESSIONS_FILE = path.join(CONFIG_DIR, 'sessions.jsonl');

// ─── write ────────────────────────────────────────────────────────────────────

/**
 * Atomically append one JSONL record to sessions.jsonl.
 *
 * "Atomic" here means: we serialise the object to a complete JSON string in
 * memory, then issue a single appendFileSync call.  POSIX guarantees that
 * write(2) calls ≤ PIPE_BUF (≥512 bytes on all conformant systems, ≥4 096 in
 * practice) are atomic.  A session line is typically <1 KB.  In the worst case
 * (line > PIPE_BUF) a partial line is written on crash; the reader skips it.
 *
 * @param {{
 *   ts:              string,
 *   session_id:      string,
 *   prompt:          string,
 *   retrieved_tools: Array<{ server:string, tool:string, score:number }>,
 *   corpus_size:     number,
 *   embedding_model: string,
 *   k:               number,
 * }} data
 */
function appendSession(data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const line = JSON.stringify(data) + '\n';
  fs.appendFileSync(SESSIONS_FILE, line, 'utf8');
}

// ─── read ─────────────────────────────────────────────────────────────────────

/**
 * Read all valid sessions from sessions.jsonl.
 * Silently skips unparseable lines (e.g. partial writes from a crash).
 *
 * @param {number} [last=Infinity] — return only the most-recent N sessions
 * @returns {object[]}
 */
function readSessions(last = Infinity) {
  if (!fs.existsSync(SESSIONS_FILE)) return [];

  const lines   = fs.readFileSync(SESSIONS_FILE, 'utf8').split('\n');
  const parsed  = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try { parsed.push(JSON.parse(line)); } catch { /* skip corrupt line */ }
  }

  if (last === Infinity || last >= parsed.length) return parsed;
  return parsed.slice(-last);
}

module.exports = { appendSession, readSessions, SESSIONS_FILE };
