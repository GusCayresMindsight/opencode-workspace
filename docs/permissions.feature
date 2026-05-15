Feature: Permission Composition for the Temporary Config
  The temp config extends the workspace template with deny rules for servers
  that have no retrieved tools. Only deny rules are generated; user-defined
  permission entries are always preserved and never overridden.

  Scenario: Non-retrieved servers receive a wildcard deny rule
    Given the workspace template defines servers: github, notion, playwright
    And retrieval returns tools only from "github"
    When the temp config is composed
    Then the temp config contains "mcp_notion_*": "deny"
    And the temp config contains "mcp_playwright_*": "deny"

  Scenario: Retrieved servers receive no deny rule
    Given the workspace template defines servers: github, notion
    And retrieval returns tools only from "github"
    When the temp config is composed
    Then the temp config contains no permission rule for "github"

  Scenario: When all servers are retrieved no deny rules are added
    Given retrieval returns tools from every configured server
    When the temp config is composed
    Then the temp config adds no permission deny rules

  Scenario: The user's existing deny rule for a retrieved server is preserved
    Given the user's global OpenCode config contains "mcp_github_*": "deny"
    And retrieval returns tools from "github"
    When the temp config is composed
    Then "mcp_github_*": "deny" is present in the temp config

  Scenario: The user's existing deny rule for a non-retrieved server is not duplicated
    Given the user's global OpenCode config already contains "mcp_notion_*": "deny"
    And retrieval returns no tools from "notion"
    When the temp config is composed
    Then "mcp_notion_*" appears exactly once in the permission map

  Scenario: Only "deny" values are ever generated
    Given any retrieval result
    When the temp config is composed
    Then every generated permission entry uses the value "deny"
    And no "allow" values are present among the generated entries

  Scenario: Filtering is server-level not tool-level
    Given a server exposes ten tools
    And retrieval returns exactly one of those ten tools
    When the temp config is composed
    Then no deny rule is added for that server
    And all ten of its tools remain accessible to opencode
