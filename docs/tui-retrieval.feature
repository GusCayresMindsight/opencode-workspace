Feature: TUI First-Message Retrieval Hook
  When the user opens an interactive ow TUI session, the built-in
  ToolRetrievalPlugin fires on the first user message in each session.
  It embeds that message, searches the local tool corpus, and injects
  the ranked results as system context via client.session.prompt({ noReply: true })
  before the LLM responds.

  The plugin is registered in packages/opencode/src/plugin/index.ts as
  a member of INTERNAL_PLUGINS — no separate install is required.
  All failures are silently swallowed so normal TUI operation is never disrupted.

  Scenario: Plugin injects tool context on the first user message
    Given the tool corpus has been indexed
    When handleFirstMessage() is called with text and a mock client
    Then the client.session.prompt is called with noReply: true
    And the injected text begins with "[Tool Retrieval]"
    And the result has injected: true

  Scenario: Retrieval fires once per session even if multiple messages arrive
    Given the tool corpus has been indexed
    When the handler is called for a first message in a session
    And the handler is called again for a second message in the same session
    Then client.session.prompt is called exactly once

  Scenario: Plugin is silent when the corpus has not been built
    Given the tool corpus does not exist
    When handleFirstMessage() is called
    Then the result has injected: false and reason: "empty corpus"
    And client.session.prompt is not called

  Scenario: Plugin is silent when search throws an error
    Given the search function is configured to throw an error
    When handleFirstMessage() is called
    Then the result has injected: false and reason starting with "search failed:"
    And client.session.prompt is not called

  Scenario: Non-user messages do not trigger retrieval
    Given the tool corpus has been indexed
    When the event handler receives a message with role "assistant"
    Then client.session.prompt is not called

  Scenario: formatToolContext output begins with [Tool Retrieval]
    Given a list of retrieval hits
    When formatToolContext() is called
    Then the first line is "[Tool Retrieval] Most relevant MCP tools for your request:"
    And each hit entry shows server/tool name, score, and description
