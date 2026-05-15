Feature: On-Demand Tool Retrieval MCP Tool
  The tool-retrieval MCP server is launched by ow via `ow corpus mcp-serve`.
  It exposes a single MCP tool, search_tools(query, k?), which the agent
  can call at any point to discover MCP tools relevant to the current task.

  Unlike the first-message hook (which fires automatically on the first TUI
  message), this tool gives the agent on-demand, mid-session access to the
  full retrieval pipeline.

  Scenario: search_tools returns a ranked list for a natural-language query
    Given the tool corpus has been indexed
    When handleSearchTools() is called with query "browse the web and fetch a URL"
    Then the response contains a ranked list of MCP tools
    And each entry includes server name, tool name, relevance score, and description
    And isError is false

  Scenario: k parameter limits the number of results
    Given the tool corpus has been indexed with more than 3 tools
    When handleSearchTools() is called with query "run shell commands" and k=3
    Then the response contains at most 3 tools

  Scenario: search_tools defaults to the configured retrieval.k when k is omitted
    Given the configured retrieval.k is 10
    When handleSearchTools() is called with only a query argument
    Then the response contains at most 10 tools

  Scenario: search_tools returns an informative message when the corpus is empty
    Given the tool corpus has not been built
    When handleSearchTools() is called with any query
    Then the response text instructs the user to run "ow corpus index"
    And isError is false

  Scenario: search_tools returns an error for a missing query argument
    When handleSearchTools() is called without a query argument
    Then the response has isError set to true
    And the error message states that the query argument is required
