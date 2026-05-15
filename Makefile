# Usage:
#   make install   — bun install (resolve all workspace dependencies)
#   make build     — build the ow binary for the current platform
#   make dev       — run ow in dev/interpreted mode (no compilation)
#   make test      — run unit tests
#   make smoke     — build binary + run corpus retrieval smoke test
#   make update    — bump @ow/workspace and ow versions

.PHONY: install build dev test smoke update

BUN := $(HOME)/.bun/bin/bun
BINARY := packages/opencode/dist/ow-linux-x64/bin/ow

install:
	$(BUN) install

build:
	$(BUN) run --cwd packages/opencode build -- --single --skip-embed-web-ui

dev:
	$(BUN) run --cwd packages/opencode --conditions=browser src/index.ts

test:
	$(BUN) test

smoke: build
	@echo "=== Step 1: index MCP tool corpus ==="
	$(BINARY) corpus index
	@echo ""
	@echo "=== Step 2: retrieval assertion ==="
	$(BINARY) corpus retrieve "list GitHub pull requests" | grep -i github
	@echo "Smoke test passed."
