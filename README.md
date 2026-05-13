# opencode-workspace

Spawns [OpenCode](https://opencode.ai) agent panes to the right of your current tmux pane, from any directory.

## Install

```bash
npm install -g @gus/opencode-workspace
# postinstall automatically sets up: uv, glab, opencode, semgrep
```

## Setup (first time)

```bash
# Write ~/.config/opencode/opencode.json with all MCP servers pre-configured
opencode-workspace init

# Add your API keys to ~/.bashrc or ~/.zshrc
export NOTION_TOKEN=...
export GITHUB_TOKEN=...
```

## Usage

From inside any tmux session, in any directory:

```bash
opencode-workspace agent          # split pane to the right, run opencode
opencode-workspace ask "..."      # split pane to the right, run opencode with a prompt
opencode-workspace term           # split pane to the right, plain terminal
```

## Commands

| Command | Description |
|---|---|
| `opencode-workspace init [--force]` | Write `~/.config/opencode/opencode.json` from the bundled template. Does nothing if the file already exists (`--force` to overwrite). |
| `opencode-workspace install` | Install dependencies: uv, glab, opencode, semgrep. |
| `opencode-workspace agent` | Split a pane to the right in the current directory and run opencode. |
| `opencode-workspace ask "<prompt>"` | Split a pane to the right and run opencode with a prompt. |
| `opencode-workspace term` | Split a pane to the right as a plain terminal. |

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
| `github` | GitHub API via `@modelcontextprotocol/server-github` (requires `GITHUB_TOKEN`) |

## Prerequisites

- `tmux`
- `git`
- `curl`
- Node.js >= 18
