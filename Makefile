# Usage:
#   make setup           — install tmux plugins (run once)
#   make start           — start or attach; restores last saved state
#   make start-clean     — start a fresh session (no restore)
#   make save            — save current session state now
#   make agent           — spawn an interactive opencode agent in a new pane
#   make ask p="prompt"  — spawn an opencode agent with a prompt in a new pane
#   make stop            — save state and kill the session

ifneq (,$(wildcard .env))
  include .env
  export
endif

.PHONY: setup start start-clean save agent ask stop

PLUGINS_DIR    := $(HOME)/.tmux/plugins
RESURRECT_DIR  := $(PLUGINS_DIR)/tmux-resurrect
CONTINUUM_DIR  := $(PLUGINS_DIR)/tmux-continuum
RESURRECT_SAVE := $(RESURRECT_DIR)/scripts/save.sh
RESURRECT_RESTORE := $(RESURRECT_DIR)/scripts/restore.sh
TMUX_CONF      := $(CURDIR)/.tmux.conf

# ─── Plugin installation ──────────────────────────────────────────────────────

setup:
	@mkdir -p $(PLUGINS_DIR)
	@[ -d $(RESURRECT_DIR) ] \
		&& echo "tmux-resurrect already installed" \
		|| git clone --depth 1 https://github.com/tmux-plugins/tmux-resurrect $(RESURRECT_DIR)
	@[ -d $(CONTINUUM_DIR) ] \
		&& echo "tmux-continuum already installed" \
		|| git clone --depth 1 https://github.com/tmux-plugins/tmux-continuum $(CONTINUUM_DIR)
	@echo "Done. Run 'make start' to begin."

# ─── Session lifecycle ────────────────────────────────────────────────────────

start:
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

start-clean:
	@tmux kill-session -t opencode 2>/dev/null || true
	tmux -f "$(TMUX_CONF)" new-session -s opencode

save:
	@if [ -f "$(RESURRECT_SAVE)" ]; then \
		bash "$(RESURRECT_SAVE)" && echo "State saved."; \
	else \
		echo "tmux-resurrect not installed. Run: make setup"; \
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
