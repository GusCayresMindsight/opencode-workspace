Feature: MCP Environment Secrets (mcp env)
  "opencode-workspace mcp env VAR_NAME" prompts for a secret value and stores
  it in ~/.local/share/opencode/mcp.env in KEY=value format, one entry per line.

  MCP servers that reference {env:VAR_NAME} in lib/opencode.json.template
  automatically receive the stored value at startup via environment injection.
  The directory is created if it does not exist.  Re-running the command with
  the same key updates the value in-place without duplicating the entry.

  @wip
  Scenario: Secret is stored after interactive prompt
    Given the user runs "opencode-workspace mcp env GITHUB_TOKEN"
    When the user types a secret value and presses Enter
    Then the value is stored in ~/.local/share/opencode/mcp.env as "GITHUB_TOKEN=<value>"
    And "Saved GITHUB_TOKEN to <path>" is printed to stdout

  Scenario: mcp.env uses KEY=value format with one entry per line
    Given ~/.local/share/opencode/mcp.env contains:
      """
      GITHUB_TOKEN=ghp_abc123
      NOTION_TOKEN=secret_xyz
      """
    When the mcp.env file is parsed
    Then GITHUB_TOKEN resolves to "ghp_abc123"
    And NOTION_TOKEN resolves to "secret_xyz"

  Scenario: Storing a second key does not overwrite the first
    Given ~/.local/share/opencode/mcp.env already contains "GITHUB_TOKEN=ghp_abc123"
    When "NOTION_TOKEN=secret_xyz" is added to mcp.env
    Then both GITHUB_TOKEN and NOTION_TOKEN are present in mcp.env

  Scenario: Storing an existing key updates its value in-place
    Given ~/.local/share/opencode/mcp.env already contains "GITHUB_TOKEN=old_token"
    When "GITHUB_TOKEN=new_token" is written to mcp.env
    Then GITHUB_TOKEN resolves to "new_token"
    And there is only one GITHUB_TOKEN entry in mcp.env

  Scenario: The mcp.env directory is created automatically if absent
    Given ~/.local/share/opencode/ does not exist
    When the mcp.env file is written
    Then the directory ~/.local/share/opencode/ is created automatically

  @wip
  Scenario: Missing VAR_NAME argument prints usage and exits with code 1
    When the user runs "opencode-workspace mcp env" without a variable name
    Then "Usage: opencode-workspace mcp env VAR_NAME" is printed to stderr
    And the process exits with code 1
