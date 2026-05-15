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
    this.exitCode            = null;
    this.warnings            = [];
    this.logs                = [];
    this.stderrLines         = [];
    this.spawnedCalls        = [];     // { cmd, args, env }
    this.retrievedTools      = [];     // captured from search()
    this.composeTempResult   = null;   // { tempPath, deniedServers }
    this.tempConfigPaths     = [];     // all /tmp/ow-* files to clean up
    this.loadedConfig        = null;
    this.thrownError         = null;
    this.embeddingConfig     = null;   // set by configuration Given steps
    this._capturedInjections = [];     // client.session.prompt calls (tui-hook tests)
    this._hookHandler        = null;   // reusable handler from createFirstMessageHandler
    this._hookLastQuery      = null;   // last text passed to _searchFn in runHook
    this._searchToolsResult  = null;   // result from runSearchTools
    this._serverCalls        = null;   // setRequestHandler calls captured by runStartServer
    this._wireToolsList      = null;   // listTools() result from runWireListTools
    this._wireCallResult     = null;   // callTool() result from runWireCallTool
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

  /**
   * Invoke the TUI first-message hook for a given text + sessionId.
   *
   * Creates (or reuses) a stateful handler from createFirstMessageHandler with:
   *   - a mock client that captures injections into this._capturedInjections
   *   - a proxyquire-stubbed search that uses the fake embedder
   *
   * Options:
   *   reuseHandler {boolean} — if true, reuse this._hookHandler (tests dedup)
   *   throwSearch  {boolean} — if true, _searchFn always throws (tests silent-fail)
   */
  async runHook(text, sessionId, opts = {}) {
    const self       = require('proxyquire').noCallThru();
    const proxyquire = require('proxyquire').noCallThru();
    const fakeEmbedder = fixtures.makeFakeEmbedder();

    // Stub search to use the fake embedder, and capture the query
    const { search: realSearch } = proxyquire('../../src/retrieval/search', {
      '../index/embedder': { createEmbedder: () => fakeEmbedder },
    });

    const _searchFn = opts.throwSearch
      ? async () => { throw new Error('Search failed (injected error)'); }
      : async (q, cfg, k) => {
          this._hookLastQuery = q;
          return realSearch(q, cfg, k);
        };

    // Mock client: capture every session.prompt call
    const mockClient = {
      session: {
        prompt: async (params) => {
          this._capturedInjections.push(params);
        },
      },
    };

    if (!this._hookHandler || !opts.reuseHandler) {
      // Create a fresh handler (new seenSessions Set)
      const { createFirstMessageHandler } = proxyquire('../../src/cmd/tui-hook', {
        '../retrieval/search': { search: _searchFn },
      });
      this._hookHandler = createFirstMessageHandler({ client: mockClient, _searchFn });
    }

    // Build the message.updated event payload
    const event = {
      message: {
        role:      opts.role ?? 'user',
        sessionID: sessionId,
        parts:     [{ type: 'text', text }],
      },
    };

    await this._hookHandler(event);
  }

  /**
   * Call the search_tools MCP handler directly (no real MCP server needed).
   *
   * Options:
   *   k {number} — override the k parameter passed to the handler
   */
  async runSearchTools(query, opts = {}) {
    const proxyquire   = require('proxyquire').noCallThru();
    const fakeEmbedder = fixtures.makeFakeEmbedder();

    const { search: realSearch } = proxyquire('../../src/retrieval/search', {
      '../index/embedder': { createEmbedder: () => fakeEmbedder },
    });

    const { handleSearchTools } = proxyquire('../../src/mcp/search-tools-handler', {
      '../retrieval/search': { search: realSearch },
    });

    const args = { query, ...(opts.k !== undefined ? { k: opts.k } : {}) };
    this._searchToolsResult = await handleSearchTools(args, { _searchFn: realSearch });
  }

  /**
   * Invoke createMcpServer() with a mock SDK to validate request-handler
   * registration without connecting a real stdio transport.
   *
   * The mock Server records every setRequestHandler() call so that Then steps
   * can assert that proper Zod schemas — not plain objects — were passed.
   * Captures results in this._serverCalls = [{ schema, handler }, ...].
   */
  async runStartServer() {
    const { ListToolsRequestSchema, CallToolRequestSchema } =
      await import('@modelcontextprotocol/sdk/types.js');

    const calls = [];

    class MockServer {
      constructor() {}
      setRequestHandler(schema, handler) {
        calls.push({ schema, handler });
      }
    }

    const { createMcpServer } = require('../../src/mcp/tool-retrieval-server');
    createMcpServer({ Server: MockServer, ListToolsRequestSchema, CallToolRequestSchema });

    this._serverCalls = calls;
  }

  /**
   * Run a full wire-protocol tools/list round-trip using InMemoryTransport.
   *
   * Creates a real MCP Server (via createMcpServer) and a real Client, links
   * them in-process, then calls client.listTools().  No stdio, no subprocess.
   * Result stored in this._wireToolsList.
   */
  async runWireListTools() {
    const { Server }  = await import('@modelcontextprotocol/sdk/server/index.js');
    const { Client }  = await import('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const { ListToolsRequestSchema, CallToolRequestSchema } =
      await import('@modelcontextprotocol/sdk/types.js');

    const { createMcpServer } = require('../../src/mcp/tool-retrieval-server');
    const server = createMcpServer({ Server, ListToolsRequestSchema, CallToolRequestSchema });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
    try {
      this._wireToolsList = await client.listTools();
    } finally {
      await client.close();
    }
  }

  /**
   * Run a full wire-protocol tools/call round-trip using InMemoryTransport.
   *
   * Intentionally uses an empty corpus so handleSearchTools() returns its
   * graceful "corpus is empty" response without invoking the embedder.
   * This makes the test self-contained and fast.
   * Result stored in this._wireCallResult.
   *
   * @param {string} toolName  - tool to call (e.g. 'search_tools')
   * @param {object} args      - arguments to pass to the tool
   */
  async runWireCallTool(toolName, args) {
    const { Server }  = await import('@modelcontextprotocol/sdk/server/index.js');
    const { Client }  = await import('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const { ListToolsRequestSchema, CallToolRequestSchema } =
      await import('@modelcontextprotocol/sdk/types.js');

    const { createMcpServer } = require('../../src/mcp/tool-retrieval-server');
    const server = createMcpServer({ Server, ListToolsRequestSchema, CallToolRequestSchema });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
    try {
      this._wireCallResult = await client.callTool({ name: toolName, arguments: args });
    } finally {
      await client.close();
    }
  }
}  // end OWWorld

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
