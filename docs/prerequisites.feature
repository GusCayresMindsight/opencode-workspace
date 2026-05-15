Feature: Prerequisites
  opencode-workspace requires Node.js >= 18 for all commands.
  The TUI commands (agent, term) additionally require tmux.
  The install command requires curl and, for semgrep, uv.
  Standard development workflows assume git is available.

  The Node.js version requirement is declared in package.json["engines"]["node"]
  and is enforceable at install time by npm/pnpm/yarn.  The system tool
  requirements (tmux, curl, git) are discovered at runtime: the command that
  needs them will fail with a clear error message if they are absent.

  Scenario: The package.json engines field requires Node.js 18 or higher
    When package.json is read
    Then the "engines.node" field is ">=18"

  Scenario: The running Node.js version satisfies the declared engine requirement
    Given the current Node.js version is 18 or higher
    When any opencode-workspace command is run
    Then the command does not exit with a "Node version" error

  @wip
  Scenario: tmux is required for the agent command
    Given "tmux" is not installed on the system
    When the user runs "opencode-workspace agent"
    Then an error is printed and the process exits with a non-zero code

  @wip
  Scenario: tmux is required for the term command
    Given "tmux" is not installed on the system
    When the user runs "opencode-workspace term"
    Then an error is printed and the process exits with a non-zero code

  @wip
  Scenario: curl is required by the install command for downloading uv and opencode
    Given "curl" is not installed on the system
    When the user runs "opencode-workspace install"
    Then the steps that invoke curl fail with a warning
    And the remaining install steps that do not require curl still run

  @wip
  Scenario: git is available as a standard development tool
    Given "git" is installed on the system
    When git-dependent workflows are run inside the tmux workspace
    Then git commands execute without PATH or permission errors
