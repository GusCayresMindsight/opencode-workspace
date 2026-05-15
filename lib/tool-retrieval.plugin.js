/**
 * opencode-workspace — TUI first-message retrieval hook
 *
 * This OpenCode plugin fires when the user sends their FIRST message in a new
 * TUI session.  It embeds that message, searches the local MCP tool corpus for
 * the most relevant tools, and injects the results as a system-level context
 * block into the conversation (without triggering another AI reply).
 *
 * The agent then has tool recommendations in its context before it starts
 * responding — similar to what the one-shot path does via a temp config, but
 * adapted for interactive TUI sessions where the prompt is only known after
 * the user has typed it.
 *
 * Installation (done automatically by `opencode-workspace install`):
 *   ~/.config/opencode/plugins/ow-tool-retrieval.js
 *
 * The plugin soft-fails silently if:
 *   - The tool corpus doesn't exist (opencode-workspace index has not been run)
 *   - opencode-workspace is not in PATH
 *   - Any subprocess or SDK call throws
 */

/** @type {import("@opencode-ai/plugin").Plugin} */
export const ToolRetrievalHook = async ({ client, $ }) => {
  // Track which sessions have already had retrieval run so we only fire once.
  const seenSessions = new Set();

  return {
    /**
     * message.updated fires whenever a message in the active session changes.
     * We look for the very first user message in each session.
     *
     * Event shape (from the OpenCode SDK types):
     *   { message: { id, sessionID, role, parts: [...] }, ... }
     */
    'message.updated': async (event) => {
      try {
        const message = event?.message ?? event;
        if (!message) return;

        // Only act on user messages
        if (message.role !== 'user') return;

        const sessionId = message.sessionID ?? message.session_id;
        if (!sessionId) return;

        // Fire once per session
        if (seenSessions.has(sessionId)) return;
        seenSessions.add(sessionId);

        // Extract plain text from message parts
        const parts = Array.isArray(message.parts) ? message.parts : [];
        const text = parts
          .filter(p => p.type === 'text')
          .map(p => p.text ?? '')
          .join(' ')
          .trim();

        if (!text) return;

        // Run retrieval as a subprocess.
        // stdout → JSON array of hits; stderr → progress/warnings (discarded here)
        let raw;
        try {
          raw = await $`opencode-workspace retrieve --json ${text}`.text();
        } catch {
          // opencode-workspace not in PATH or corpus empty — skip silently
          return;
        }

        let hits;
        try {
          hits = JSON.parse(raw.trim());
        } catch {
          return; // malformed output — skip
        }

        if (!Array.isArray(hits) || hits.length === 0) return;

        // Format tool recommendations as a compact context block
        const lines = [
          '[Tool Retrieval] Most relevant MCP tools for your request:',
          '',
          ...hits.map(h =>
            `  • ${h.server_name}/${h.tool_name}  (score: ${Number(h.score).toFixed(3)})\n    ${h.description}`,
          ),
          '',
          'These tools are available. Use them if they help with the task.',
        ];

        // Inject as system context — noReply: true means no AI response is triggered
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            noReply: true,
            parts: [{ type: 'text', text: lines.join('\n') }],
          },
        });
      } catch {
        // Any failure must not surface to the user or interrupt the session
      }
    },
  };
};
