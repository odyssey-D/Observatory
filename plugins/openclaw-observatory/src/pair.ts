/**
 * Pair-link generator — pure logic, no CLI concerns.
 *
 * Mirrors bin/openclaw-observatory in TypeScript.  Used by the OpenClaw plugin
 * so `openclaw observatory connect` produces the same output as the standalone
 * shell helper.
 */

import { randomBytes } from 'crypto';
import { execSync, spawnSync } from 'child_process';

export interface PairOptions {
  host?: string;
  port?: number;
  path?: string;
  tls?: boolean;
  label?: string;
  /** If unset, OPENCLAW_TOKEN env var is reused; if THAT'S unset, a new one is minted. */
  token?: string;
  /** Set true to skip QR rendering even when qrencode is installed. */
  noQr?: boolean;
}

export interface PairResult {
  endpoint: string;
  token: string;
  tokenSource: 'env' | 'fresh';
  fingerprint?: string;
  deeplink: string;
  qrAnsi?: string;
}

export function generatePairLink(opts: PairOptions = {}): PairResult {
  const host = opts.host ?? process.env.OPENCLAW_HOST ?? '127.0.0.1';
  const port = opts.port ?? Number(process.env.OPENCLAW_PORT ?? 18789);
  const eventsPath = opts.path ?? process.env.OPENCLAW_EVENTS_PATH ?? '/events';
  const useTls = opts.tls ?? false;
  const label = opts.label ?? process.env.OPENCLAW_LABEL ?? 'OpenClaw';
  const scheme = useTls ? 'wss' : 'ws';

  let token: string;
  let tokenSource: 'env' | 'fresh';
  if (opts.token) {
    token = opts.token;
    tokenSource = 'env';
  } else if (process.env.OPENCLAW_TOKEN) {
    token = process.env.OPENCLAW_TOKEN;
    tokenSource = 'env';
  } else {
    token = randomBytes(24).toString('hex');
    tokenSource = 'fresh';
  }

  const endpoint = `${scheme}://${host}:${port}${eventsPath}`;
  const fingerprint = useTls ? maybeFingerprint(host, port) : undefined;

  const params = new URLSearchParams({
    ws: endpoint,
    token,
    label,
  });
  if (fingerprint) params.set('fingerprint', fingerprint);
  const deeplink = `observatory://connect?${params.toString()}`;

  const qrAnsi = opts.noQr ? undefined : maybeQrCode(deeplink);

  return { endpoint, token, tokenSource, fingerprint, deeplink, qrAnsi };
}

function maybeFingerprint(host: string, port: number): string | undefined {
  // openssl s_client | openssl x509 -fingerprint -sha256 — best-effort, skip on any failure.
  try {
    const cmd = `echo | openssl s_client -connect ${host}:${port} -servername ${host} 2>/dev/null | openssl x509 -noout -fingerprint -sha256 2>/dev/null`;
    const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', timeout: 4_000 });
    const m = out.match(/=([0-9A-F:]+)/i);
    if (m) return m[1].replace(/:/g, '');
  } catch { /* ignore */ }
  return undefined;
}

function maybeQrCode(text: string): string | undefined {
  // Render a terminal-friendly QR if qrencode is installed.
  const check = spawnSync('which', ['qrencode'], { stdio: ['ignore', 'pipe', 'ignore'] });
  if (check.status !== 0) return undefined;
  const out = spawnSync('qrencode', ['-t', 'ANSI', '-m', '1', text], {
    stdio: ['pipe', 'pipe', 'ignore'],
    encoding: 'utf8',
  });
  if (out.status !== 0) return undefined;
  return out.stdout?.toString() ?? undefined;
}

/* ----------------------- pretty printer ----------------------- */

const ANSI = {
  pink: (s: string) => `\x1b[1;35m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[1;36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

export function formatPairOutput(r: PairResult): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${ANSI.pink('Observatory')}  ·  pair link ready`);
  lines.push('');
  lines.push(`  endpoint    ${ANSI.cyan(r.endpoint)}`);
  lines.push(`  token       ${ANSI.cyan(r.token)}    ${ANSI.dim(`(${r.tokenSource === 'env' ? 'reused from OPENCLAW_TOKEN' : 'freshly generated'})`)}`);
  if (r.fingerprint) lines.push(`  fingerprint ${ANSI.cyan(r.fingerprint)}`);
  lines.push('');
  lines.push('  paste this into Observatory →');
  lines.push('');
  lines.push(`  ${ANSI.cyan(r.deeplink)}`);
  lines.push('');
  if (r.qrAnsi) {
    lines.push(r.qrAnsi);
  }
  if (r.tokenSource === 'fresh') {
    lines.push(`  ${ANSI.dim('set this on the OpenClaw side so the stream requires the token:')}`);
    lines.push(`  ${ANSI.dim(`  export OPENCLAW_TOKEN=${r.token}`)}`);
    lines.push('');
  }
  return lines.join('\n');
}
