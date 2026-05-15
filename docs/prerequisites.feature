Feature: Prerequisites
  Building and running ow requires Bun 1.3.13 (pinned in package.json
  packageManager field). The workspace commands additionally require tmux.

  Scenario: The package.json packageManager field pins Bun 1.3.13
    When package.json is read
    Then the "packageManager" field is "bun@1.3.13"

  Scenario: bun install succeeds from a clean checkout
    Given the repository has been freshly cloned
    When "bun install" is run at the repo root
    Then all workspace packages are resolved without error

  @wip
  Scenario: tmux is required for the ow ws command
    Given "tmux" is not installed on the system
    When the user runs "ow ws"
    Then an error is printed and the process exits with a non-zero code
