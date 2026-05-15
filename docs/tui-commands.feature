Feature: Workspace TUI Commands
  Running "ow ws" — or "ow ws" with no subcommand — opens an interactive
  ow session in a tmux split-pane layout. "ow ws term" opens a plain shell
  pane in the same layout.

  A tmux session named "ow" is created automatically when the user is not
  already inside one. Subsequent invocations from within an ow session stack
  new panes vertically in the right column rather than creating a new session.

  All scenarios in this feature require a live tmux installation and cannot
  be exercised in a unit-test environment.

  @wip
  Scenario: ow ws creates a tmux session and opens a two-pane layout
    Given the user is not inside a tmux session
    When the user runs "ow ws"
    Then a tmux session named "ow" is created
    And the left pane shows a welcome message with available commands
    And the right pane starts the ow TUI

  @wip
  Scenario: ow ws term splits a plain terminal pane into the current session
    Given the user is inside a tmux session
    When the user runs "ow ws term"
    Then a new pane is added to the session running an interactive shell
    And no ow TUI process is started in that pane

  @wip
  Scenario: Stacking a second agent inside an ow session splits vertically
    Given the user is inside a tmux window named "ow"
    When the user runs "ow ws" a second time
    Then a new ow pane is split vertically below the existing right-column pane

  @wip
  Scenario: Subsequent windows outside ow session are named ow-2, ow-3, …
    Given an "ow" window already exists
    When the user runs "ow ws" from outside that session
    Then a new window named "ow-2" is created

  @wip
  Scenario: MCP environment secrets are available when launching ow
    Given ~/.local/share/opencode/mcp.env contains "GITHUB_TOKEN=ghp_test"
    When the user runs "ow ws"
    Then ow is started with GITHUB_TOKEN exported in its environment
