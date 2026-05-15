Feature: TUI Commands
  Running opencode-workspace without a prompt — or with the "agent" subcommand —
  opens an interactive OpenCode session in a tmux split-pane layout.
  "opencode-workspace term" opens a plain shell pane in the same layout.

  A tmux session named "opencode-workspace" is created automatically when the
  user is not already inside one.  Subsequent invocations from within an
  ow-session stack new panes vertically in the right column rather than
  creating a new session.

  All scenarios in this feature require a live tmux installation and cannot
  be exercised in a unit-test environment.

  @wip
  Scenario: Bare invocation creates a tmux session and opens a two-pane layout
    Given the user is not inside a tmux session
    When the user runs "opencode-workspace"
    Then a tmux session named "opencode-workspace" is created
    And the left pane shows a welcome message with available commands
    And the right pane starts opencode with OPENCODE_CONFIG=lib/opencode.json.template

  @wip
  Scenario: "agent" subcommand is equivalent to bare invocation
    Given the user is not inside a tmux session
    When the user runs "opencode-workspace agent"
    Then the result is identical to running "opencode-workspace" with no arguments

  @wip
  Scenario: "agent" auto-installs opencode if the binary is missing
    Given "opencode" is not installed on the system
    When the user runs "opencode-workspace agent"
    Then opencode is installed before the tmux layout is created

  @wip
  Scenario: "term" splits a plain terminal pane into the current session
    Given the user is inside a tmux session
    When the user runs "opencode-workspace term"
    Then a new pane is added to the session running an interactive shell
    And no opencode process is started in that pane

  @wip
  Scenario: Stacking a second agent inside an ow-session splits vertically
    Given the user is inside a tmux window named "ow-session"
    When the user runs "opencode-workspace agent" a second time
    Then a new opencode pane is split vertically below the existing right-column pane

  @wip
  Scenario: Subsequent windows outside ow-session are named ow-session-2, ow-session-3, …
    Given the user is inside tmux but not in an ow-session window
    And an "ow-session" window already exists
    When the user runs "opencode-workspace agent"
    Then a new window named "ow-session-2" is created

  @wip
  Scenario: MCP environment secrets are injected when launching opencode
    Given ~/.local/share/opencode/mcp.env contains "GITHUB_TOKEN=ghp_test"
    When the user runs "opencode-workspace agent"
    Then opencode is started with GITHUB_TOKEN exported in its environment
