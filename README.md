# opencode-workspace

Launches [OpenCode](https://opencode.ai) AI agents in a tmux split-pane layout, from any directory.
Auto-creates a tmux session if you're not already in one.

Includes a **tool-retrieval layer**: before each one-shot session the user's
prompt is embedded and used to cosine-search the full MCP tool corpus.
Only the most relevant servers are exposed to the LLM, cutting context overhead
from 10+ servers down to the top-K matches.

## Install

```bash
npm install -g @gus/opencode-workspace
# postinstall automatically sets up: uv, glab, opencode, semgrep
```

## Setup (first time)

```bash
# 1. Store API keys
opencode-workspace mcp env NOTION_TOKEN
opencode-workspace mcp env GITHUB_TOKEN
opencode-workspace mcp env BRAVE_API_KEY   # optional

# 2. Build the tool corpus (connect to every MCP server and embed their tools)
opencode-workspace index
```

`index` is incremental — re-run it whenever you add or update an MCP server.
Each tool is only re-embedded when its description or input schema changes.

## Usage

```bash
# TUI mode (no retrieval — opens interactive agent in a tmux split)
opencode-workspace
opencode-workspace agent

# One-shot mode (retrieves tools, then runs opencode non-interactively)
opencode-workspace "find open PRs assigned to me and draft a summary"
opencode-workspace "run the test suite and report any failures"

# Disable retrieval entirely for a single session (A/B baseline)
OPENCODE_WORKSPACE_RETRIEVAL=off opencode-workspace "your prompt"

# Inspect what tools were retrieved in past sessions
opencode-workspace stats
opencode-workspace stats --last 10
```

## Commands

| Command | Description |
|---|---|
| `opencode-workspace` | Launch TUI agent. Auto-creates tmux session if needed. |
| `opencode-workspace "<prompt>"` | One-shot: embed prompt → retrieve top-K tools → run `opencode run`. |
| `opencode-workspace index` | Index all MCP servers. Incremental; only re-embeds changed tools. |
| `opencode-workspace index --force` | Force re-embed of all tools regardless of schema cache. |
| `opencode-workspace stats` | Summarise retrieval history from `~/.config/opencode-workspace/sessions.jsonl`. |
| `opencode-workspace stats --last N` | Limit to last N sessions. |
| `opencode-workspace install` | Install dependencies: uv, glab, opencode, semgrep. |
| `opencode-workspace agent` | TUI alias (same as bare invocation, no retrieval). |
| `opencode-workspace term` | Split a plain terminal pane. |
| `opencode-workspace mcp env VAR` | Store a secret in `~/.local/share/opencode/mcp.env`. |

## Configuration

`~/.config/opencode-workspace/config.json` (created automatically with defaults):

```json
{
  "embedding": {
    "provider": "local",
    "model": "Xenova/all-MiniLM-L6-v2"
  },
  "retrieval": {
    "k": 10,
    "strategy": "topk"
  }
}
```

### Embedding providers

| Provider | `"provider"` value | Notes |
|---|---|---|
| Local ONNX (default) | `"local"` | `Xenova/all-MiniLM-L6-v2`, ~23 MB downloaded on first use to `~/.cache/huggingface`. No API key needed. |
| OpenAI | `"openai"` | Set `OPENAI_API_KEY` or add `"apiKey"` to the config. Default model: `text-embedding-3-small`. |
| Voyage | `"voyage"` | Not yet implemented. |
| Cohere | `"cohere"` | Not yet implemented. |

### Retrieval strategies

| `"strategy"` | Status |
|---|---|
| `"topk"` | Implemented — cosine top-K over the full corpus. |
| `"agent_first"` | Placeholder (not implemented). |
| `"graph"` | Placeholder (not implemented). |
| `"active"` | Placeholder (not implemented). |

### Kill switch

```bash
OPENCODE_WORKSPACE_RETRIEVAL=off opencode-workspace "prompt"
```

Bypasses all retrieval and permission filtering. Behaviour is identical to
running `opencode run "prompt"` directly. Use this as the A/B baseline.

## Inspecting what was retrieved

```bash
# Plain text summary
opencode-workspace stats

# Raw JSONL (one record per session)
cat ~/.config/opencode-workspace/sessions.jsonl | jq .
```

Each record:

```json
{
  "ts": "2026-05-15T12:00:00.000Z",
  "session_id": "uuid",
  "prompt": "find open PRs...",
  "retrieved_tools": [
    { "server": "github", "tool": "list_pull_requests", "score": 0.923 }
  ],
  "corpus_size": 84,
  "embedding_model": "Xenova/all-MiniLM-L6-v2",
  "k": 10
}
```

## Smoke test

Verifies that `index` + retrieval are working end-to-end:

```bash
make smoke
```

This runs `opencode-workspace index`, then asserts that querying
`"list open pull requests on GitHub"` returns a GitHub tool as the top result.

## How it works

1. **`index`** — connects to every MCP server in `lib/opencode.json.template`
   (using `@modelcontextprotocol/sdk`), calls `listTools()`, and stores
   `{server, name, description, inputSchema}` plus a 384-dim embedding of
   `"{server} / {tool}: {description}"` in a SQLite DB at
   `~/.config/opencode-workspace/tools.db`.
   Embeddings are skipped when `sha256(description + JSON.stringify(schema))`
   is unchanged — making re-runs fast.

2. **One-shot** — the prompt is embedded with the same model, cosine-searched
   against the corpus (via `sqlite-vec` if installed, otherwise in-process
   brute-force), and the top-K tools are identified.
   A temporary config is written to `/tmp/ow-<uuid>.json` that extends the
   workspace template with `"permission": { "mcp_<server>_*": "deny" }` for
   every server absent from the top-K results.
   `opencode run "<prompt>"` is then spawned with `OPENCODE_CONFIG` pointing
   at that temp file. The file is deleted when opencode exits.

3. **Compose, never overwrite** — only deny rules are generated; user-defined
   permission entries in `~/.config/opencode/opencode.json` are preserved and
   merged. A server the user has already denied cannot be re-enabled.

## MCP servers included

| Server | Description |
|---|---|
| `notion` | Notion API via `@notionhq/notion-mcp-server` |
| `gitlab` | GitLab CLI via `glab mcp serve` |
| `playwright` | Browser automation via `@playwright/mcp` |
| `fetch` | HTTP fetch via `mcp-server-fetch` (uvx) |
| `semgrep` | Code scanning via `semgrep mcp` |
| `aws-knowledge` | AWS docs & regional availability (remote) |
| `sequential-thinking` | Structured reasoning via `@modelcontextprotocol/server-sequential-thinking` |
| `github` | GitHub API via `@modelcontextprotocol/server-github` (requires `GITHUB_TOKEN`) |
| `brave-search-mcp-server` | Web search via Brave (requires `BRAVE_API_KEY`) |

## Prerequisites

- `tmux`
- `git`
- `curl`
- Node.js >= 18

## References

This implementation is based on the following work:

> Lumer, E., Nizar, F., Gulati, A., Honaganahalli Basavaraju, P., & Subbiah, V. K. (2025). *Tool-to-Agent Retrieval: Bridging Tools and Agents for Scalable LLM Multi-Agent Systems.* arXiv:2511.01854. https://arxiv.org/abs/2511.01854

```bibtex
@misc{lumer2025tooltoagent,
  title         = {Tool-to-Agent Retrieval: Bridging Tools and Agents for Scalable LLM Multi-Agent Systems},
  author        = {Lumer, Elias and Nizar, Faheem and Gulati, Anmol and Honaganahalli Basavaraju, Pradeep and Subbiah, Vamse Kumar},
  year          = {2025},
  eprint        = {2511.01854},
  archivePrefix = {arXiv},
  primaryClass  = {cs.CL},
  url           = {https://arxiv.org/abs/2511.01854}
}
```

