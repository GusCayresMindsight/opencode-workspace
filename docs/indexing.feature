Feature: MCP Tool Corpus Indexing
  The index command connects to each MCP server in lib/opencode.json.template,
  calls listTools(), embeds "<server> / <tool>: <description>" per tool, and
  persists the result to ~/.config/opencode-workspace/tools.db. Re-runs are incremental.

  Scenario: First-time indexing stores all tools
    Given the tool corpus does not exist
    When the user runs "opencode-workspace index"
    Then the command connects to each configured MCP server
    And embeds the text "<server> / <tool>: <description>" for each tool
    And stores each tool's name, description, input schema, schema hash, and embedding in the corpus
    And prints the count of newly embedded tools per server
    And exits with code 0

  Scenario: Incremental run skips unchanged tools
    Given the tool corpus already contains tools from a previous index
    And no MCP server's tool descriptions or schemas have changed
    When the user runs "opencode-workspace index"
    Then no tools are re-embedded
    And each server line shows the tool count as unchanged
    And exits with code 0

  Scenario: A tool with a changed schema is re-embedded
    Given the tool corpus contains a tool with a known schema hash
    And that tool's input schema has changed since the last index
    When the user runs "opencode-workspace index"
    Then the tool is re-embedded
    And its schema hash is updated in the corpus

  Scenario: --force re-embeds all tools regardless of the hash cache
    Given the tool corpus already contains indexed tools
    When the user runs "opencode-workspace index --force"
    Then every tool is re-embedded
    And the total count of embedded tools equals the number of tools across all reachable servers

  Scenario: A server that fails to connect is skipped with a warning
    Given one MCP server is unreachable or misconfigured
    When the user runs "opencode-workspace index"
    Then a warning is printed for the failed server
    And indexing continues for the remaining servers
    And exits with code 0

  Scenario: All servers fail to connect
    Given no MCP server can be reached
    When the user runs "opencode-workspace index"
    Then an error message is printed
    And exits with code 1

  Scenario: {env:VAR} placeholders in server config are resolved from mcp.env before connecting
    Given a server's environment config contains a placeholder like {env:NOTION_TOKEN}
    And the secret is stored in ~/.local/share/opencode/mcp.env
    When the user runs "opencode-workspace index"
    Then the placeholder is replaced with the secret value before spawning the server process
