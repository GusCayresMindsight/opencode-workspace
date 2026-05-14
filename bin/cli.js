#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');

// ─── Constants ────────────────────────────────────────────────────────────────

const TEMPLATE   = path.join(__dirname, '..', 'lib', 'opencode.json.template');
const HOME       = os.homedir();
const MCP_ENV    = path.join(HOME, '.local', 'share', 'opencode', 'mcp.env');
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
  if (result.status !== 0) {
    console.error(`${args[0]} exited with code ${result.status}`);
    process.exit(result.status);
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

function ensureTmux() {
  if (process.env.TMUX) return null;
  const session = 'opencode-workspace';
  spawnSync('tmux', ['kill-session', '-t', session], { stdio: 'pipe' });
  run(['tmux', 'new-session', '-s', session, '-d']);
  return session;
}

function withTmux(cmd) {
  const session = ensureTmux();

  // Inspect current pane layout to decide split direction
  const listArgs = ['tmux', 'list-panes', '-F', '#{pane_id} #{pane_left}'];
  if (session) listArgs.push('-t', session);
  const panesOutput = capture(listArgs);
  const panes = (panesOutput || '').split('\n').filter(Boolean).map(line => {
    const [id, left] = line.trim().split(' ');
    return { id, left: parseInt(left, 10) };
  });

  const hasRightColumn = panes.some(p => p.left > 0);
  const splitArgs = ['tmux', 'split-window', '-c', CWD];

  if (!hasRightColumn) {
    // No right column yet — create one with a horizontal split
    splitArgs.push('-h');
    if (session) splitArgs.push('-t', session);
  } else {
    // Right column exists — stack a new pane below the rightmost one
    const maxLeft = Math.max(...panes.map(p => p.left));
    const rightPane = panes.find(p => p.left === maxLeft);
    splitArgs.push('-v', '-t', rightPane.id);
  }

  if (cmd) splitArgs.push(`bash -c '${cmd}'`);

  run(splitArgs);
  if (session) run(['tmux', 'attach', '-t', session]);
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function loadEnvFile() {
  const env = {};
  if (fs.existsSync(MCP_ENV)) {
    const content = fs.readFileSync(MCP_ENV, 'utf8');
    for (const line of content.split('\n')) {
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        env[line.slice(0, eqIdx)] = line.slice(eqIdx + 1);
      }
    }
  }
  return env;
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

function withMcpEnv(cmd) {
  const env = loadEnvFile();
  const exports = Object.entries(env)
    .map(([k, v]) => `export ${k}='${v.replace(/'/g, "'\\''")}'`)
    .join('; ');
  return exports ? `${exports}; ${cmd}` : cmd;
}

function buildWelcomeScript() {
  const script = [
    '#!/usr/bin/env bash',
    'clear',
    "printf 'Welcome to opencode-workspace\\n'",
    "printf '═══════════════════════════════════════\\n\\n'",
    "printf 'COMMANDS\\n'",
    "printf '  ow               Open a new window (terminal + AI agent)\\n'",
    "printf '  ow term          Open a plain terminal pane in the current window\\n'",
    "printf '  ow install       Install dependencies (uv, glab, opencode, semgrep)\\n'",
    "printf '  ow mcp env VAR   Store a secret for MCP tool credentials\\n\\n'",
    "printf 'OPENCODE BASICS\\n'",
    "printf '  The pane to your right is running OpenCode, an AI coding assistant.\\n'",
    "printf '  Describe tasks in plain English, for example:\\n\\n'",
    "printf '    > Refactor the login function to handle network errors\\n'",
    "printf '    > Write unit tests for the Cart component\\n'",
    "printf '    > Explain what src/utils/format.ts does\\n\\n'",
    "printf '  OpenCode reads and edits your files, runs shell commands, and searches\\n'",
    "printf '  your codebase. It will ask before making irreversible changes.\\n\\n'",
    "printf '  Ctrl+C  cancel current task\\n'",
    "printf '  Ctrl+D  exit OpenCode\\n\\n'",
    'exec bash',
    '',
  ].join('\n');
  const dest = '/tmp/ow-welcome.sh';
  fs.writeFileSync(dest, script, { mode: 0o755 });
  return dest;
}

function cmdAgent() {
  const session = ensureTmux();

  // Get the left pane ID:
  //   - If a new session was just created, use its initial pane.
  //   - If already inside tmux, open a new window (focus switches to it; old window untouched).
  if (!session) {
    run(['tmux', 'new-window', '-c', CWD]);
  }

  // Use list-panes to reliably get the pane ID — querying after creation avoids
  // relying on -P/-F stdout capture from new-window/split-window, which is fragile
  // with piped stdio on some tmux versions.
  const leftPaneTarget = session ? ['-t', session] : [];
  const leftPaneId = capture(['tmux', 'list-panes', ...leftPaneTarget, '-F', '#{pane_id}']);

  if (!leftPaneId) {
    console.error('Failed to get tmux pane ID');
    process.exit(1);
  }

  // Split horizontally: right pane gets 70%, left terminal keeps 30%
  run(['tmux', 'split-window', '-h', '-l', '70%', '-t', leftPaneId, '-c', CWD]);

  // Query pane IDs after the split and find the new right pane
  const panesOutput = capture(['tmux', 'list-panes', ...leftPaneTarget, '-F', '#{pane_id}']);
  const rightPaneId = (panesOutput || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .find(id => id !== leftPaneId);

  if (!rightPaneId) {
    console.error('Failed to split tmux pane');
    process.exit(1);
  }

  // Left pane: welcome message, then interactive shell
  const welcomeScript = buildWelcomeScript();
  run(['tmux', 'send-keys', '-t', leftPaneId, `bash ${welcomeScript}`, 'Enter']);

  // Right pane: OpenCode agent
  const agentCmd = withMcpEnv(`OPENCODE_CONFIG='${TEMPLATE}' opencode`);
  run(['tmux', 'send-keys', '-t', rightPaneId, agentCmd, 'Enter']);

  // Attach if we created the session
  if (session) run(['tmux', 'attach', '-t', session]);
}

function cmdTerm() {
  withTmux("");
}

function promptPassword(query) {
  return new Promise((resolve) => {
    process.stdout.write(query);
    const stdin = process.stdin;

    if (!stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin });
      rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();

    let password = '';
    const handler = (c) => {
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
      for (let i = 0; i < buf.length; i++) {
        const char = buf[i];
        if (char === 0x03) {
          stdin.removeListener('data', handler);
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('^C\n');
          process.exit(1);
        } else if (char === 0x04 || char === 0x0a || char === 0x0d) {
          stdin.removeListener('data', handler);
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          resolve(password);
          return;
        } else if (char === 0x7f || char === 0x08) {
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          password += String.fromCodePoint(char);
          process.stdout.write('*');
        }
      }
    };
    stdin.on('data', handler);
  });
}

function cmdMcp(args) {
  const [subcommand, ...subargs] = args;
  if (subcommand === 'env') {
    const name = subargs[0];
    if (!name) {
      console.error('Usage: opencode-workspace mcp env VAR_NAME');
      process.exit(1);
    }
    cmdMcpEnv(name);
  } else {
    console.error('Usage: opencode-workspace mcp env VAR_NAME');
    process.exit(1);
  }
}

function cmdMcpEnv(name) {
  (async () => {
    const key = name;
    const value = await promptPassword(`Enter value for ${key}: `);

    const dir = path.dirname(MCP_ENV);
    fs.mkdirSync(dir, { recursive: true });

    let entries = {};
    if (fs.existsSync(MCP_ENV)) {
      const content = fs.readFileSync(MCP_ENV, 'utf8');
      for (const line of content.split('\n')) {
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) {
          entries[line.slice(0, eqIdx)] = line.slice(eqIdx + 1);
        }
      }
    }

    entries[key] = value;

    const output = Object.entries(entries)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n';

    fs.writeFileSync(MCP_ENV, output);
    console.log(`Saved ${key} to ${MCP_ENV}`);
  })().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

function printHelp() {
  console.log(`
@gus/opencode-workspace — tmux workspace for OpenCode AI agents

Usage: opencode-workspace [command]

With no arguments, launches the OpenCode agent in a new split pane
(auto-creates a tmux session if needed).

Commands:
  install               Install dependencies: uv, glab, opencode, semgrep.
  agent                 Split a pane to the right in the current directory and run opencode.
  term                  Split a pane to the right as a plain terminal.
  mcp env VAR_NAME      Prompt for a secret and store it in ~/.local/share/opencode/mcp.env.
`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const [, , command, ...rest] = process.argv;

if (command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (!command) {
  cmdAgent();
  return;
}

switch (command) {
  case 'install': cmdInstall(); break;
  case 'agent':   cmdAgent(); break;
  case 'term':    cmdTerm(); break;
  case 'mcp':     cmdMcp(rest.filter(a => !a.startsWith('--'))); break;
  default:
    process.stderr.write(`Unknown command: ${command}\n`);
    process.stderr.write(`Run 'opencode-workspace --help' for usage.\n`);
    process.exit(1);
}
