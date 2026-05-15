Feature: Bundled MCP Servers
  lib/opencode.json.template is the single source of truth for which MCP
  servers ship with opencode-workspace.  Changes to the template affect both
  indexing (which servers are crawled for tools) and one-shot retrieval
  (which servers can be filtered by deny rules).

  Every server must declare a "type" of either "local" (spawned as a child
  process via "command") or "remote" (reached via a "url").  Servers that
  require secrets reference them as {env:VAR_NAME}; the CLI resolves these
  from ~/.local/share/opencode/mcp.env at startup.

  Scenario: The template includes the notion server
    When lib/opencode.json.template is read
    Then a server named "notion" is defined
    And its type is "local"
    And its command starts with "npx"

  Scenario: The template includes the gitlab server
    When lib/opencode.json.template is read
    Then a server named "gitlab" is defined
    And its type is "local"
    And its command sequence is "glab,mcp,serve"

  Scenario: The template includes the playwright server
    When lib/opencode.json.template is read
    Then a server named "playwright" is defined
    And its type is "local"
    And its command starts with "npx"

  Scenario: The template includes the fetch server
    When lib/opencode.json.template is read
    Then a server named "fetch" is defined
    And its type is "local"
    And its command starts with "uvx"

  Scenario: The template includes the semgrep server
    When lib/opencode.json.template is read
    Then a server named "semgrep" is defined
    And its type is "local"
    And its command sequence is "semgrep,mcp"

  Scenario: The template includes the aws-knowledge server as a remote server
    When lib/opencode.json.template is read
    Then a server named "aws-knowledge" is defined
    And its type is "remote"
    And its url is "https://knowledge-mcp.global.api.aws"

  Scenario: The template includes the sequential-thinking server
    When lib/opencode.json.template is read
    Then a server named "sequential-thinking" is defined
    And its type is "local"
    And its command starts with "npx"

  Scenario: The github server requires a GITHUB_TOKEN from mcp.env
    When lib/opencode.json.template is read
    Then a server named "github" is defined
    And its type is "local"
    And its environment references "{env:GITHUB_TOKEN}"

  Scenario: The brave-search-mcp-server requires a BRAVE_API_KEY from mcp.env
    When lib/opencode.json.template is read
    Then a server named "brave-search-mcp-server" is defined
    And its type is "local"
    And its environment references "{env:BRAVE_API_KEY}"

  Scenario: The tool-retrieval server is always included and self-hosted
    When lib/opencode.json.template is read
    Then a server named "tool-retrieval" is defined
    And its type is "local"
    And its command sequence is "opencode-workspace,mcp-serve"
