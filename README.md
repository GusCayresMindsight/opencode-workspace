# opencode-workspace

Launches [OpenCode](https://opencode.ai) AI agents in a tmux split-pane layout, from any directory.
Includes a **tool-retrieval layer**: before each one-shot session the prompt is embedded and
cosine-searched against the MCP tool corpus, cutting context from 10+ servers down to the top-K matches.

```bash
npm install -g @gus/opencode-workspace
opencode-workspace index          # build tool corpus (first time)
opencode-workspace "find open PRs"    # one-shot: retrieve tools + run opencode
opencode-workspace                # TUI mode: interactive agent in tmux split
```

## Documentation

All behaviour is specified as Gherkin feature files in [`docs/`](docs/):

| Feature file | What it covers |
|---|---|
| [`docs/prerequisites.feature`](docs/prerequisites.feature) | Node ≥ 18, tmux, git, curl |
| [`docs/installation.feature`](docs/installation.feature) | `npm install`, postinstall, `opencode-workspace install` |
| [`docs/mcp-env.feature`](docs/mcp-env.feature) | `mcp env VAR` — storing secrets in `mcp.env` |
| [`docs/mcp-servers.feature`](docs/mcp-servers.feature) | The 10 bundled MCP servers and their configuration |
| [`docs/indexing.feature`](docs/indexing.feature) | `index` — crawling MCP servers and building the corpus |
| [`docs/configuration.feature`](docs/configuration.feature) | `config.json` — embedding providers and retrieval strategy |
| [`docs/retrieval.feature`](docs/retrieval.feature) | One-shot retrieval, kill switch, fallthrough behaviour |
| [`docs/permissions.feature`](docs/permissions.feature) | Deny-rule generation and composition with user config |
| [`docs/telemetry.feature`](docs/telemetry.feature) | Session records, `stats` command |
| [`docs/tui-commands.feature`](docs/tui-commands.feature) | TUI mode: `agent`, `term`, tmux layout |
| [`docs/tool-retrieval-mcp.feature`](docs/tool-retrieval-mcp.feature) | On-demand `search_tools` MCP tool |
| [`docs/tui-retrieval.feature`](docs/tui-retrieval.feature) | TUI first-message hook plugin |
| [`docs/smoke-test.feature`](docs/smoke-test.feature) | `make smoke` — end-to-end validation |

Scenarios tagged `@wip` require a live environment (real binaries, tmux, network) and are skipped
by `npm test`. Run `make smoke` for end-to-end validation.

## Running the tests

```bash
npm test      # unit tests — skips @wip scenarios
make smoke    # end-to-end: real MCP servers, real index, real retrieval
```

## References

> Lumer, E., Nizar, F., Gulati, A., Honaganahalli Basavaraju, P., & Subbiah, V. K. (2025).
> *Tool-to-Agent Retrieval: Bridging Tools and Agents for Scalable LLM Multi-Agent Systems.*
> arXiv:2511.01854. <https://arxiv.org/abs/2511.01854>
