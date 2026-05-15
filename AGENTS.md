# ow — AGENTS.md

## BDD-first workflow

**Read this before touching any code.**

`docs/*.feature` files are the source of truth for this project's behavior.
Every non-`@wip` scenario MUST have a passing `bun test`.

### The rule

Before making any code change:

1. **Read** the relevant `docs/*.feature` file(s)
2. **Update** the feature file first — if the behavior you are adding or
   changing does not have a scenario, write one before writing any code
3. **Write** the failing test in `packages/workspace/src/*.test.ts`
4. **Make it pass** by editing `packages/workspace/src/`
5. If the CLI surface changes, update `packages/opencode/src/cli/cmd/corpus.ts`
   or `ws.ts`
6. Run `make test` — all 70+ tests must stay green

Scenarios tagged `@wip` are aspirational or require live infrastructure
(real MCP servers, tmux). Do not write unit tests for them.

---

## What this repo is

A Bun monorepo that builds the **`ow` binary** — a fork of
[anomalyco/opencode](https://github.com/anomalyco/opencode) extended with:

- **Semantic MCP tool retrieval** — indexes all configured MCP server tools
  into a local SQLite corpus, embeds them with a local ONNX model, and
  surfaces the most relevant ones at the start of every session
- **Built-in tool-retrieval plugin** — fires on the first user message,
  embeds it, and injects the top-K tools as system context before the LLM
  responds (no subprocess, no separate install)
- **`ow corpus` commands** — `index`, `retrieve`, `stats`, `mcp-serve`
- **`ow ws` command** — tmux workspace management (two-pane layout)

---

## Developer commands

```bash
make install   # bun install (resolves all workspace dependencies)
make build     # builds ./packages/opencode/dist/ow-linux-x64/bin/ow
make dev       # interpreted mode — no compile, fast iteration
make test      # bun test --cwd packages/workspace  (70 unit tests, ~80 ms)
make smoke     # make build + ow corpus index + retrieval assertion
```

Bun 1.3.13 is pinned in `package.json` `packageManager`. Install it:

```bash
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.13"
```

Symlink the built binary onto PATH after `make build`:

```bash
ln -sf $(pwd)/packages/opencode/dist/ow-linux-x64/bin/ow ~/.local/bin/ow
```

---

## Repo structure

```
packages/
  opencode/          # Fork of anomalyco/opencode — the ow binary
    src/
      index.ts                   # CLI entry: scriptName("ow"), all commands
      cli/cmd/corpus.ts          # ow corpus index|retrieve|stats|mcp-serve
      cli/cmd/ws.ts              # ow ws [term]
      plugin/index.ts            # INTERNAL_PLUGINS — ToolRetrievalPlugin added here
  workspace/         # Tool-retrieval logic (our code)
    src/
      config.ts      # loadConfig() / loadConfigFromFile()  ← docs/configuration.feature
      db.ts          # openDb() / createTestDb()
      hash.ts        # hashTool()
      corpus.ts      # upsertTool / getToolHash / packF32…  ← docs/indexing.feature
      embedder.ts    # createEmbedder() — local ONNX or OpenAI
      search.ts      # search() / cosineSim / bruteForceSearch ← docs/retrieval.feature
      telemetry.ts   # appendSession / readSessions / computeStats ← docs/telemetry.feature
      mcp-client.ts  # listToolsForServer / loadMcpEnvFromFile  ← docs/mcp-env.feature
      cmd/
        index.ts     # cmdIndex()    — reads opencode.json, spawns MCP servers
        retrieve.ts  # cmdRetrieve() — runs search(), prints results
        stats.ts     # cmdStats()    — formats telemetry
        mcp-serve.ts # startMcpServer() / handleSearchTools() ← docs/tool-retrieval-mcp.feature
      plugin/
        tool-retrieval.ts  # ToolRetrievalPlugin / handleFirstMessage() ← docs/tui-retrieval.feature
  core/              # From upstream — shared utilities (@opencode-ai/core)
  sdk/js/            # From upstream — HTTP client (@opencode-ai/sdk)
  plugin/            # From upstream — plugin type definitions (@opencode-ai/plugin)
  ui/                # From upstream — TUI component library (@opencode-ai/ui)
  script/            # From upstream — build scripts (@opencode-ai/script)
docs/                # BDD feature files — the source of truth
  configuration.feature
  indexing.feature
  retrieval.feature
  telemetry.feature
  mcp-env.feature
  tool-retrieval-mcp.feature
  tui-retrieval.feature
  tui-commands.feature    # all @wip (tmux)
  smoke-test.feature      # all @wip (integration)
  prerequisites.feature
```

---

## Adding new behavior (step by step)

1. **Feature file first** — open the relevant `docs/*.feature` and add or
   update a scenario. If none of the existing files fit, create a new one.

2. **Write the failing test** in `packages/workspace/src/*.test.ts` using
   `bun:test` (`describe / test / expect`). Run `make test` and confirm it
   fails for the right reason.

3. **Implement** in `packages/workspace/src/`. Keep functions small and
   injectable (accept `_searchFn`, `_corpusSizeFn`, explicit file paths)
   so they stay testable without filesystem side-effects.

4. **Wire CLI** — if the feature needs a new or changed CLI command, edit
   `packages/opencode/src/cli/cmd/corpus.ts` (for corpus commands) or
   `ws.ts` (for workspace commands), then re-register it in
   `packages/opencode/src/index.ts` if it is a new top-level command.

5. **Run `make test`** — all tests must pass. Then `make build` to verify
   the binary compiles cleanly.

---

## Runtime file locations

| Path | Purpose |
|---|---|
| `~/.config/ow/config.json` | User config — auto-defaults if absent |
| `~/.config/ow/tools.db` | SQLite tool corpus (`ow corpus index` writes here) |
| `~/.config/ow/sessions.jsonl` | Per-retrieval telemetry records |
| `~/.config/opencode/opencode.json` | MCP server list — read by `ow corpus index` |
| `~/.local/share/opencode/mcp.env` | MCP secrets (`KEY=value`, one per line) |
| `~/.local/share/opencode/opencode.db` | OpenCode session/message database |
| `~/.cache/huggingface/` | ONNX model cache (~23 MB, auto-downloaded on first use) |
| `packages/opencode/dist/ow-linux-x64/bin/ow` | The compiled binary |

---

## Gotchas

- **Feature files first** — if you skip step 1 above and go straight to
  code, you will break the BDD contract and create tests that do not map
  to any documented scenario.

- **`bun:sqlite` only** — we dropped `better-sqlite3` and `sqlite-vec`.
  SQLite is always native Bun. All brute-force cosine search; no vector
  extension. Fast enough for corpora ≤ ~5 000 tools.

- **BLOB type from `bun:sqlite` is `Uint8Array`** — not a Node.js
  `Buffer`. `corpus.ts` uses `DataView` + `ArrayBuffer` for float32
  packing; do not use `Buffer.readFloatLE`.

- **Embedding text format is a contract** — `"<server> / <tool>: <desc>"`
  is used at index time AND at query time. Changing the format invalidates
  the corpus and requires `ow corpus index --force`.

- **`ToolRetrievalPlugin` is in `INTERNAL_PLUGINS`** in
  `packages/opencode/src/plugin/index.ts`. It runs in every ow session
  automatically. To disable it for a specific session use `ow --pure`.

- **MCP config is user-owned** — `ow corpus index` reads MCP servers from
  the user's `~/.config/opencode/opencode.json` (or `OPENCODE_CONFIG` env
  or `.opencode/opencode.json`). There is no bundled template anymore.

- **`packages/opencode` has its own `AGENTS.md`** inherited from upstream.
  Do not overwrite it. It contains Effect.ts and database conventions that
  apply to the OpenCode internals.

- **Binary name in build output** — the build script outputs to
  `dist/ow-linux-x64/bin/ow`. The smoke test in `script/build.ts` also
  uses `ow --version`. If you change the name, update both.

- **All retrieval messages go to `stderr`** — `stdout` belongs to
  structured output (`--json` mode) and is read by scripts.

- **Testability pattern** — injectable dependencies use underscore-prefix
  options (`_searchFn`, `_corpusSizeFn`, explicit file paths). These are
  test-only overrides; production code uses the real implementations.
