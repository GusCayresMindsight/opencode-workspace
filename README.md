# opencode-workspace

A tmux-based workspace for running [OpenCode](https://opencode.ai) agents, with session persistence via tmux-resurrect and tmux-continuum.

## Quick start (npx)

```bash
# 1. Write ~/.config/opencode/opencode.json with all MCP servers pre-configured
npx @gus/opencode-workspace init

# 2. Set your API keys in ~/.bashrc or ~/.zshrc
export ANTHROPIC_API_KEY=...
export NOTION_TOKEN=...

# 3. Install dependencies (tmux plugins, uv, glab, opencode, semgrep)
npx @gus/opencode-workspace install

# 4. Start the workspace
npx @gus/opencode-workspace start
```

After the first run, install globally to drop the `npx` prefix:

```bash
npm install -g @gus/opencode-workspace
```

## Commands

| Command | Description |
|---|---|
| `opencode-workspace init [--force]` | Write `~/.config/opencode/opencode.json` from the bundled template. Does nothing if the file already exists (`--force` to overwrite). |
| `opencode-workspace install` | Install all dependencies (no sudo required) |
| `opencode-workspace start` | Check deps, then start or attach to session |
| `opencode-workspace start-clean` | Check deps, then start a fresh session |
| `opencode-workspace agent` | Spawn an interactive OpenCode agent pane in the current directory |
| `opencode-workspace ask "<prompt>"` | Spawn an OpenCode agent pane with a prompt in the current directory |
| `opencode-workspace term` | Spawn a plain terminal pane in the current directory |
| `opencode-workspace save` | Save current session state |
| `opencode-workspace stop` | Save state and kill the session |

## MCP servers included

The `init` template configures these MCP servers out of the box:

| Server | Description |
|---|---|
| `notion` | Notion API via `@notionhq/notion-mcp-server` |
| `gitlab` | GitLab CLI via `glab mcp serve` |
| `playwright` | Browser automation via `@playwright/mcp` |
| `fetch` | HTTP fetch via `mcp-server-fetch` (uvx) |
| `semgrep` | Code scanning via `semgrep mcp` |
| `aws-knowledge` | AWS docs & regional availability (remote) |
| `sequential-thinking` | Structured reasoning via `@modelcontextprotocol/server-sequential-thinking` |

## Prerequisites

- `tmux`
- `git`
- `curl`
- Node.js >= 18

Everything else is installed by `opencode-workspace install`.

## Alternative: git clone

```bash
git clone https://github.com/GusCayresMindsight/opencode-workspace.git
cd opencode-workspace
make install
make start
```
