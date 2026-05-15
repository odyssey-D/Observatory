/**
 * The "magic prompt" — what an App-Store user copies and pastes into OpenClaw.
 *
 * OpenClaw is itself an LLM-driven agent that can execute shell commands.
 * This prompt is a self-contained instruction telling it how to install the
 * Observatory plugin (if missing) and produce the pair URL the user pastes
 * (or taps, on iOS) back into Observatory.
 *
 * Kept short on purpose — it has to render legibly inside Telegram, iMessage,
 * a terminal, or wherever the user talks to their agent.
 */

const RELEASE_TARBALL_URL =
  'https://github.com/odyssey-D/Observatory/releases/latest/download/openclaw-observatory-plugin.tgz';

export const PAIRING_PROMPT = `Hey — set up Observatory pairing for me.

1. If \`openclaw plugins inspect observatory\` errors, install the plugin:
   curl -L -o /tmp/observatory-plugin.tgz ${RELEASE_TARBALL_URL}
   openclaw plugins install /tmp/observatory-plugin.tgz

2. Run: openclaw observatory connect --host <a LAN or Tailscale IP my phone can reach>
   (don't use 127.0.0.1 unless I'm on the same machine as you)

3. Send me the observatory:// link it prints. I'll tap or paste it.`;
