Feature: TUI First-Message Retrieval Hook
  When the user opens an interactive OpenCode TUI session via opencode-workspace,
  the ow-tool-retrieval plugin (installed to ~/.config/opencode/plugins/) fires
  on the first user message in each session.  It embeds that message, searches
  the local tool corpus, and injects the ranked results as system context via
  client.session.prompt({ noReply: true }) before the LLM responds.

  The plugin is installed automatically by `opencode-workspace install` and
  requires the corpus to have been built by `opencode-workspace index`.
  All failures are silently swallowed so normal TUI operation is never disrupted.

  Scenario: Plugin injects tool context on the first user message
    Given the tool corpus has been indexed
    And the ow-tool-retrieval plugin is installed in ~/.config/opencode/plugins/
    When the user opens an opencode TUI session via opencode-workspace
    And the user types their first message "list open pull requests on GitHub"
    Then the plugin detects the first user message in the session
    And it calls "opencode-workspace retrieve --json" with the message text as the query
    And it injects the retrieval results as a system context block via client.session.prompt
    And the injected message has noReply set to true so no extra AI turn is triggered
    And the injected text begins with "[Tool Retrieval]"

  Scenario: Retrieval fires once per session even if multiple messages arrive
    Given the tool corpus has been indexed
    And the ow-tool-retrieval plugin is installed
    When the user sends a first message in a session
    And the user sends a second message in the same session
    Then the plugin only fires retrieval for the first message
    And no context injection occurs for subsequent messages in the same session

  Scenario: Plugin is silent when the corpus has not been built
    Given the tool corpus does not exist (index has not been run)
    When the user opens an opencode TUI session and sends a first message
    Then the plugin calls "opencode-workspace retrieve --json" which exits with empty output
    And no context injection is performed
    And the TUI session continues normally without errors

  Scenario: Plugin is silent when opencode-workspace is not in PATH
    Given opencode-workspace is not in PATH
    When the user opens an opencode TUI session and sends a first message
    Then the retrieve subprocess call fails
    And the plugin swallows the error silently
    And the TUI session continues normally without errors

  Scenario: Non-user messages do not trigger retrieval
    Given the tool corpus has been indexed
    And the ow-tool-retrieval plugin is installed
    When the session receives an assistant message update
    Then the plugin does not trigger retrieval
    And no context injection is performed

  Scenario: Tool context correctly lists the most relevant tools
    Given the tool corpus has been indexed with the GitHub and Notion MCP servers
    When the user's first message is "review my open GitHub pull requests"
    Then the injected context lists tools from the "github" server near the top
    And each entry shows the server name, tool name, relevance score, and description
