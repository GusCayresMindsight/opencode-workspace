import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import os from "os"

const CWD = process.cwd()

// ─── tmux helpers ─────────────────────────────────────────────────────────────

function capture(args: string[]): string {
  const res = spawnSync(args[0]!, args.slice(1), { encoding: "utf8" })
  return (res.stdout ?? "").trim()
}

function run(args: string[]): void {
  const res = spawnSync(args[0]!, args.slice(1), { stdio: "inherit" })
  if (res.status !== 0) {
    process.stderr.write(`Command failed: ${args.join(" ")}\n`)
    process.exit(res.status ?? 1)
  }
}

function isInsideTmux(): boolean {
  return !!process.env.TMUX
}

function isInsideOwSession(): boolean {
  const name = capture(["tmux", "display-message", "-p", "#S"])
  return /^ow-\d+$/.test(name) || name === "ow"
}

function ensureTmuxSession(): string | null {
  // Check if an ow-* session already exists
  const sessions = capture(["tmux", "list-sessions", "-F", "#{session_name}"]) || ""
  const owSessions = sessions
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => /^ow(-\d+)?$/.test(s))
  return owSessions[0] ?? null
}

function getNextOwSessionName(): string {
  const sessions = capture(["tmux", "list-sessions", "-F", "#{session_name}"]) || ""
  const names = new Set(
    sessions
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  )
  if (!names.has("ow")) return "ow"
  let i = 2
  while (names.has(`ow-${i}`)) i++
  return `ow-${i}`
}

function loadMcpEnv(): Record<string, string> {
  const envPath = path.join(os.homedir(), ".local", "share", "opencode", "mcp.env")
  const env: Record<string, string> = {}
  if (!fs.existsSync(envPath)) return env
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const eq = line.indexOf("=")
    if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1)
  }
  return env
}

function withMcpEnv(cmd: string): string {
  const env = loadMcpEnv()
  const exports = Object.entries(env)
    .map(([k, v]) => `export ${k}='${v.replace(/'/g, "'\\''")}'`)
    .join("; ")
  return exports ? `${exports}; ${cmd}` : cmd
}

function buildWelcomeScript(): string {
  const script = [
    "#!/usr/bin/env bash",
    "clear",
    "printf 'Welcome to ow workspace\\n'",
    "printf '═══════════════════════════════════════\\n\\n'",
    "printf 'COMMANDS\\n'",
    "printf '  ow ws             Open a new workspace window (terminal + AI agent)\\n'",
    "printf '  ow ws term        Open a plain terminal pane\\n'",
    "printf '  ow corpus index   Index MCP tool corpus for retrieval\\n'",
    "printf '  ow run \"<prompt>\" One-shot: run with a prompt\\n\\n'",
    "printf 'The pane to your right is running ow, an AI coding assistant.\\n'",
    "printf 'Describe tasks in plain English. Ctrl+C cancel  Ctrl+D exit\\n\\n'",
    "exec bash",
    "",
  ].join("\n")
  const dest = "/tmp/ow-welcome.sh"
  fs.writeFileSync(dest, script, { mode: 0o755 })
  return dest
}

// ─── core workspace logic (also called directly for bare `ow` invocation) ────

export function runWorkspace(sub?: string): void {
  // ─── term subcommand ──────────────────────────────────────────────────────
  if (sub === "term") {
    const session = ensureTmuxSession()
    if (isInsideTmux() && isInsideOwSession()) {
      run(["tmux", "split-window", "-v", "-c", CWD])
      return
    }
    if (!session) {
      const name = getNextOwSessionName()
      run(["tmux", "new-window", "-n", name, "-c", CWD])
    }
    if (session) run(["tmux", "attach", "-t", session])
    return
  }

  // ─── default: open workspace with agent pane ──────────────────────────────
  const session = ensureTmuxSession()

  if (isInsideTmux() && isInsideOwSession()) {
    // Already inside ow-session — stack a new agent pane
    const beforePanes = (capture(["tmux", "list-panes", "-F", "#{pane_id}"]) || "")
      .split("\n")
      .filter(Boolean)
      .map((s) => s.trim())

    run(["tmux", "split-window", "-v", "-c", CWD])

    const afterPanes = (capture(["tmux", "list-panes", "-F", "#{pane_id}"]) || "")
      .split("\n")
      .filter(Boolean)
      .map((s) => s.trim())

    const newPaneId = afterPanes.find((id) => !beforePanes.includes(id))
    if (newPaneId) {
      const agentCmd = withMcpEnv("ow")
      run(["tmux", "send-keys", "-t", newPaneId, agentCmd, "Enter"])
    }
    return
  }

  // Standard two-pane layout
  if (!session) {
    const name = getNextOwSessionName()
    run(["tmux", "new-window", "-n", name, "-c", CWD])
  }

  const leftPaneTarget = session ? ["-t", session] : []
  const leftPaneId = capture(["tmux", "list-panes", ...leftPaneTarget, "-F", "#{pane_id}"])

  if (!leftPaneId) {
    process.stderr.write("Failed to get tmux pane ID\n")
    process.exit(1)
  }

  run(["tmux", "split-window", "-h", "-l", "70%", "-t", leftPaneId, "-c", CWD])

  const panesOutput = capture(["tmux", "list-panes", ...leftPaneTarget, "-F", "#{pane_id}"])
  const rightPaneId = (panesOutput || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .find((id) => id !== leftPaneId)

  if (!rightPaneId) {
    process.stderr.write("Failed to split tmux pane\n")
    process.exit(1)
  }

  const welcomeScript = buildWelcomeScript()
  run(["tmux", "send-keys", "-t", leftPaneId, `bash ${welcomeScript}`, "Enter"])

  const agentCmd = withMcpEnv("ow")
  run(["tmux", "send-keys", "-t", rightPaneId, agentCmd, "Enter"])

  if (session) run(["tmux", "attach", "-t", session])
}

// ─── ws command ───────────────────────────────────────────────────────────────

export const WsCommand = effectCmd({
  command: "ws [subcommand]",
  describe: "Open or manage a tmux workspace with ow",
  instance: false,
  builder: (yargs) =>
    yargs.positional("subcommand", {
      type: "string",
      describe: 'Optional subcommand: "term" to open a plain terminal pane',
    }),
  handler: Effect.fn("Ws.open")(function* (args) {
    yield* Effect.sync(() => runWorkspace((args as any).subcommand))
  }),
})
