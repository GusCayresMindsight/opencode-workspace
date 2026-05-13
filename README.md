# opencode-workspace

Launches [OpenCode](https://opencode.ai) AI agents in a tmux split-pane layout, from any directory.
Auto-creates a tmux session if you're not already in one.

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

```bash
opencode-workspace                  # launch OpenCode agent (default, auto-creates tmux)
opencode-workspace agent            # same as above
opencode-workspace term             # split pane to the right, plain terminal
```

## Commands

| Command | Description |
|---|---|
| `opencode-workspace` (default) | Launch the OpenCode agent. Auto-creates a tmux session if needed. |
| `opencode-workspace init [--force]` | Write `~/.config/opencode/opencode.json` from the bundled template. Does nothing if the file already exists (`--force` to overwrite). |
| `opencode-workspace install` | Install dependencies: uv, glab, opencode, semgrep. |
| `opencode-workspace agent` | Split a pane to the right in the current directory and run opencode. |
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
