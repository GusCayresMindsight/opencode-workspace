#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── Constants ────────────────────────────────────────────────────────────────

const TEMPLATE   = path.join(__dirname, '..', 'lib', 'opencode.json.template');
const HOME       = os.homedir();
const GLOBAL_CFG = path.join(HOME, '.config', 'opencode', 'opencode.json');
const CWD        = process.cwd();

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

function requireTmux() {
  if (!process.env.TMUX) {
    console.error('Not inside a tmux session. Start tmux first.');
    process.exit(1);
  }
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
  console.log('All dependencies installed.');
}

function cmdAgent() {
  requireTmux();
  run(['tmux', 'split-window', '-h', '-c', CWD, "bash -c 'opencode'"]);
}

function cmdAsk(prompt) {
  if (!prompt) {
    console.error('Usage: opencode-workspace ask "your prompt here"');
    process.exit(1);
  }
  requireTmux();
  const safe = prompt.replace(/'/g, "'\\''");
  run(['tmux', 'split-window', '-h', '-c', CWD,
    `bash -c 'opencode --prompt '"'"'${safe}'"'"''`]);
}

function cmdTerm() {
  requireTmux();
  run(['tmux', 'split-window', '-h', '-c', CWD]);
}

function printHelp() {
  console.log(`
@gus/opencode-workspace — spawn OpenCode agent panes from any directory

Usage: opencode-workspace <command> [options]

Commands:
  init [--force]    Write ~/.config/opencode/opencode.json from the bundled template.
                    Does nothing if the file already exists (use --force to overwrite).
  install           Install dependencies: uv, glab, opencode, semgrep.
  agent             Split a pane to the right in the current directory and run opencode.
  ask "<prompt>"    Split a pane to the right and run opencode with a prompt.
  term              Split a pane to the right as a plain terminal.
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
  case 'init':    cmdInit(force); break;
  case 'install': cmdInstall(); break;
  case 'agent':   cmdAgent(); break;
  case 'ask':     cmdAsk(rest.find(a => !a.startsWith('-'))); break;
  case 'term':    cmdTerm(); break;
  default:
    process.stderr.write(`Unknown command: ${command}\n`);
    process.stderr.write(`Run 'opencode-workspace --help' for usage.\n`);
    process.exit(1);
}
