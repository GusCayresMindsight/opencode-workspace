Feature: Installation
  Running "npm install -g @gus/opencode-workspace" installs the package and
  automatically triggers a postinstall hook that sets up all required system
  dependencies.  The explicit "opencode-workspace install" command can be
  re-run at any time to repair or update individual dependencies.

  Each install step is wrapped in a try/catch so a single failure (for
  example, a network error when downloading glab) warns and continues rather
  than aborting the entire setup.

  @wip
  Scenario: Postinstall runs automatically after npm install
    When "npm install -g @gus/opencode-workspace" is run
    Then the postinstall hook calls "opencode-workspace install" automatically

  @wip
  Scenario: Install sets up uv if not already present
    Given "uv" is not installed on the system
    When the user runs "opencode-workspace install"
    Then uv is downloaded and installed via the Astral installer script
    And uv is available on PATH under ~/.local/bin

  @wip
  Scenario: Install sets up glab if not already present
    Given "glab" is not installed on the system
    When the user runs "opencode-workspace install"
    Then the latest glab release is fetched from the GitLab API
    And the glab binary is installed to ~/.local/bin/glab

  @wip
  Scenario: Install sets up opencode if not already present
    Given "opencode" is not installed on the system
    When the user runs "opencode-workspace install"
    Then opencode is installed at the version pinned in package.json["opencode"]["version"]
    And the installer script is fetched from https://opencode.ai/install

  @wip
  Scenario: Install sets up semgrep if not already present
    Given "semgrep" is not installed on the system
    When the user runs "opencode-workspace install"
    Then semgrep is installed via "uv tool install semgrep"

  @wip
  Scenario: Install copies the TUI retrieval plugin
    When the user runs "opencode-workspace install"
    Then the file ~/.config/opencode/plugins/ow-tool-retrieval.js is created
    And its contents match lib/tool-retrieval.plugin.js

  @wip
  Scenario: Already-installed dependencies are skipped without error
    Given all dependencies (uv, glab, opencode, semgrep) are already installed
    When the user runs "opencode-workspace install"
    Then each dependency's existing version is logged to stdout
    And no download or install step is retried

  @wip
  Scenario: A failing install step warns and continues
    Given the glab download fails with a network error
    When the user runs "opencode-workspace install"
    Then a warning is printed containing "glab failed"
    And a hint "Re-run: opencode-workspace install" is printed
    And the remaining steps (opencode, semgrep, plugin) still run
