'use strict';

const { setWorldConstructor, World } = require('@cucumber/cucumber');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const fixtures = require('./fixtures');

const SRC = path.resolve(__dirname, '../../src');

// ─── World ───────────────────────────────────────────────────────────────────

class OWWorld extends World {
  constructor(options) {
    super(options);

    // ── state set by Given steps ─────────────────────────────────────────────
    this.tmpHome           = null;   // isolated HOME for this scenario
    this.hits              = [];     // retrieval hits (for permissions tests)
    this.serverOverrides   = {};     // server name → tools[] | Error (index tests)
    this.embeddingError    = false;  // force embed() to throw
    this.composeError      = false;  // force composeTempConfig to throw

    // ── captured by When steps ───────────────────────────────────────────────
    this.exitCode          = null;
    this.warnings          = [];
    this.logs              = [];
    this.stderrLines       = [];
    this.spawnedCalls      = [];     // { cmd, args, env }
    this.retrievedTools    = [];     // captured from search()
    this.composeTempResult = null;   // { tempPath, deniedServers }
    this.tempConfigPaths   = [];     // all /tmp/ow-* files to clean up
    this.loadedConfig      = null;
    this.thrownError       = null;
    this.embeddingConfig   = null;   // set by configuration Given steps
  }

  // ── helpers ─────────────────────────────────────────────────────────────────

  /** Seed the corpus DB with tools, using fake vectors keyed by server name. */
  async seedCorpus(toolsByServer) {
    const { openDb }    = require(path.join(SRC, 'db'));
    const { upsertTool } = require(path.join(SRC, 'index', 'corpus'));
    const { db, hasVec } = openDb();

    for (const [serverName, tools] of Object.entries(toolsByServer)) {
      for (const tool of tools) {
        const hash = crypto.createHash('sha256')
          .update((tool.description || '') + JSON.stringify(tool.inputSchema || {}))
          .digest('hex');
        upsertTool(db, hasVec, {
          server_name:  serverName,
          tool_name:    tool.name,
          description:  tool.description || '',
          input_schema: tool.inputSchema || {},
          schema_hash:  hash,
        }, fixtures.vectorForServer(serverName));
      }
    }
  }

  /** Count tools currently in the corpus. */
  corpusSize() {
    const { openDb }    = require(path.join(SRC, 'db'));
    const { getToolCount } = require(path.join(SRC, 'index', 'corpus'));
    const { db } = openDb();
    return getToolCount(db);
  }

  /** Read sessions.jsonl → parsed objects (skips invalid lines). */
  readSessions() {
    const file = path.join(this.tmpHome, '.config', 'opencode-workspace', 'sessions.jsonl');
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8')
      .split('\n').filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  }

  /** True if sessions.jsonl file exists. */
  sessionsExist() {
    return fs.existsSync(
      path.join(this.tmpHome, '.config', 'opencode-workspace', 'sessions.jsonl'),
    );
  }

  /** Write sessions.jsonl with given records. */
  writeSessions(records) {
    const dir = path.join(this.tmpHome, '.config', 'opencode-workspace');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'sessions.jsonl'),
      records.map(r => JSON.stringify(r)).join('\n') + '\n',
      'utf8',
    );
  }

  /** Write opencode-workspace config.json. */
  writeConfig(obj) {
    const dir = path.join(this.tmpHome, '.config', 'opencode-workspace');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(obj), 'utf8');
  }

  /** Write user's global OpenCode permission config. */
  writeUserPermissions(perms) {
    const dir = path.join(this.tmpHome, '.config', 'opencode');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'opencode.json'), JSON.stringify({ permission: perms }), 'utf8');
  }

  // ── command runners ──────────────────────────────────────────────────────────

  /** Run `opencode-workspace index [--force]` with mocked MCP + embedder. */
  async runIndex(opts = {}) {
    const proxyquire = require('proxyquire').noCallThru();
    const self = this;

    const listToolsStub = async (serverName) => {
      if (serverName in self.serverOverrides) {
        const v = self.serverOverrides[serverName];
        if (v instanceof Error) throw v;
        return v;
      }
      return (fixtures.ALL_FIXTURES[serverName] || []).map(t => ({
        name: t.name, description: t.description, inputSchema: t.inputSchema,
      }));
    };

    const fakeEmbedder = fixtures.makeFakeEmbedder();

    const { cmdIndex } = proxyquire('../../src/cmd/index', {
      '../index/mcp-client': { listToolsForServer: listToolsStub },
      '../index/embedder':   { createEmbedder: () => fakeEmbedder },
    });

    try {
      await cmdIndex(opts);
      this.exitCode = 0;
    } catch (e) {
      if (e.name !== 'ExitError') throw e;
    }
  }

  /** Run `opencode-workspace "<prompt>"` with mocked spawnSync and embedder. */
  async runOneShot(prompt) {
    const proxyquire = require('proxyquire').noCallThru();
    const self = this;

    // spawnSync: never actually launch opencode
    const spawnSyncFn = (cmd, args, opts) => {
      self.spawnedCalls.push({ cmd, args, env: opts && opts.env ? { ...opts.env } : {} });
      return { status: 0, error: null };
    };

    // embedder: fake or deliberately broken
    const fakeEmbedder = self.embeddingError
      ? { async embed() { throw new Error('Embedding model not available'); }, dimensions: 384 }
      : fixtures.makeFakeEmbedder();

    // search: real logic, fake embedder; wraps result into this.retrievedTools
    const { search: realSearch } = proxyquire('../../src/retrieval/search', {
      '../index/embedder': { createEmbedder: () => fakeEmbedder },
    });
    const searchCapture = async (q, cfg, k) => {
      const results = await realSearch(q, cfg, k);
      self.retrievedTools = results;
      return results;
    };

    // composeTempConfig: real or deliberately broken
    let configComposerStubs;
    if (self.composeError) {
      configComposerStubs = {
        composeTempConfig:  () => { throw new Error('Template not found'); },
        cleanupTempConfig:  () => {},
        templateServers:    () => [],
      };
    } else {
      const real = require('../../src/retrieval/config-composer');
      const origCompose = real.composeTempConfig;
      configComposerStubs = {
        ...real,
        composeTempConfig: (hits) => {
          const result = origCompose(hits);
          self.tempConfigPaths.push(result.tempPath);
          return result;
        },
      };
    }

    const { cmdOneShot } = proxyquire('../../src/cmd/oneshot', {
      'child_process':                  { spawnSync: spawnSyncFn },
      '../retrieval/search':            { search: searchCapture },
      '../retrieval/config-composer':   configComposerStubs,
    });

    try {
      await cmdOneShot(prompt);
      this.exitCode = 0;
    } catch (e) {
      if (e.name !== 'ExitError') throw e;
    }
  }

  /** Run `opencode-workspace stats [--last N]`. */
  async runStats(opts = {}) {
    // No proxyquire needed: stats reads from the temp HOME file system
    const { cmdStats } = require(path.join(SRC, 'cmd', 'stats'));
    try {
      await cmdStats(opts);
      this.exitCode = 0;
    } catch (e) {
      if (e.name !== 'ExitError') throw e;
    }
  }
}

// ── Expose ExitError as a global so step files can catch it ──────────────────

class ExitError extends Error {
  constructor(code) {
    super(`process.exit(${code})`);
    this.name     = 'ExitError';
    this.exitCode = code ?? 0;
  }
}
global.ExitError = ExitError;

setWorldConstructor(OWWorld);
module.exports = { OWWorld, ExitError };
