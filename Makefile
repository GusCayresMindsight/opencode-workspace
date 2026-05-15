# Usage:
#   make install   — install the package globally from this local repo
#   make test      — quick CLI sanity checks
#   make smoke     — end-to-end: index all MCP servers, assert top retrieval result
#   make update    — update pinned dependency versions to their latest releases

.PHONY: install test smoke update


install:
	npm install -g .

test:
	npx cucumber-js

smoke:
	@echo "=== Step 1: index MCP tool corpus ==="
	node bin/cli.js index
	@echo ""
	@echo "=== Step 2: retrieval assertion ==="
	node bin/smoke.js

update:
	@node -e " \
	  const https = require('https'); \
	  const fs    = require('fs'); \
	  function fetchLatest(repo, cb) { \
	    https.get( \
	      'https://api.github.com/repos/' + repo + '/releases/latest', \
	      { headers: { 'User-Agent': 'opencode-workspace' } }, \
	      (res) => { let raw = ''; res.on('data', c => raw += c); res.on('end', () => cb(JSON.parse(raw).tag_name.replace(/^v/, ''))); } \
	    ); \
	  } \
	  fetchLatest('anomalyco/opencode', (v) => { \
	    const pkg  = JSON.parse(fs.readFileSync('package.json', 'utf8')); \
	    const prev = pkg.opencode ? pkg.opencode.version : 'none'; \
	    if (prev === v) { console.log('opencode already up to date: ' + v); return; } \
	    pkg.opencode = { version: v }; \
	    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n'); \
	    console.log('opencode: ' + prev + ' → ' + v); \
	  }); \
	"
