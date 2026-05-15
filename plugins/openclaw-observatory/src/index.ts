/**
 * OpenClaw plugin entry — registers `openclaw observatory connect`.
 *
 * Manifest lives next to this file (../openclaw.plugin.json).  The runtime
 * loads this module via the `openclaw.extensions` entry in package.json.
 *
 * See: https://docs.openclaw.ai/plugins/building-plugins
 */

// The plugin SDK is provided by the host OpenClaw install at runtime.  The
// import path matches the docs example; types are intentionally loose so the
// plugin compiles without needing the openclaw package locally during dev.
//
// At runtime, openclaw is resolved through OpenClaw's controlled npm root.
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const { definePluginEntry } = require('openclaw/plugin-sdk/plugin-entry') as {
  definePluginEntry: (def: PluginDef) => unknown;
};

import { formatPairOutput, generatePairLink, type PairOptions } from './pair';

/** Minimal shape of the API object passed to register().  Loose to avoid
 *  importing SDK types we don't have locally. */
interface PluginApi {
  registerCli(
    setup: (ctx: { program: CommanderProgram }) => void,
    meta: { descriptors: Array<{ name: string; description: string; hasSubcommands?: boolean }> },
  ): void;
}

interface CommanderProgram {
  command(name: string): CommanderCommand;
}

interface CommanderCommand {
  description(text: string): CommanderCommand;
  command(name: string): CommanderCommand;
  option(flags: string, description: string, defaultValue?: unknown): CommanderCommand;
  action(handler: (...args: unknown[]) => void | Promise<void>): CommanderCommand;
  alias(name: string): CommanderCommand;
}

interface PluginDef {
  id: string;
  name: string;
  description: string;
  register: (api: PluginApi) => void;
}

export default definePluginEntry({
  id: 'observatory',
  name: 'Observatory',
  description: 'Pair this OpenClaw gateway with the Observatory viewer.',

  register(api) {
    api.registerCli(
      ({ program }) => {
        const root = program
          .command('observatory')
          .description('Connect Observatory to this OpenClaw gateway');

        const connect = root
          .command('connect')
          .description('Print a one-time pairing link for Observatory')
          .option('--host <host>', 'Gateway host or LAN IP', '127.0.0.1')
          .option('--port <port>', 'Gateway port', '18789')
          .option('--path <path>', 'WebSocket events path', '/events')
          .option('--tls', 'Generate wss:// scheme (gateway must be behind TLS)', false)
          .option('--label <label>', 'Friendly label shown in Observatory', 'OpenClaw')
          .option('--token <token>', 'Reuse an existing bearer token (else mints one)')
          .option('--no-qr', 'Skip the terminal QR code')
          .action(handleConnect);

        // Aliases for ergonomic muscle memory.
        connect.alias('pair');
        connect.alias('link');
      },
      {
        descriptors: [
          {
            name: 'observatory',
            description: 'Connect Observatory to this OpenClaw gateway',
            hasSubcommands: true,
          },
        ],
      },
    );
  },
});

function handleConnect(...args: unknown[]): void {
  // Commander invokes the action with (options, command).
  const opts = (args[0] as Record<string, unknown> | undefined) ?? {};
  const pairOpts: PairOptions = {
    host: typeof opts.host === 'string' ? opts.host : undefined,
    port: opts.port != null ? Number(opts.port) : undefined,
    path: typeof opts.path === 'string' ? opts.path : undefined,
    tls: opts.tls === true,
    label: typeof opts.label === 'string' ? opts.label : undefined,
    token: typeof opts.token === 'string' ? opts.token : undefined,
    noQr: opts.qr === false,
  };
  const result = generatePairLink(pairOpts);
  process.stdout.write(formatPairOutput(result) + '\n');
}
