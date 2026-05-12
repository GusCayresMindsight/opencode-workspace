#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION    = 'opencode';
const TMUX_CONF  = path.join(__dirname, '..', 'lib', 'tmux.conf');
const TEMPLATE   = path.join(__dirname, '..', 'lib', 'opencode.json.template');
const HOME       = os.homedir();
const GLOBAL_CFG = path.join(HOME, '.config', 'opencode', 'opencode.json');
const CWD        = process.cwd();

const PLUGINS_DIR      = path.join(HOME, '.tmux', 'plugins');
const RESURRECT_DIR    = path.join(PLUGINS_DIR, 'tmux-resurrect');
const CONTINUUM_DIR    = path.join(PLUGINS_DIR, 'tmux-continuum');
const RESURRECT_SAVE   = path.join(RESURRECT_DIR, 'scripts', 'save.sh');
const RESURRECT_RESTORE= path.join(RESURRECT_DIR, 'scripts', 'restore.sh');

// Augment PATH so installed tools are always found
process.env.PATH = [
  path.join(HOME, '.local', 'bin'),
  path.join(HOME, '.opencode', 'bin'),
  process.env.PATH,
].join(':');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function run(args, opts = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    stdio: 'inherit',
    env: process.env,
    ...opts,
  });
  if (result.error) {
    console.error(`Failed to run ${args[0]}: ${result.error.message}`);
    process.exit(1);
  }
  return result;
}

// Like run(), but throws instead of exiting — used inside tryStep
function runOrThrow(args, opts = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    stdio: 'inherit',
    env: process.env,
    ...opts,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${args[0]} exited with code ${result.status}`);
  return result;
}

// Wraps an install step so a failure warns and continues rather than aborting
function tryStep(label, fn) {
  try {
    fn();
  } catch (e) {
    console.warn(`  WARNING: ${label} failed — ${e.message}`);
    console.warn('  Re-run: opencode-workspace install');
  }
}

function capture(args) {
  const result = spawnSync(args[0], args.slice(1), {
    stdio: 'pipe',
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function cmdExists(name) {
  return capture(['which', name]) !== null;
}

function sessionExists() {
  const r = spawnSync('tmux', ['has-session', '-t', SESSION], { stdio: 'pipe' });
  return r.status === 0;
}

function sleep500() {
  spawnSync('sleep', ['0.5']);
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdInit(force) {
  const cfgDir = path.dirname(GLOBAL_CFG);

  if (fs.existsSync(GLOBAL_CFG) && !force) {
    console.log(`Already exists: ${GLOBAL_CFG}`);
    console.log('Use --force to overwrite.');
    return;
  }

  fs.mkdirSync(cfgDir, { recursive: true });
  fs.copyFileSync(TEMPLATE, GLOBAL_CFG);
  console.log(`Written: ${GLOBAL_CFG}`);
  console.log('');
  console.log('Set these environment variables (e.g. in ~/.bashrc or ~/.zshrc):');
  console.log('  export ANTHROPIC_API_KEY=...');
  console.log('  export NOTION_TOKEN=...');
}

function cmdInstall() {
  // tmux-resurrect
  if (!fs.existsSync(RESURRECT_DIR)) {
    console.log('Installing tmux-resurrect...');
    tryStep('tmux-resurrect', () => runOrThrow(['git', 'clone', '--depth', '1',
      'https://github.com/tmux-plugins/tmux-resurrect', RESURRECT_DIR]));
  } else {
    console.log('tmux-resurrect already installed');
  }

  // tmux-continuum
  if (!fs.existsSync(CONTINUUM_DIR)) {
    console.log('Installing tmux-continuum...');
    tryStep('tmux-continuum', () => runOrThrow(['git', 'clone', '--depth', '1',
      'https://github.com/tmux-plugins/tmux-continuum', CONTINUUM_DIR]));
  } else {
    console.log('tmux-continuum already installed');
  }

  // uv
  if (!cmdExists('uv')) {
    console.log('Installing uv...');
    tryStep('uv', () => runOrThrow(['bash', '-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh']));
  } else {
    console.log(`uv already installed: ${capture(['uv', '--version'])}`);
  }

  // glab
  if (!cmdExists('glab')) {
    console.log('Installing glab...');
    tryStep('glab', () => runOrThrow(['bash', '-c', [
      'GLAB_VER=$(curl -s https://api.github.com/repos/gitlab-org/cli/releases/latest',
      '  | grep -oP \'"tag_name": "\\K[^"]+\')',
      'curl -sL "https://gitlab.com/gitlab-org/cli/-/releases/${GLAB_VER}/downloads/glab_linux_amd64.tar.gz"',
      '  | tar -xz -C /tmp',
      'mkdir -p ~/.local/bin',
      'cp /tmp/bin/glab ~/.local/bin/glab',
    ].join(' && ')]));
  } else {
    console.log(`glab already installed: ${capture(['bash', '-c', 'glab --version 2>&1 | head -1'])}`);
  }

  // opencode
  if (!cmdExists('opencode')) {
    console.log('Installing opencode...');
    tryStep('opencode', () => runOrThrow(['bash', '-c', 'curl -fsSL https://opencode.ai/install | bash']));
  } else {
    console.log(`opencode already installed: ${capture(['bash', '-c', 'opencode --version 2>&1 | head -1'])}`);
  }

  // semgrep
  if (!cmdExists('semgrep')) {
    console.log('Installing semgrep...');
    tryStep('semgrep', () => runOrThrow(['uv', 'tool', 'install', 'semgrep']));
  } else {
    console.log(`semgrep already installed: ${capture(['semgrep', '--version'])}`);
  }

  console.log('');
  console.log('All dependencies installed. Run: opencode-workspace start');
}

function checkDeps() {
  const missing = [];
  for (const dep of ['tmux', 'node', 'npx', 'uv', 'uvx', 'glab', 'semgrep', 'opencode']) {
    if (!cmdExists(dep)) missing.push(dep);
  }
  if (!fs.existsSync(RESURRECT_DIR)) missing.push('tmux-resurrect');
  if (!fs.existsSync(CONTINUUM_DIR)) missing.push('tmux-continuum');

  if (missing.length > 0) {
    console.error(`ERROR: missing dependencies: ${missing.join(' ')}`);
    console.error("Run 'opencode-workspace install' to install them.");
    process.exit(1);
  }
}

function cmdStart(clean) {
  checkDeps();

  if (clean) {
    spawnSync('tmux', ['kill-session', '-t', SESSION], { stdio: 'pipe' });
    run(['tmux', '-f', TMUX_CONF, 'new-session', '-s', SESSION]);
    return;
  }

  if (sessionExists()) {
    run(['tmux', 'attach-session', '-t', SESSION]);
  } else {
    run(['tmux', '-f', TMUX_CONF, 'new-session', '-d', '-s', SESSION]);
    if (fs.existsSync(RESURRECT_RESTORE)) {
      run(['tmux', 'run-shell', RESURRECT_RESTORE]);
      sleep500();
    }
    run(['tmux', 'attach-session', '-t', SESSION]);
  }
}

function cmdSave() {
  if (!fs.existsSync(RESURRECT_SAVE)) {
    console.error('tmux-resurrect not installed. Run: opencode-workspace install');
    process.exit(1);
  }
  run(['bash', RESURRECT_SAVE]);
  console.log('State saved.');
}

function cmdStop() {
  if (fs.existsSync(RESURRECT_SAVE)) {
    console.log('Saving state...');
    run(['bash', RESURRECT_SAVE]);
    sleep500();
  }
  run(['tmux', 'kill-session', '-t', SESSION]);
}

function cmdAgent() {
  run(['tmux', 'split-window', '-d', '-c', CWD,
    `bash -c 'opencode'`]);
  run(['tmux', 'select-layout', 'main-vertical']);
}

function cmdAsk(prompt) {
  if (!prompt) {
    console.error('Usage: opencode-workspace ask "your prompt here"');
    process.exit(1);
  }
  // Escape single quotes in the prompt for safe embedding in a single-quoted bash string
  const safe = prompt.replace(/'/g, "'\\''");
  run(['tmux', 'split-window', '-d', '-c', CWD,
    `bash -c 'opencode --prompt '"'"'${safe}'"'"''`]);
  run(['tmux', 'select-layout', 'main-vertical']);
}

function cmdTerm() {
  run(['tmux', 'split-window', '-c', CWD]);
  run(['tmux', 'select-layout', 'main-vertical']);
}

function printHelp() {
  console.log(`
@gus/opencode-workspace — tmux workspace for OpenCode agents

Usage: opencode-workspace <command> [options]

Commands:
  init [--force]    Write ~/.config/opencode/opencode.json from the bundled template.
                    Does nothing if the file already exists (use --force to overwrite).
  install           Install all dependencies: tmux plugins, uv, glab, opencode, semgrep.
  start             Check deps, then attach to or create the opencode tmux session.
  start-clean       Kill any existing session and start a fresh one.
  save              Save current session state (tmux-resurrect).
  stop              Save state and kill the session.
  agent             Split a new pane in the current directory and run opencode.
  ask "<prompt>"    Split a new pane in the current directory and run opencode with a prompt.
  term              Split a new plain terminal pane in the current directory.
`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const [, , command, ...rest] = process.argv;

if (!command || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

const force = rest.includes('--force');

switch (command) {
  case 'init':        cmdInit(force); break;
  case 'install':     cmdInstall(); break;
  case 'start':       cmdStart(false); break;
  case 'start-clean': cmdStart(true); break;
  case 'save':        cmdSave(); break;
  case 'stop':        cmdStop(); break;
  case 'agent':       cmdAgent(); break;
  case 'ask':         cmdAsk(rest.find(a => !a.startsWith('-'))); break;
  case 'term':        cmdTerm(); break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}
