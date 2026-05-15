import { Effect } from "effect"
import { effectCmd, fail } from "../effect-cmd"
import { cmd } from "./cmd"

// ─── index subcommand ─────────────────────────────────────────────────────────

const IndexSubcmd = effectCmd({
  command: "index",
  describe: "Index MCP tools from the active opencode config into the retrieval corpus",
  instance: false,
  builder: (yargs) =>
    yargs.option("force", {
      alias: "f",
      type: "boolean",
      describe: "Re-embed all tools even if unchanged",
      default: false,
    }),
  handler: Effect.fn("Corpus.index")(function* (args) {
    yield* Effect.tryPromise({
      try: async () => {
        const { cmdIndex } = await import("@ow/workspace/cmd/index")
        await cmdIndex({ force: args.force })
      },
      catch: (e: unknown) => new Error(String(e)),
    }).pipe(Effect.mapError((e) => fail(e.message)))
    yield* Effect.void
  }),
})

// ─── retrieve subcommand ──────────────────────────────────────────────────────

const RetrieveSubcmd = effectCmd({
  command: "retrieve <query>",
  describe: "Search the MCP tool corpus with a natural-language query",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("query", {
        type: "string",
        describe: "Natural-language description of the capability you need",
        demandOption: true,
      })
      .option("json", {
        type: "boolean",
        describe: "Output results as JSON array",
        default: false,
      })
      .option("k", {
        type: "number",
        describe: "Number of results to return",
      }),
  handler: Effect.fn("Corpus.retrieve")(function* (args) {
    yield* Effect.tryPromise({
      try: async () => {
        const { cmdRetrieve } = await import("@ow/workspace/cmd/retrieve")
        await cmdRetrieve(args.query as string, { json: args.json, k: args.k })
      },
      catch: (e: unknown) => new Error(String(e)),
    }).pipe(Effect.mapError((e) => fail(e.message)))
    yield* Effect.void
  }),
})

// ─── stats subcommand ─────────────────────────────────────────────────────────

const CorpusStatsSubcmd = effectCmd({
  command: "stats",
  describe: "Show retrieval session statistics",
  instance: false,
  builder: (yargs) =>
    yargs.option("last", {
      type: "number",
      describe: "Show only the most recent N sessions",
    }),
  handler: Effect.fn("Corpus.stats")(function* (args) {
    yield* Effect.tryPromise({
      try: async () => {
        const { cmdStats } = await import("@ow/workspace/cmd/stats")
        await cmdStats({ last: args.last })
      },
      catch: (e: unknown) => new Error(String(e)),
    }).pipe(Effect.mapError((e) => fail(e.message)))
    yield* Effect.void
  }),
})

// ─── mcp-serve subcommand ─────────────────────────────────────────────────────

const McpServeSubcmd = effectCmd({
  command: "mcp-serve",
  describe: "Start the tool-retrieval MCP stdio server",
  instance: false,
  builder: (yargs) => yargs,
  handler: Effect.fn("Corpus.mcpServe")(function* () {
    yield* Effect.tryPromise({
      try: async () => {
        const { startMcpServer } = await import("@ow/workspace/cmd/mcp-serve")
        await startMcpServer()
      },
      catch: (e: unknown) => new Error(String(e)),
    }).pipe(Effect.mapError((e) => fail(e.message)))
    yield* Effect.never
  }),
})

// ─── parent corpus command ────────────────────────────────────────────────────

export const CorpusCommand = cmd({
  command: "corpus",
  describe: "Manage the MCP tool retrieval corpus",
  builder: (yargs) =>
    yargs
      .command(IndexSubcmd as any)
      .command(RetrieveSubcmd as any)
      .command(CorpusStatsSubcmd as any)
      .command(McpServeSubcmd as any)
      .demandCommand(1, "Specify a corpus subcommand: index | retrieve | stats | mcp-serve"),
  handler: () => {},
})
