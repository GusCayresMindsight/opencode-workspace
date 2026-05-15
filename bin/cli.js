#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');

// ─── Constants ────────────────────────────────────────────────────────────────

const TEMPLATE        = path.join(__dirname, '..', 'lib', 'opencode.json.template');
const HOME            = os.homedir();
const MCP_ENV         = path.join(HOME, '.local', 'share', 'opencode', 'mcp.env');
const CWD             = process.cwd();
const pkg             = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const OPENCODE_VERSION = pkg.opencode && pkg.opencode.version;

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
  run(['tmux', 'rename-window', '-t', session, 'ow-session']);
  return session;
}

function getWindowName() {
  return capture(['tmux', 'display-message', '-p', '#{window_name}']);
}

function isInsideOwSession() {
  const name = getWindowName();
  return name && /^ow-session(-\d+)?$/.test(name);
}

function getNextOwSessionName() {
  const args = ['tmux', 'list-windows', '-F', '#{window_name}'];
  if (!process.env.TMUX) args.push('-t', 'opencode-workspace');
  const output = capture(args);
  if (!output) return 'ow-session';

  const existing = output.split('\n').filter(Boolean);
  let maxIdx = 0;
  for (const name of existing) {
    const m = name.match(/^ow-session(?:-(\d+))?$/);
    if (m) {
      const idx = m[1] ? parseInt(m[1], 10) : 0;
      if (idx >= maxIdx) maxIdx = idx;
    }
  }
  return maxIdx === 0 ? 'ow-session-2' : `ow-session-${maxIdx + 1}`;
}

function rightColumnPanes() {
  const args = ['tmux', 'list-panes', '-F', '#{pane_id} #{pane_left}'];
  if (!process.env.TMUX) args.push('-t', 'opencode-workspace');
  const output = capture(args);
  if (!output) return [];
  return output.split('\n').filter(Boolean).map(line => {
    const [id, left] = line.trim().split(' ');
    return { id, left: parseInt(left, 10) };
  }).filter(p => p.left > 0);
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

function installOpencode() {
  const versionFlag = OPENCODE_VERSION ? `--version ${OPENCODE_VERSION}` : '';
  const cmd = `curl -fsSL https://opencode.ai/install | bash -s -- --no-modify-path${versionFlag ? ' ' + versionFlag : ''}`;
  runOrThrow(['bash', '-c', cmd]);
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
    console.log(`Installing opencode${OPENCODE_VERSION ? ' ' + OPENCODE_VERSION : ''}...`);
    tryStep('opencode', () => installOpencode());
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
    "printf '  ow index         Index MCP tool corpus for retrieval\\n'",
    "printf '  ow \"<prompt>\"    One-shot: retrieve tools + run opencode\\n\\n'",
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
  if (!cmdExists('opencode')) {
    console.log(`opencode not found, installing${OPENCODE_VERSION ? ' ' + OPENCODE_VERSION : ''}...`);
    tryStep('opencode', () => installOpencode());
  }

  const session = ensureTmux();

  if (process.env.TMUX && isInsideOwSession()) {
    // Inside an ow-session: stack a new agent below the right column
    const beforePanes = capture(['tmux', 'list-panes', '-F', '#{pane_id}']) || '';
    const beforeIds = beforePanes.split('\n').filter(Boolean).map(s => s.trim());

    const rightPanes = rightColumnPanes();
    const target = rightPanes.length > 0
      ? rightPanes[rightPanes.length - 1].id
      : null;

    const splitArgs = ['tmux', 'split-window', '-v', '-c', CWD];
    if (target) splitArgs.push('-t', target);
    run(splitArgs);

    const afterPanes = capture(['tmux', 'list-panes', '-F', '#{pane_id}']) || '';
    const afterIds = afterPanes.split('\n').filter(Boolean).map(s => s.trim());
    const newPaneId = afterIds.find(id => !beforeIds.includes(id));

    const agentCmd = withMcpEnv(`OPENCODE_CONFIG='${TEMPLATE}' opencode`);
    if (newPaneId) {
      run(['tmux', 'send-keys', '-t', newPaneId, agentCmd, 'Enter']);
    }
    return;
  }

  // Not in ow-session: set up the standard two-pane layout
  if (!session) {
    const name = getNextOwSessionName();
    run(['tmux', 'new-window', '-n', name, '-c', CWD]);
  }

  const leftPaneTarget = session ? ['-t', session] : [];
  const leftPaneId = capture(['tmux', 'list-panes', ...leftPaneTarget, '-F', '#{pane_id}']);

  if (!leftPaneId) {
    console.error('Failed to get tmux pane ID');
    process.exit(1);
  }

  run(['tmux', 'split-window', '-h', '-l', '70%', '-t', leftPaneId, '-c', CWD]);

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

  const welcomeScript = buildWelcomeScript();
  run(['tmux', 'send-keys', '-t', leftPaneId, `bash ${welcomeScript}`, 'Enter']);

  const agentCmd = withMcpEnv(`OPENCODE_CONFIG='${TEMPLATE}' opencode`);
  run(['tmux', 'send-keys', '-t', rightPaneId, agentCmd, 'Enter']);

  if (session) run(['tmux', 'attach', '-t', session]);
}

function cmdTerm() {
  const session = ensureTmux();

  if (process.env.TMUX && isInsideOwSession()) {
    withTmux("");
    return;
  }

  if (!session) {
    const name = getNextOwSessionName();
    run(['tmux', 'new-window', '-n', name, '-c', CWD]);
  }

  if (session) run(['tmux', 'attach', '-t', session]);
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
@gus/opencode-workspace — tmux workspace + tool-retrieval layer for OpenCode

Usage:
  opencode-workspace                    Launch interactive TUI agent (tmux split)
  opencode-workspace "<prompt>"         One-shot: retrieve tools, then run opencode
  opencode-workspace <command> [args]

Commands:
  index                 Index all MCP server tools into the local corpus.
                        Run this once after install, then again when servers change.
                          --force   Re-embed all tools regardless of cache
  stats                 Summarise recent sessions from sessions.jsonl.
                          --last N  Show only the last N sessions
  install               Install dependencies: uv, glab, opencode, semgrep.
  agent                 Split a pane to the right and run opencode (TUI, no retrieval).
  term                  Split a pane to the right as a plain terminal.
  mcp env VAR_NAME      Prompt for a secret and store it in ~/.local/share/opencode/mcp.env.

Environment:
  OPENCODE_WORKSPACE_RETRIEVAL=off   Disable tool retrieval entirely (pass-through to opencode).

Config: ~/.config/opencode-workspace/config.json
  {
    "embedding": { "provider": "local", "model": "Xenova/all-MiniLM-L6-v2" },
    "retrieval":  { "k": 10, "strategy": "topk" }
  }
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
  // eslint-disable-next-line no-useless-return
  return;
}

switch (command) {
  case 'install': cmdInstall(); break;
  case 'agent':   cmdAgent();   break;
  case 'term':    cmdTerm();    break;
  case 'mcp':     cmdMcp(rest.filter(a => !a.startsWith('--'))); break;

  case 'index': {
    const force = rest.includes('--force');
    const { cmdIndex } = require('../src/cmd/index.js');
    cmdIndex({ force }).catch(e => { console.error(e.message); process.exit(1); });
    break;
  }

  case 'stats': {
    const lastFlag = rest.find(a => a.startsWith('--last'));
    const last = lastFlag
      ? (lastFlag.includes('=') ? lastFlag.split('=')[1] : rest[rest.indexOf(lastFlag) + 1])
      : undefined;
    const { cmdStats } = require('../src/cmd/stats.js');
    cmdStats({ last }).catch(e => { console.error(e.message); process.exit(1); });
    break;
  }

  default: {
    // Treat the first unrecognised token + remaining args as a one-shot prompt.
    const prompt = [command, ...rest].join(' ');
    const { cmdOneShot } = require('../src/cmd/oneshot.js');
    cmdOneShot(prompt).catch(e => { console.error(e.message); process.exit(1); });
    break;
  }
}
