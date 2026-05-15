"use strict";
/**
 * OpenClaw plugin entry — registers `openclaw observatory connect`.
 *
 * Manifest lives next to this file (../openclaw.plugin.json).  The runtime
 * loads this module via the `openclaw.extensions` entry in package.json.
 *
 * See: https://docs.openclaw.ai/plugins/building-plugins
 */
Object.defineProperty(exports, "__esModule", { value: true });
// The plugin SDK is provided by the host OpenClaw install at runtime.  The
// import path matches the docs example; types are intentionally loose so the
// plugin compiles without needing the openclaw package locally during dev.
//
// At runtime, openclaw is resolved through OpenClaw's controlled npm root.
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const { definePluginEntry } = require('openclaw/plugin-sdk/plugin-entry');
const pair_1 = require("./pair");
exports.default = definePluginEntry({
    id: 'observatory',
    name: 'Observatory',
    description: 'Pair this OpenClaw gateway with the Observatory viewer.',
    register(api) {
        api.registerCli(({ program }) => {
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
        }, {
            descriptors: [
                {
                    name: 'observatory',
                    description: 'Connect Observatory to this OpenClaw gateway',
                    hasSubcommands: true,
                },
            ],
        });
    },
});
function handleConnect(...args) {
    // Commander invokes the action with (options, command).
    const opts = args[0] ?? {};
    const pairOpts = {
        host: typeof opts.host === 'string' ? opts.host : undefined,
        port: opts.port != null ? Number(opts.port) : undefined,
        path: typeof opts.path === 'string' ? opts.path : undefined,
        tls: opts.tls === true,
        label: typeof opts.label === 'string' ? opts.label : undefined,
        token: typeof opts.token === 'string' ? opts.token : undefined,
        noQr: opts.qr === false,
    };
    const result = (0, pair_1.generatePairLink)(pairOpts);
    process.stdout.write((0, pair_1.formatPairOutput)(result) + '\n');
}
