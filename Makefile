# Usage:
#   make install   — install the package globally from this local repo
#   make test      — run a quick smoke test of the CLI
#   make update    — update pinned dependency versions to their latest releases

.PHONY: install test update

install:
	npm install -g .

test:
	@echo "--- help ---"
	opencode-workspace --help
	@echo "--- unknown command exits non-zero ---"
	! opencode-workspace bogus >/dev/null 2>&1
	@echo "All checks passed."

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
