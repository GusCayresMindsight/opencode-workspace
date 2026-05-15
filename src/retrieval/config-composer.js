'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { randomUUID } = require('crypto');
const { generatePermissions, retrievedServers } = require('./permissions');

const TEMPLATE = path.join(__dirname, '..', '..', 'lib', 'opencode.json.template');

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Read the tracked template. Throw with a clear message if it's missing. */
function readTemplate() {
  if (!fs.existsSync(TEMPLATE)) {
    throw new Error(`Template not found: ${TEMPLATE}`);
  }
  return JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
}

/**
 * Return the existing "permission" map from the user's global OpenCode config,
 * or {} if none exists.
 */
function readExistingPermissions() {
  const globalCfg = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  if (!fs.existsSync(globalCfg)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(globalCfg, 'utf8'));
    return parsed.permission ?? parsed.permissions ?? {};
  } catch {
    return {};
  }
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Build a temporary OpenCode config file that layers permission deny-rules on
 * top of the workspace template.  The file is written to /tmp and must be
 * deleted by the caller when the session ends.
 *
 * @param {Array<{ server_name:string }>} hits  — top-K retrieved tools
 * @returns {{ tempPath: string, deniedServers: string[] }}
 */
function composeTempConfig(hits) {
  const template    = readTemplate();
  const allServers  = Object.keys(template.mcp ?? {});
  const hitServers  = retrievedServers(hits);
  const existing    = readExistingPermissions();
  const permissions = generatePermissions(allServers, hitServers, existing);
  const denied      = allServers.filter(s => !hitServers.includes(s));

  const overlay = {
    ...template,
    // OpenCode uses "permission" (singular) in its JSON schema
    permission: permissions,
  };

  const tempPath = path.join(os.tmpdir(), `ow-session-${randomUUID()}.json`);
  fs.writeFileSync(tempPath, JSON.stringify(overlay, null, 2), 'utf8');

  return { tempPath, deniedServers: denied };
}

/**
 * Delete the temp config created by composeTempConfig().
 * Silent no-op if the file is already gone.
 */
function cleanupTempConfig(tempPath) {
  try { fs.unlinkSync(tempPath); } catch { /* already gone */ }
}

/** Expose the list of all server names defined in the template. */
function templateServers() {
  return Object.keys(readTemplate().mcp ?? {});
}

module.exports = { composeTempConfig, cleanupTempConfig, templateServers };
