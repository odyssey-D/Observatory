# `@openclaw/observatory-plugin`

Native OpenClaw plugin that registers the `openclaw observatory connect` command.
When run, it prints a one-time `observatory://connect?…` pair URL containing
your gateway's endpoint and a bearer token — paste it into the Observatory app
(web or iOS) and you're streaming.

## Install (local checkout)

```bash
# From the Observatory repo root:
openclaw plugins install plugins/openclaw-observatory
# OpenClaw scans openclaw.plugin.json, links the package, and reloads.
# Restart the gateway so it picks up the new command:
openclaw gateway stop && openclaw gateway run

# Verify it's registered:
openclaw plugins inspect observatory
openclaw observatory --help
```

## Use

```bash
openclaw observatory connect                     # defaults: 127.0.0.1:18789, ws://
openclaw observatory connect --host my.lan --tls # wss:// for LAN with TLS
openclaw observatory pair                        # alias of `connect`
openclaw observatory link                        # alias of `connect`
```

Flags:

| Flag | Default | Meaning |
| ---- | ------- | ------- |
| `--host <host>` | `127.0.0.1` | Gateway host or LAN IP |
| `--port <port>` | `18789` | Gateway port |
| `--path <path>` | `/events` | WS path that emits AgentEvent messages |
| `--tls` | off | Use `wss://` (gateway must be behind TLS) |
| `--label <name>` | `OpenClaw` | Friendly label in Observatory's status pill |
| `--token <token>` | mints fresh | Reuse an existing bearer token |
| `--no-qr` | off | Skip the terminal QR (if `qrencode` is installed) |

Environment overrides (used when flags are omitted): `OPENCLAW_HOST`,
`OPENCLAW_PORT`, `OPENCLAW_EVENTS_PATH`, `OPENCLAW_LABEL`, `OPENCLAW_TOKEN`.

## Trust model

- The bearer token in the URL gates the stream. Set `OPENCLAW_TOKEN=<printed
  token>` on the gateway side so the WS handshake requires it.
- For anything beyond localhost, run with `--tls` and put the gateway behind a
  TLS-terminating proxy (Caddy, Cloudflare Tunnel, Tailscale funnel). The CLI
  embeds the cert's SHA-256 fingerprint in the URL for out-of-band verification.
- Observatory never persists tokens to disk and emits no telemetry.

## Architecture notes

- `openclaw.plugin.json` declares `id: "observatory"` and reserves the
  `observatory` CLI name via `commandAliases`. OpenClaw validates this before
  loading plugin code.
- `src/index.ts` exports a `definePluginEntry({ register })` that calls
  `api.registerCli(({ program }) => …)` to mount the command + subcommands.
- `src/pair.ts` is pure logic — token mint, URL build, optional TLS fingerprint
  via `openssl`, optional QR via `qrencode`. Reusable from anywhere.
- `dist/` is committed so `openclaw plugins install <path>` works without a
  separate build step. To iterate, run `npm run build`.
