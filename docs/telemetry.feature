Feature: Session Telemetry
  Each retrieval run appends a structured record to
  ~/.config/ow/sessions.jsonl. ow corpus stats reads and summarises
  those records.

  Scenario: A session record is appended after successful retrieval
    Given appendSession() is called with a valid session record
    Then a new line is appended to sessions.jsonl
    And the record contains the fields: ts, session_id, prompt,
    retrieved_tools with scores, corpus_size, embedding_model, and k

  Scenario: sessions.jsonl is valid JSONL after every run
    Given sessions.jsonl contains existing records
    When a new session is appended
    Then every line in sessions.jsonl is independently valid JSON

  Scenario: A corrupt line in sessions.jsonl is silently skipped
    Given sessions.jsonl contains one corrupt (non-JSON) line
    When readSessions() is called
    Then the corrupt line is skipped
    And valid records are returned normally

  Scenario: stats prints a summary of all sessions
    Given sessions.jsonl contains multiple session records
    When computeStats() is called
    Then it returns the total number of sessions
    And a ranked list of the most frequently retrieved tools in "server/tool" format
    And average retrieval score, average K, and average corpus size
    And the embedding models used across sessions

  Scenario: stats --last N limits to the most recent N sessions
    Given sessions.jsonl contains more than 5 sessions
    When readSessions(5) is called
    Then only the 5 most recent sessions are returned

  Scenario: stats with no sessions
    Given sessions.jsonl does not exist
    When formatStats() is called with an empty stats object
    Then it returns "No sessions recorded yet."
