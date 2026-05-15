'use strict';

const path = require('path');
const fs   = require('fs');
const { loadConfig }         = require('../config');
const { openDb }             = require('../db');
const { listToolsForServer } = require('../index/mcp-client');
const { createEmbedder }     = require('../index/embedder');
const { upsertTool, getToolHash, getToolCount } = require('../index/corpus');
const { hashTool }           = require('../hash');

const TEMPLATE = path.join(__dirname, '..', '..', 'lib', 'opencode.json.template');

// ─── progress helpers ─────────────────────────────────────────────────────────

function dim(s)    { return `\x1b[2m${s}\x1b[0m`; }
function green(s)  { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function bold(s)   { return `\x1b[1m${s}\x1b[0m`; }

// ─── per-server work ──────────────────────────────────────────────────────────

/**
 * Index one MCP server: connect, list tools, embed new/changed ones.
 *
 * @returns {{ indexed:number, skipped:number, failed:boolean, error?:string }}
 */
async function indexServer(serverName, serverConfig, db, hasVec, embedder, force) {
  let tools;
  try {
    tools = await listToolsForServer(serverName, serverConfig);
  } catch (err) {
    return { indexed: 0, skipped: 0, failed: true, error: err.message };
  }

  let indexed = 0, skipped = 0;

  for (const tool of tools) {
    const hash    = hashTool(tool.description, tool.inputSchema);
    const stored  = getToolHash(db, serverName, tool.name);

    if (!force && stored === hash) {
      skipped++;
      continue;
    }

    // Embed the canonical string: "server / tool_name: description"
    const text      = `${serverName} / ${tool.name}: ${tool.description}`;
    const embedding = await embedder.embed(text);

    upsertTool(db, hasVec, {
      server_name:  serverName,
      tool_name:    tool.name,
      description:  tool.description,
      input_schema: tool.inputSchema,
      schema_hash:  hash,
    }, embedding);

    indexed++;
  }

  return { indexed, skipped, failed: false, total: tools.length };
}

// ─── cmdIndex ─────────────────────────────────────────────────────────────────

/**
 * @param {{ force?: boolean }} [opts]
 */
async function cmdIndex(opts = {}) {
  const force = !!opts.force;

  // When the MCP client closes a stdio transport the child process may try to
  // write to its now-broken stdout pipe, producing an unhandled EPIPE 'error'
  // event that would otherwise crash the indexer.  We suppress EPIPE /
  // ECONNRESET for the duration of this command only.
  const epipeGuard = (err) => {
    if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
    process.nextTick(() => { throw err; });
  };
  process.on('uncaughtException', epipeGuard);

  // Read template
  if (!fs.existsSync(TEMPLATE)) {
    console.error(`Template not found: ${TEMPLATE}`);
    process.exit(1);
  }
  const template = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  const servers  = Object.entries(template.mcp ?? {});

  if (servers.length === 0) {
    console.log('No MCP servers defined in template. Nothing to index.');
    return;
  }

  const config = loadConfig();
  const { db, hasVec } = openDb();

  console.log(bold(`Indexing ${servers.length} MCP server(s)…`));
  if (force) console.log(yellow('  --force: re-embedding all tools'));

  const embedder = createEmbedder(config.embedding);

  // Warm up the embedding model once before the server loop to avoid
  // inflating the first server's timing output.
  process.stdout.write(dim('  Loading embedding model…'));
  await embedder.embed('warmup');
  process.stdout.write('\r' + ' '.repeat(30) + '\r');

  let totalIndexed = 0, totalSkipped = 0, failedServers = 0;

  // Run servers with limited concurrency (4) to avoid overwhelming the system
  const CONCURRENCY = 4;
  for (let i = 0; i < servers.length; i += CONCURRENCY) {
    const batch = servers.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(([name, cfg]) => {
        process.stdout.write(`  ${name.padEnd(30)} connecting…\r`);
        return indexServer(name, cfg, db, hasVec, embedder, force)
          .then(r => ({ name, ...r }));
      }),
    );

    for (const r of results) {
      if (r.failed) {
        console.log(`  ${yellow('⚠')} ${r.name.padEnd(28)} ${yellow('failed')}: ${r.error}`);
        failedServers++;
      } else {
        const tag = r.indexed > 0
          ? green(`+${r.indexed}`)
          : dim(`${r.total} tools`);
        const skip = r.skipped > 0 ? dim(` (${r.skipped} unchanged)`) : '';
        console.log(`  ${green('✓')} ${r.name.padEnd(28)} ${tag}${skip}`);
        totalIndexed += r.indexed;
        totalSkipped += r.skipped;
      }
    }
  }

  const total = getToolCount(db);
  console.log('');
  console.log(
    bold('Done.') +
    `  corpus: ${total} tools` +
    (totalIndexed > 0 ? `  (${green('+' + totalIndexed + ' embedded')})` : '') +
    (totalSkipped > 0 ? dim(`  (${totalSkipped} unchanged)`) : '') +
    (failedServers > 0 ? `  ${yellow(failedServers + ' server(s) failed')}` : ''),
  );

  if (failedServers === servers.length) {
    console.error('All servers failed — check your MCP configuration.');
    process.exit(1);
  }

  // Give pending EPIPE events a short window to fire before we remove the guard
  await new Promise(r => setTimeout(r, 200));
  process.removeListener('uncaughtException', epipeGuard);
}

module.exports = { cmdIndex };
