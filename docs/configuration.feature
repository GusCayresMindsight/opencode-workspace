Feature: Configuration
  opencode-workspace reads ~/.config/opencode-workspace/config.json and
  deep-merges it over built-in defaults. When the file is absent or unparseable
  the defaults apply without interrupting the command.

  Scenario: Defaults apply when no config file exists
    Given ~/.config/opencode-workspace/config.json does not exist
    When any command that uses embedding or retrieval runs
    Then the embedding provider is "local"
    And the embedding model is "Xenova/all-MiniLM-L6-v2"
    And K is 10
    And the retrieval strategy is "topk"

  Scenario: A custom K is respected
    Given config.json sets "retrieval.k" to 5
    When the user runs a one-shot prompt
    Then at most 5 tools are returned by retrieval

  Scenario: A malformed config file falls back to defaults with two warnings
    Given config.json contains invalid JSON
    When any command that loads configuration runs
    Then two warning lines are printed to stdout
    And the command continues with default configuration

  Scenario: The OpenAI embedding provider requires an API key at construction time
    Given config.json sets "embedding.provider" to "openai"
    And OPENAI_API_KEY is not set in the environment
    And "apiKey" is absent from config.json
    When a command that creates an embedder runs
    Then the command exits with an error message about the missing API key

  Scenario: An unknown embedding provider causes an immediate error
    Given config.json sets "embedding.provider" to "anthropic"
    When a command that creates an embedder runs
    Then the command exits with the error 'Unknown embedding provider: "anthropic"'

  Scenario: Unimplemented retrieval strategies fail at retrieval time
    Given config.json sets "retrieval.strategy" to "agent_first"
    When the user runs a one-shot prompt
    Then the command exits with an error containing "not implemented"

  Scenario: Config is deep-merged so unspecified keys keep their defaults
    Given config.json sets only "retrieval.k" to 20
    When configuration is loaded
    Then "embedding.provider" is still "local"
    And "retrieval.k" is 20
