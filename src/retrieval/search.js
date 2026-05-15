'use strict';

const { openDb }                   = require('../db');
const { createEmbedder }           = require('../index/embedder');
const { getAllToolsWithEmbeddings, getToolsByIds, getToolCount, packF32 } = require('../index/corpus');

// ─── cosine similarity (brute-force fallback) ─────────────────────────────────

/**
 * Cosine similarity between two equal-length float arrays.
 * All-MiniLM vectors are already L2-normalised → this equals dot product, but
 * we compute the full formula for correctness with other models.
 */
function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ─── vec0 search (sqlite-vec) ─────────────────────────────────────────────────

/**
 * Vector search using the sqlite-vec vec0 virtual table.
 *
 * @param {object}   db
 * @param {number[]} queryVec
 * @param {number}   k
 * @returns {Array<{ tool_id:number, score:number }>}
 */
function vecSearch(db, queryVec, k) {
  const blob = packF32(queryVec);
  // vec0 returns L2 distance; for unit vectors cosine_distance ≈ 1 - score
  // rowid comes back as a plain JS number from better-sqlite3
  const rows = db.prepare(`
    SELECT rowid AS tool_id, distance
    FROM vec_tools
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `).all(blob, k);

  return rows.map(r => ({
    tool_id: r.tool_id,
    score:   1 - r.distance,
  }));
}

// ─── brute-force search ───────────────────────────────────────────────────────

/**
 * Cosine search over all embedded tools loaded into memory.
 * Fast enough for corpora ≤ ~5 000 tools on modern hardware.
 *
 * @param {object}   db
 * @param {number[]} queryVec
 * @param {number}   k
 * @returns {Array<{ tool_id:number, score:number }>}
 */
function bruteForceSearch(db, queryVec, k) {
  const tools = getAllToolsWithEmbeddings(db);
  return tools
    .map(t => ({ tool_id: t.id, score: cosineSim(queryVec, t.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Embed `query` and return the top-K most relevant tools from the corpus.
 *
 * @param {string} query
 * @param {object} config — the full opencode-workspace config object
 * @param {number} [kOverride] — override config.retrieval.k
 * @returns {Promise<Array<{ server_name:string, tool_name:string, description:string, score:number }>>}
 */
async function search(query, config, kOverride) {
  const strategy = config.retrieval?.strategy ?? 'topk';

  if (strategy === 'agent_first' || strategy === 'graph' || strategy === 'active') {
    throw new Error(`retrieval strategy "${strategy}": not implemented`);
  }

  const k = kOverride ?? config.retrieval?.k ?? 10;

  const { db, hasVec } = openDb();
  const corpus = getToolCount(db);

  if (corpus === 0) return [];

  const embedder  = createEmbedder(config.embedding ?? {});
  const queryVec  = await embedder.embed(query);

  let hits;
  if (hasVec) {
    hits = vecSearch(db, queryVec, k);
  } else {
    hits = bruteForceSearch(db, queryVec, k);
  }

  const byId = Object.fromEntries(
    getToolsByIds(db, hits.map(h => h.tool_id)).map(t => [t.id, t]),
  );

  return hits
    .filter(h => byId[h.tool_id])
    .map(h => {
      const t = byId[h.tool_id];
      return {
        server_name: t.server_name,
        tool_name:   t.tool_name,
        description: t.description,
        score:       h.score,
      };
    });
}

module.exports = { search, cosineSim };
