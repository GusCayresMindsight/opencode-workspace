Feature: One-Shot Tool Retrieval
  Passing a prompt string to opencode-workspace embeds it, searches the corpus for
  the top-K most similar tools, and spawns "opencode run" with a filtered config.
  Every retrieval-related message is written to stderr; stdout belongs to opencode.

  Scenario: Successful retrieval launches opencode with a filtered config
    Given the tool corpus has been indexed
    When the user runs 'opencode-workspace "find open PRs assigned to me"'
    Then the prompt is embedded using the configured model
    And the top-K tools are retrieved by cosine similarity
    And a temporary config file is written to /tmp
    And "opencode run" is spawned with OPENCODE_CONFIG pointing at that file
    And the temporary config file is deleted after opencode exits
    And the retrieved tool names and scores are printed to stderr

  Scenario: A GitHub prompt retrieves GitHub tools in the top results
    Given the tool corpus has been indexed with the GitHub MCP server
    When the user runs 'opencode-workspace "list open pull requests on GitHub"'
    Then at least one tool from the "github" server appears in the top-5 results

  Scenario: The kill switch disables all retrieval and telemetry
    Given OPENCODE_WORKSPACE_RETRIEVAL is set to "off"
    When the user runs 'opencode-workspace "any prompt"'
    Then no corpus lookup is performed
    And "opencode run" is spawned directly without a custom OPENCODE_CONFIG
    And no session is recorded in sessions.jsonl

  Scenario: An empty corpus falls through with a warning
    Given the tool corpus has not been built
    When the user runs 'opencode-workspace "do something"'
    Then a warning is printed advising the user to run "opencode-workspace index"
    And "opencode run" is spawned without filtering
    And no session is recorded in sessions.jsonl

  Scenario: A retrieval failure falls through without crashing
    Given the corpus exists but the embedding step throws an error
    When the user runs 'opencode-workspace "do something"'
    Then a warning is printed
    And "opencode run" is spawned without filtering

  Scenario: A config composition failure falls through without crashing
    Given the template file cannot be read at composition time
    When the user runs 'opencode-workspace "do something"'
    Then a warning is printed
    And "opencode run" is spawned without filtering

  Scenario: A telemetry write failure does not block the session
    Given sessions.jsonl cannot be written
    When a retrieval session runs
    Then a warning is printed
    But "opencode run" is still spawned normally

  Scenario: Multiple argument words are joined into a single prompt
    When the user runs 'opencode-workspace find open PRs'
    Then the prompt passed to opencode is "find open PRs"
    And the corpus search uses the full joined string
