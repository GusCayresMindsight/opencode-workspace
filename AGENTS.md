# OpenCode Workspace — AGENTS.md

## What this repo is

A tmux workspace manager + **MCP tool-retrieval layer** for OpenCode. Tool retrieval operates in three modes:

1. **One-shot** — before each `opencode run` session, the prompt is embedded, the corpus is searched, and deny-rules are injected into a temp config.
2. **TUI first-message hook** — an OpenCode plugin (`lib/tool-retrieval.plugin.js`, installed to `~/.config/opencode/plugins/ow-tool-retrieval.js`) fires on the user's first TUI message, runs retrieval, and injects the results as system context via `client.session.prompt({ noReply: true })`.
3. **On-demand MCP tool** — the `tool-retrieval` MCP server (launched via `opencode-workspace mcp-serve`) exposes a `search_tools(query, k?)` tool. The agent calls this proactively whenever it believes it needs additional or different MCP capabilities.

Plain Node.js (CommonJS, no TypeScript, no build step). Requires Node ≥ 18.

---

## Developer commands

```bash
make install      # npm install -g .
make test         # opencode-workspace --help (exit-code only; very shallow)
make smoke        # node bin/cli.js index && node bin/smoke.js  (real validation)
make update       # bumps package.json "opencode.version" from GitHub API — does NOT run npm install
```

**One-shot usage:**
```bash
opencode-workspace index             # incremental; builds corpus before first one-shot
opencode-workspace index --force     # re-embeds every tool regardless of cache
opencode-workspace "find open PRs"   # retrieval → temp config → opencode run
OPENCODE_WORKSPACE_RETRIEVAL=off opencode-workspace "any prompt"  # bypass retrieval
opencode-workspace stats --last 10
opencode-workspace mcp env GITHUB_TOKEN  # store MCP credential
```

**Standalone retrieval (new):**
```bash
opencode-workspace retrieve "list GitHub pull requests"   # human-readable top-K
opencode-workspace retrieve --json "run browser tests"    # JSON array output
opencode-workspace retrieve --k 5 "query a database"      # override top-K count
```

**Fresh-install order (matters):**
1. `npm install -g .`
2. `opencode-workspace install` — installs uv, glab, opencode 1.15.0, semgrep
3. `opencode-workspace mcp env NOTION_TOKEN` / `GITHUB_TOKEN` (if needed)
4. `opencode-workspace index` — corpus must exist before any one-shot
5. `make smoke` — asserts GitHub PR query returns a GitHub tool as top-1

---

## Architecture — what to know before editing

**Indexing** (`src/cmd/index.js`): reads `lib/opencode.json.template`, spawns each MCP server (max 4 parallel, 15 s timeout), calls `listTools()`, hashes `description+inputSchema` to skip unchanged tools, embeds `"<server> / <tool_name>: <description>"`, stores in SQLite.

**One-shot** (`src/cmd/oneshot.js`): embeds prompt → cosine-searches corpus → collects unique server names from top-K → reads `~/.config/opencode/opencode.json` for existing user permissions → writes merged temp config to `/tmp/ow-<uuid>.json` with deny-rules for every server NOT in top-K → `OPENCODE_CONFIG=/tmp/ow-<uuid>.json opencode run "..."` → deletes temp file.

**TUI first-message hook** (`lib/tool-retrieval.plugin.js`): an OpenCode plugin installed to `~/.config/opencode/plugins/ow-tool-retrieval.js` by `opencode-workspace install`. Subscribes to the `message.updated` event. On the first user message per session, it calls `opencode-workspace retrieve --json "<text>"` as a subprocess, then calls `client.session.prompt({ noReply: true, … })` to inject the retrieved tool list as system context before the LLM responds. Soft-fails silently on any error so normal operation is never interrupted.

**On-demand retrieval tool** (`src/mcp/tool-retrieval-server.js`): a MCP stdio server launched as `opencode-workspace mcp-serve`. Always present in the template config (never denied by permission rules via `ALWAYS_ALLOWED` in `src/retrieval/permissions.js`). Exposes `search_tools(query, k?)` — the agent calls this proactively when it suspects it needs a tool it does not currently know about.

**Standalone retrieval** (`src/cmd/retrieve.js`): `opencode-workspace retrieve [--json] [--k N] "<query>"`. Used by the plugin subprocess and directly by users or scripts.

**`lib/opencode.json.template`** is the single source of truth for which MCP servers exist. Editing it affects both indexing and retrieval.

---

## Runtime file locations

| Path | Purpose |
|---|---|
| `~/.config/opencode-workspace/config.json` | User config; auto-created with defaults if absent |
| `~/.config/opencode-workspace/tools.db` | SQLite corpus (265 tools when fully indexed) |
| `~/.config/opencode-workspace/sessions.jsonl` | Per-session telemetry; may not exist until first one-shot |
| `~/.local/share/opencode/mcp.env` | MCP secrets (`KEY=value`, one per line) |
| `~/.config/opencode/opencode.json` | Global OpenCode config — read by this tool for permission merging |
| `~/.config/opencode/plugins/ow-tool-retrieval.js` | TUI first-message hook plugin; installed by `opencode-workspace install` |
| `/tmp/ow-<uuid>.json` | Temp per-session config; deleted after opencode exits |
| `~/.cache/huggingface/` | ONNX model cache (~23 MB, auto-downloaded on first use) |

---

## Gotchas

- **No test runner**: `make test` checks help output only. `make smoke` is the real validation; requires a live indexed corpus.
- **`sqlite-vec` is optional**: absent → transparent fallback to brute-force in-process cosine search. Performance difference only.
- **`bun:sqlite` first, then `better-sqlite3`**: `db.js` tries `bun:sqlite`; the throw is caught. Do not remove the fallback.
- **Embedding text format must stay consistent**: `"<server> / <tool_name>: <description>"` — index and search must use the same string and same model. Mixing models silently produces wrong results.
- **Permissions are deny-only, server-level**: if any tool from a server is in top-K, all tools on that server stay accessible. User rules from `~/.config/opencode/opencode.json` are never overridden.
- **Permission key format**: `mcp_<server_name>_*` with underscores — server `brave-search-mcp-server` → `mcp_brave-search-mcp-server_*`.
- **All retrieval messages go to `stderr`**; opencode stdout is untouched.
- **`postinstall` runs `cmdInstall`**: `npm install` triggers dependency installation; each step fails with a warning rather than aborting.
- **`workspaces/`** at repo root is `.gitignored` — treat it as external; it is not part of this package.
- **PATH**: `cli.js` prepends `~/.local/bin` and `~/.opencode/bin` on every run; tools installed there are always found.
- **`make update`** only edits `package.json`; does not reinstall. Run `npm install -g .` manually after if you want the new binary version.
- **`docs/*.feature`** are documentation only — no step implementations exist.
- **`ALWAYS_ALLOWED` in `src/retrieval/permissions.js`**: servers listed here are never denied by the one-shot permission generator. Currently contains `tool-retrieval` so the on-demand search_tools MCP tool is always callable.
- **Plugin is global**: `ow-tool-retrieval.js` is installed into `~/.config/opencode/plugins/` (the OpenCode global plugin directory), not `~/.config/opencode-workspace/`. It fires for all opencode sessions, but soft-fails if the corpus is absent.
- **Plugin uses ES module syntax** (`export const`): OpenCode plugins are loaded by Bun (which supports ESM). The rest of this codebase uses CommonJS — do not mix them in the same file.
