'use strict';

const { Before, After } = require('@cucumber/cucumber');
const sinon  = require('sinon');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const SRC = path.resolve(__dirname, '../../src');

Before(async function () {
  // ── 1. Isolated HOME ────────────────────────────────────────────────────────
  this.tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-unit-'));
  process.env.HOME = this.tmpHome;

  // ── 1b. Clear env vars that the parent opencode session may have set ────────
  delete process.env.OPENCODE_CONFIG;

  // ── 2. Flush src/ from require cache so modules re-evaluate with new HOME ──
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(SRC)) delete require.cache[key];
  }

  // ── 3. Intercept process.exit ───────────────────────────────────────────────
  const self = this;
  sinon.stub(process, 'exit').callsFake((code) => {
    self.exitCode = code ?? 0;
    throw new global.ExitError(code);
  });

  // ── 4. Capture console output ───────────────────────────────────────────────
  sinon.stub(console, 'warn').callsFake((...args) => {
    self.warnings.push(args.map(String).join(' '));
  });
  sinon.stub(console, 'log').callsFake((...args) => {
    self.logs.push(args.map(String).join(' '));
  });

  // ── 5. Capture stderr (retrieval prints here) ────────────────────────────────
  sinon.stub(process.stderr, 'write').callsFake((chunk) => {
    self.stderrLines.push(String(chunk));
    return true;
  });
});

After(async function () {
  // Clean up temp config files created by composeTempConfig in tests
  for (const f of this.tempConfigPaths || []) {
    try { fs.unlinkSync(f); } catch { /* already gone */ }
  }

  // Restore all sinon stubs
  sinon.restore();

  // Restore environment
  delete process.env.HOME;
  delete process.env.OPENCODE_WORKSPACE_RETRIEVAL;
  delete process.env.OPENAI_API_KEY;

  // Remove the temp HOME directory
  if (this.tmpHome) {
    fs.rmSync(this.tmpHome, { recursive: true, force: true });
    this.tmpHome = null;
  }
});
