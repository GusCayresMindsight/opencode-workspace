/**
 * opencode-workspace — TUI first-message retrieval hook
 *
 * This OpenCode plugin fires when the user sends their FIRST message in a new
 * TUI session.  It searches the local MCP tool corpus for the most relevant
 * tools and injects the results as a system-level context block into the
 * conversation (without triggering another AI reply).
 *
 * The agent then has tool recommendations in its context before it starts
 * responding — similar to what the one-shot path does via a temp config, but
 * adapted for interactive TUI sessions where the prompt is only known after
 * the user has typed it.
 *
 * Installation (done automatically by `opencode-workspace install`):
 *   ~/.config/opencode/plugins/ow-tool-retrieval.js
 *
 * The core logic lives in src/cmd/tui-hook.js (CommonJS) and is imported here
 * via createRequire so it can be unit-tested independently of the plugin
 * lifecycle.
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createFirstMessageHandler } = require('../src/cmd/tui-hook.js');

/** @type {import("@opencode-ai/plugin").Plugin} */
export const ToolRetrievalHook = async ({ client }) => {
  // createFirstMessageHandler returns a stateful event handler that fires
  // retrieval exactly once per session (tracked via an internal seenSessions Set).
  const onMessageUpdated = createFirstMessageHandler({ client });

  return {
    'message.updated': onMessageUpdated,
  };
};
