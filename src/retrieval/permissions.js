'use strict';

/**
 * Servers that must never be denied, regardless of retrieval results.
 *
 * tool-retrieval: the on-demand search_tools MCP server.  It must always be
 * accessible so the agent can proactively discover relevant tools at any point
 * in the conversation, including in sessions where it was not in the top-K.
 */
const ALWAYS_ALLOWED = new Set(['tool-retrieval']);

/**
 * Generate OpenCode permission deny-rules for servers that have NO tools in the
 * retrieved set.
 *
 * Strategy: server-level filtering only.
 *   • If a server has ≥1 retrieved tool  → leave all its tools open (no rule)
 *   • If a server is in ALWAYS_ALLOWED   → never deny, even if not retrieved
 *   • If a server has 0 retrieved tools  → add "mcp_<server>_*": "deny"
 *
 * We ONLY emit deny rules, never allow rules.  This means:
 *   • We never re-enable something the user has already denied in their config.
 *   • A few extra tools from a partially-matched server may remain available;
 *     that is an acceptable false-positive (more context, not less).
 *
 * @param {string[]} allServers        — every server name in the template
 * @param {string[]} retrievedServers  — servers with ≥1 tool in the top-K set
 * @param {object}   [existingPermissions={}] — user's current permission map
 * @returns {object}  merged permission object ready to embed in the temp config
 */
function generatePermissions(allServers, retrievedServers, existingPermissions = {}) {
  const retrieved = new Set(retrievedServers);
  const denies    = {};

  for (const server of allServers) {
    if (retrieved.has(server)) continue;

    // Some servers must remain accessible regardless of retrieval results
    if (ALWAYS_ALLOWED.has(server)) continue;

    const key = `mcp_${server}_*`;

    // Do not add a deny if the user already has any explicit rule for this
    // server (allow or deny) — they know what they're doing.
    if (Object.prototype.hasOwnProperty.call(existingPermissions, key)) continue;

    denies[key] = 'deny';
  }

  // Merge: user's existing rules take structural priority; our denies fill gaps.
  return { ...denies, ...existingPermissions };
}

/**
 * Extract the unique server names that appear in the top-K results.
 *
 * @param {Array<{ server_name:string }>} hits
 * @returns {string[]}
 */
function retrievedServers(hits) {
  return [...new Set(hits.map(h => h.server_name))];
}

module.exports = { generatePermissions, retrievedServers, ALWAYS_ALLOWED };
