import { readSessions, computeStats, formatStats } from "../telemetry"
import { dbPath, openDb } from "../db"
import { getToolCount } from "../corpus"

export async function cmdStats(opts: { last?: number } = {}): Promise<void> {
  const last = opts.last ? parseInt(String(opts.last), 10) : Infinity
  const sessions = readSessions(last)
  const stats = computeStats(sessions)
  console.log(formatStats(stats))

  try {
    const { db } = openDb()
    const n = getToolCount(db)
    console.log(`\nTool corpus: ${n} tools  (${dbPath()})`)
  } catch {}
}
