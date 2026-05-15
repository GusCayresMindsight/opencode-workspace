Feature: MCP Environment Secrets
  MCP server secrets are stored in ~/.local/share/opencode/mcp.env in
  KEY=value format, one entry per line. ow corpus index reads this file
  and resolves {env:VAR_NAME} placeholders in server configs before
  spawning child processes.

  Scenario: mcp.env uses KEY=value format with one entry per line
    Given ~/.local/share/opencode/mcp.env contains:
      """
      GITHUB_TOKEN=ghp_abc123
      NOTION_TOKEN=secret_xyz
      """
    When loadMcpEnvFromFile() parses the file
    Then GITHUB_TOKEN resolves to "ghp_abc123"
    And NOTION_TOKEN resolves to "secret_xyz"

  Scenario: Multiple keys coexist independently
    Given mcp.env contains both GITHUB_TOKEN and NOTION_TOKEN entries
    When loadMcpEnvFromFile() parses the file
    Then both keys are present in the returned map

  Scenario: Missing file returns an empty map
    Given the mcp.env file does not exist
    When loadMcpEnvFromFile() is called
    Then an empty object is returned

  Scenario: Lines without an equals sign are ignored
    Given mcp.env contains a line with no "=" character
    When loadMcpEnvFromFile() parses the file
    Then that line does not appear in the returned map

  Scenario: Values that contain "=" are preserved correctly
    Given mcp.env contains "TOKEN=abc=def"
    When loadMcpEnvFromFile() parses the file
    Then TOKEN resolves to "abc=def"
