Feature: On-Demand Tool Retrieval MCP Tool
  The tool-retrieval MCP server is always present in lib/opencode.json.template
  and is launched by opencode via `opencode-workspace mcp-serve`.  It exposes a
  single MCP tool, search_tools(query, k?), which the agent can call at any point
  to discover MCP tools that are relevant to the current task.

  Unlike the one-shot permission filter (which gates access before the session
  starts) and the first-message hook (which fires automatically on the first TUI
  message), this tool gives the agent on-demand, mid-session access to the full
  retrieval pipeline.  The agent calls it proactively whenever it suspects that
  a needed capability exists but is not yet in its active context.

  The tool-retrieval server is listed in ALWAYS_ALLOWED in src/retrieval/permissions.js
  and is therefore never denied by the one-shot permission generator.

  Scenario: search_tools returns a ranked list for a natural-language query
    Given the tool corpus has been indexed
    And the tool-retrieval MCP server is running
    When the agent calls search_tools with query "browse the web and fetch a URL"
    Then the response contains a ranked list of MCP tools
    And each entry includes the server name, tool name, relevance score, and description
    And the results are ordered by descending relevance score

  Scenario: k parameter limits the number of results
    Given the tool corpus has been indexed with more than 3 tools
    And the tool-retrieval MCP server is running
    When the agent calls search_tools with query "run shell commands" and k=3
    Then the response contains at most 3 tools

  Scenario: search_tools defaults to the configured retrieval.k when k is omitted
    Given the tool corpus has been indexed
    And the configured retrieval.k is 10
    When the agent calls search_tools with only a query argument
    Then the response contains at most 10 tools

  Scenario: search_tools returns an informative message when the corpus is empty
    Given the tool corpus has not been built
    When the agent calls search_tools with any query
    Then the response text instructs the user to run "opencode-workspace index"
    And isError is false (this is a graceful informational response)

  Scenario: search_tools returns an error for a missing query argument
    Given the tool-retrieval MCP server is running
    When the agent calls search_tools without a query argument
    Then the response has isError set to true
    And the error message states that the query argument is required

  Scenario: search_tools is always accessible in one-shot sessions
    Given the tool corpus has been indexed
    And the one-shot session retrieves tools that do NOT include the tool-retrieval server
    When the temp config permission rules are generated
    Then no deny rule is emitted for the "tool-retrieval" server
    And the agent can still call search_tools during the session

  Scenario: Relevant tools are surfaced even without prior knowledge
    Given the tool corpus has been indexed with the Playwright MCP server
    And an opencode session is active with no specific browser tools in context
    When the agent calls search_tools with query "click a button in a web page"
    Then at least one tool from the "playwright" server appears in the results

  # ── Server wiring tests (the gap that let the startup crash go undetected) ──

  Scenario: The MCP server wires request handlers with Zod schemas not plain objects
    When the MCP server is configured with a mock SDK
    Then setRequestHandler was called twice
    And the list-tools handler schema is a valid Zod schema
    And the call-tool handler schema is a valid Zod schema

  Scenario: list-tools returns the search_tools manifest over the wire protocol
    When the MCP server handles a list-tools request via in-memory transport
    Then the response contains a tool named "search_tools"
    And the search_tools tool declares a required "query" input parameter

  Scenario: call-tool returns a valid CallToolResult envelope over the wire protocol
    Given the tool corpus has not been built
    When the MCP server handles a call-tool request for "search_tools" via in-memory transport
    Then the response is a valid CallToolResult with a content array
    And the content text is a non-empty string
