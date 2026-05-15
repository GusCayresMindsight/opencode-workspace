Feature: Session Telemetry
  Each one-shot run with active retrieval appends a structured record to
  ~/.config/opencode-workspace/sessions.jsonl. The stats command reads
  and summarises those records.

  Scenario: A session record is appended after successful retrieval
    Given the tool corpus has been indexed
    When the user runs 'opencode-workspace "some prompt"'
    Then a new line is appended to ~/.config/opencode-workspace/sessions.jsonl
    And the record contains the fields: ts, session_id, prompt, retrieved_tools with scores, corpus_size, embedding_model, and k

  Scenario: sessions.jsonl is valid JSONL after every run
    Given sessions.jsonl contains existing records
    When a new session completes
    Then every line in sessions.jsonl is independently valid JSON

  Scenario: A telemetry write failure is a warning not a fatal error
    Given sessions.jsonl cannot be written
    When a retrieval session runs
    Then a warning is printed
    But opencode is still spawned normally

  Scenario: No record is written when the kill switch is active
    Given OPENCODE_WORKSPACE_RETRIEVAL is set to "off"
    When the user runs any one-shot prompt
    Then sessions.jsonl is not modified

  Scenario: No record is written when the corpus is empty
    Given the tool corpus has not been built
    When the user runs any one-shot prompt
    Then sessions.jsonl is not modified

  Scenario: stats prints a summary of all sessions
    Given sessions.jsonl contains multiple session records
    When the user runs "opencode-workspace stats"
    Then it prints the total number of sessions
    And a ranked list of the most frequently retrieved tools in "server/tool" format
    And average retrieval score, average K, and average corpus size
    And the embedding models used across sessions

  Scenario: stats --last N limits to the most recent N sessions
    Given sessions.jsonl contains more than 5 sessions
    When the user runs "opencode-workspace stats --last 5"
    Then the summary reflects only the 5 most recent sessions

  Scenario: stats with no sessions
    Given sessions.jsonl does not exist
    When the user runs "opencode-workspace stats"
    Then it prints "No sessions recorded yet."
    And it prints the current corpus size
