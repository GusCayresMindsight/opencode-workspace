Feature: MCP Tool Corpus Indexing
  ow corpus index reads the mcp server list from the active opencode config
  (checked in priority order: OPENCODE_CONFIG env, .opencode/opencode.json,
  ~/.config/opencode/opencode.json), calls listTools() on each server, embeds
  "<server> / <tool>: <description>" per tool, and persists the result to
  ~/.config/ow/tools.db. Re-runs are incremental.

  Scenario: First-time indexing stores all tools
    Given the tool corpus does not exist
    When ow corpus index is run with a mock server config
    Then each tool's name, description, input schema, schema hash, and embedding
    are stored in the corpus
    And exits with code 0

  Scenario: Incremental run skips unchanged tools
    Given the tool corpus already contains tools from a previous index
    And no tool descriptions or schemas have changed
    When ow corpus index is run
    Then no tools are re-embedded
    And exits with code 0

  Scenario: A tool with a changed schema is re-embedded
    Given the tool corpus contains a tool with a known schema hash
    And that tool's input schema has changed since the last index
    When ow corpus index is run
    Then the tool is re-embedded
    And its schema hash is updated in the corpus

  Scenario: --force re-embeds all tools regardless of the hash cache
    Given the tool corpus already contains indexed tools
    When ow corpus index --force is run
    Then every tool is re-embedded

  Scenario: A server that fails to connect is skipped with a warning
    Given one MCP server is unreachable or misconfigured
    When ow corpus index is run
    Then a warning is printed for the failed server
    And indexing continues for the remaining servers
    And exits with code 0

  Scenario: All servers fail to connect
    Given no MCP server can be reached
    When ow corpus index is run
    Then an error message is printed
    And exits with code 1

  Scenario: {env:VAR} placeholders in server config are resolved from mcp.env before connecting
    Given a server's environment config contains a placeholder like {env:NOTION_TOKEN}
    And the secret is stored in ~/.local/share/opencode/mcp.env
    When ow corpus index is run
    Then the placeholder is replaced with the secret value before spawning the server process
