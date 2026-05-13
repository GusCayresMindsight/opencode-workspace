# Usage:
#   make install   — install the package globally from this local repo
#   make test      — run a quick smoke test of the CLI

.PHONY: install test

install:
	npm install -g .

test:
	@echo "--- help ---"
	opencode-workspace --help
	@echo "--- unknown command exits non-zero ---"
	! opencode-workspace bogus >/dev/null 2>&1
	@echo "All checks passed."
