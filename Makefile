# Usage:
#   make install         — install all dependencies (no sudo required)
#   make start           — check deps, then start or attach (restores last saved state)
#   make start-clean     — check deps, then start a fresh session (no restore)
#   make save            — save current session state now
#   make agent           — spawn an interactive opencode agent in a new pane
#   make ask p="prompt"  — spawn an opencode agent with a prompt in a new pane
#   make stop            — save state and kill the session

ifneq (,$(wildcard .env))
  include .env
  export
endif

OPENCODE_CONFIG ?= .opencode/opencode.json
export OPENCODE_CONFIG

.PHONY: install start start-clean save agent ask stop \
        _check-deps _install-tmux-plugins _install-uv _install-glab \
        _install-opencode _install-semgrep

export PATH := $(HOME)/.local/bin:$(HOME)/.opencode/bin:$(PATH)

PLUGINS_DIR       := $(HOME)/.tmux/plugins
RESURRECT_DIR     := $(PLUGINS_DIR)/tmux-resurrect
CONTINUUM_DIR     := $(PLUGINS_DIR)/tmux-continuum
RESURRECT_SAVE    := $(RESURRECT_DIR)/scripts/save.sh
RESURRECT_RESTORE := $(RESURRECT_DIR)/scripts/restore.sh
TMUX_CONF         := $(CURDIR)/.tmux.conf

# ─── Dependency installation (no sudo required) ───────────────────────────────

install: _install-tmux-plugins _install-uv _install-glab _install-opencode _install-semgrep
	@echo "All dependencies installed. Run 'make start' to begin."

_install-tmux-plugins:
	@mkdir -p $(PLUGINS_DIR)
	@[ -d $(RESURRECT_DIR) ] \
		&& echo "tmux-resurrect already installed" \
		|| git clone --depth 1 https://github.com/tmux-plugins/tmux-resurrect $(RESURRECT_DIR)
	@[ -d $(CONTINUUM_DIR) ] \
		&& echo "tmux-continuum already installed" \
		|| git clone --depth 1 https://github.com/tmux-plugins/tmux-continuum $(CONTINUUM_DIR)

_install-uv:
	@if command -v uv >/dev/null 2>&1; then \
		echo "uv already installed: $$(uv --version)"; \
	else \
		echo "Installing uv..."; \
		curl -LsSf https://astral.sh/uv/install.sh | sh; \
	fi

_install-glab:
	@if command -v glab >/dev/null 2>&1; then \
		echo "glab already installed: $$(glab --version 2>&1 | head -1)"; \
	else \
		echo "Installing glab..."; \
		GLAB_VER=$$(curl -s https://api.github.com/repos/gitlab-org/cli/releases/latest \
			| grep -oP '"tag_name": "\K[^"]+') && \
		curl -sL "https://gitlab.com/gitlab-org/cli/-/releases/$${GLAB_VER}/downloads/glab_linux_amd64.tar.gz" \
			| tar -xz -C /tmp && \
		mkdir -p $(HOME)/.local/bin && \
		cp /tmp/bin/glab $(HOME)/.local/bin/glab; \
	fi

_install-opencode:
	@if command -v opencode >/dev/null 2>&1; then \
		echo "opencode already installed: $$(opencode --version 2>&1 | head -1)"; \
	else \
		echo "Installing opencode..."; \
		curl -fsSL https://opencode.ai/install | bash; \
	fi

_install-semgrep:
	@if command -v semgrep >/dev/null 2>&1; then \
		echo "semgrep already installed: $$(semgrep --version)"; \
	else \
		echo "Installing semgrep via uv..."; \
		uv tool install semgrep; \
	fi

# ─── Dependency check ─────────────────────────────────────────────────────────

_check-deps:
	@missing=""; \
	command -v tmux     >/dev/null 2>&1 || missing="$$missing tmux"; \
	command -v node     >/dev/null 2>&1 || missing="$$missing node"; \
	command -v npx      >/dev/null 2>&1 || missing="$$missing npx"; \
	command -v uv       >/dev/null 2>&1 || missing="$$missing uv"; \
	command -v uvx      >/dev/null 2>&1 || missing="$$missing uvx"; \
	command -v glab     >/dev/null 2>&1 || missing="$$missing glab"; \
	command -v semgrep  >/dev/null 2>&1 || missing="$$missing semgrep"; \
	command -v opencode >/dev/null 2>&1 || missing="$$missing opencode"; \
	[ -d $(RESURRECT_DIR) ]             || missing="$$missing tmux-resurrect"; \
	[ -d $(CONTINUUM_DIR) ]             || missing="$$missing tmux-continuum"; \
	if [ -n "$$missing" ]; then \
		echo "ERROR: missing dependencies:$$missing"; \
		echo "Run 'make install' to install them."; \
		exit 1; \
	fi

# ─── Session lifecycle ────────────────────────────────────────────────────────

start: _check-deps
	@if tmux has-session -t opencode 2>/dev/null; then \
		tmux attach-session -t opencode; \
	else \
		tmux -f "$(TMUX_CONF)" new-session -d -s opencode; \
		if [ -f "$(RESURRECT_RESTORE)" ]; then \
			tmux run-shell "$(RESURRECT_RESTORE)"; \
			sleep 0.5; \
		fi; \
		tmux attach-session -t opencode; \
	fi

start-clean: _check-deps
	@tmux kill-session -t opencode 2>/dev/null || true
	tmux -f "$(TMUX_CONF)" new-session -s opencode

save:
	@if [ -f "$(RESURRECT_SAVE)" ]; then \
		bash "$(RESURRECT_SAVE)" && echo "State saved."; \
	else \
		echo "tmux-resurrect not installed. Run: make install"; \
	fi

stop:
	@if [ -f "$(RESURRECT_SAVE)" ]; then \
		echo "Saving state..."; \
		bash "$(RESURRECT_SAVE)"; \
		sleep 0.5; \
	fi
	tmux kill-session -t opencode

# ─── Agent panes ─────────────────────────────────────────────────────────────

agent:
	tmux split-window -c "$(CURDIR)" "bash -c 'set -a; . .env 2>/dev/null; set +a; opencode'"
	tmux select-layout main-vertical

ask:
ifndef p
	$(error Usage: make ask p="your prompt here")
endif
	tmux split-window -c "$(CURDIR)" "bash -c 'set -a; . .env 2>/dev/null; set +a; opencode --prompt \"$(p)\"'"
	tmux select-layout main-vertical
