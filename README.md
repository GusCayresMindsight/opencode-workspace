# opencode-workspace

A tmux-based workspace for running [OpenCode](https://opencode.ai) agents, with session persistence via tmux-resurrect and tmux-continuum.

## Prerequisites

- `tmux`
- `git`
- `curl`

Everything else is installed by `make install`.

## Quick start

```bash
git clone https://github.com/GusCayresMindsight/opencode-workspace.git
cd opencode-workspace
cp .env.example .env  # fill in your API keys
make install
make start
```

## Commands

| Command | Description |
|---|---|
| `make install` | Install all dependencies (no sudo required) |
| `make start` | Check deps, then start or attach to session |
| `make start-clean` | Check deps, then start a fresh session |
| `make agent` | Spawn an interactive OpenCode agent in a new pane |
| `make ask p="..."` | Spawn an OpenCode agent with a prompt in a new pane |
| `make save` | Save current session state |
| `make stop` | Save state and kill the session |
