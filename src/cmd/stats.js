'use strict';

const { readSessions }              = require('../telemetry/sessions');
const { computeStats, formatStats } = require('../telemetry/stats');
const { dbPath }                    = require('../db');
const { getToolCount }              = require('../index/corpus');

/**
 * @param {{ last?: number }} [opts]
 */
async function cmdStats(opts = {}) {
  const last     = opts.last ? parseInt(opts.last, 10) : Infinity;
  const sessions = readSessions(last);
  const stats    = computeStats(sessions);
  console.log(formatStats(stats));

  // Show corpus size if the DB exists
  try {
    const { openDb } = require('../db');
    const { db }     = openDb();
    const n          = getToolCount(db);
    console.log(`\nTool corpus: ${n} tools  (${dbPath()})`);
  } catch { /* DB may not exist yet */ }
}

module.exports = { cmdStats };
