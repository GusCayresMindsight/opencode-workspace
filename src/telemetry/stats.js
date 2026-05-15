'use strict';

/**
 * Summarise a list of session objects into printable aggregates.
 *
 * @param {object[]} sessions — array from readSessions()
 * @returns {{
 *   total:        number,
 *   toolFreq:     Array<{ key:string, count:number }>,
 *   avgScore:     number|null,
 *   avgK:         number|null,
 *   avgCorpus:    number|null,
 *   models:       string[],
 * }}
 */
function computeStats(sessions) {
  if (sessions.length === 0) {
    return { total: 0, toolFreq: [], avgScore: null, avgK: null, avgCorpus: null, models: [] };
  }

  const toolCounts = new Map();
  let totalScore = 0, scoreCount = 0;
  let totalK = 0, totalCorpus = 0;
  const models = new Set();

  for (const s of sessions) {
    if (s.embedding_model) models.add(s.embedding_model);
    if (typeof s.k        === 'number') totalK      += s.k;
    if (typeof s.corpus_size === 'number') totalCorpus += s.corpus_size;

    for (const t of s.retrieved_tools ?? []) {
      const key = `${t.server}/${t.tool}`;
      toolCounts.set(key, (toolCounts.get(key) ?? 0) + 1);
      if (typeof t.score === 'number') { totalScore += t.score; scoreCount++; }
    }
  }

  const toolFreq = [...toolCounts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total:     sessions.length,
    toolFreq,
    avgScore:  scoreCount  > 0 ? totalScore  / scoreCount  : null,
    avgK:      sessions.length > 0 ? totalK      / sessions.length : null,
    avgCorpus: sessions.length > 0 ? totalCorpus / sessions.length : null,
    models:    [...models],
  };
}

/**
 * Format stats as a human-readable multi-line string.
 *
 * @param {ReturnType<computeStats>} stats
 * @param {number} [topN=15] — how many tools to list
 * @returns {string}
 */
function formatStats(stats, topN = 15) {
  if (stats.total === 0) return 'No sessions recorded yet.';

  const lines = [
    `Sessions:       ${stats.total}`,
    `Avg K:          ${stats.avgK?.toFixed(1) ?? 'n/a'}`,
    `Avg corpus:     ${stats.avgCorpus?.toFixed(0) ?? 'n/a'} tools`,
    `Avg top score:  ${stats.avgScore?.toFixed(3) ?? 'n/a'}`,
    `Embedding:      ${stats.models.join(', ') || 'n/a'}`,
    '',
    'Top retrieved tools:',
  ];

  for (const { key, count } of stats.toolFreq.slice(0, topN)) {
    lines.push(`  ${count.toString().padStart(4)}x  ${key}`);
  }

  return lines.join('\n');
}

module.exports = { computeStats, formatStats };
