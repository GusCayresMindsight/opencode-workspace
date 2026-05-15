Feature: Semantic Tool Retrieval
  The search() function embeds a query string and returns the top-K most
  similar tools from the corpus, ranked by cosine similarity. ow corpus
  retrieve exposes this pipeline as a CLI command. All progress messages go
  to stderr; structured output (human-readable or JSON) goes to stdout.

  Scenario: Results are ordered by descending cosine similarity
    Given the tool corpus contains tools with known embeddings
    When search() is called with a query
    Then the results are ordered from highest to lowest score
    And each result contains server_name, tool_name, description, and score

  Scenario: k limits the number of results
    Given the tool corpus contains more than 3 tools
    When search() is called with k=3
    Then at most 3 tools are returned

  Scenario: Empty corpus returns an empty result set
    Given the tool corpus has not been built
    When search() is called with any query
    Then an empty array is returned

  Scenario: Unimplemented retrieval strategies fail at search time
    Given config sets retrieval.strategy to "agent_first"
    When search() is called
    Then an error is thrown containing "not implemented"

  Scenario: ow corpus retrieve prints results to stdout
    Given the tool corpus has been indexed
    When the user runs "ow corpus retrieve <query>"
    Then the retrieved tools are written to stdout
    And each line shows the score, server name, tool name, and description
    And progress messages are written to stderr

  Scenario: ow corpus retrieve --json emits a JSON array to stdout
    Given the tool corpus has been indexed
    When the user runs "ow corpus retrieve --json <query>"
    Then a valid JSON array is written to stdout
    And each element has server_name, tool_name, description, and score fields

  Scenario: ow corpus retrieve warns and exits cleanly when corpus is empty
    Given the tool corpus has not been built
    When the user runs "ow corpus retrieve <query>"
    Then a warning is printed to stderr advising the user to run "ow corpus index"
    And the process exits with code 0
