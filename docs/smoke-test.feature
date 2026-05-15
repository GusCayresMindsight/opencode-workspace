Feature: Smoke Test
  "make smoke" is the end-to-end validation that the full
  index → embed → retrieve pipeline is working correctly against real MCP
  servers.  It is not a unit test: it requires a live network connection,
  all bundled MCP servers to be reachable, and a fully installed
  opencode-workspace environment.

  The canonical passing criterion is: after running "opencode-workspace index",
  querying "list open pull requests on GitHub" must return a tool from the
  "github" server as the top result.

  All scenarios in this feature are end-to-end integration tests and cannot
  be exercised in a unit-test environment.

  @wip
  Scenario: make smoke exits with code 0 when everything works
    Given opencode-workspace is installed and all MCP servers are reachable
    When "make smoke" is run
    Then the exit code is 0

  @wip
  Scenario: The github server's tools are the top result for a GitHub query
    Given the corpus has been freshly built by "opencode-workspace index"
    When the query "list open pull requests on GitHub" is submitted via "opencode-workspace retrieve"
    Then the top result belongs to the "github" server

  @wip
  Scenario: make smoke fails when the corpus has not been indexed
    Given the corpus has not been built
    When "make smoke" is run
    Then the exit code is non-zero
    And an error or warning message advises running "opencode-workspace index"

  @wip
  Scenario: Incremental index does not break retrieval accuracy
    Given the corpus was previously indexed
    And one MCP server's schema has changed
    When "opencode-workspace index" is run again
    Then only the changed server's tools are re-embedded
    And retrieval accuracy for other servers is unchanged
