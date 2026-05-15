/**
 * Pairing URL parser.
 *
 * Observatory accepts two URL forms in onboarding:
 *
 *   1.  Plain stream URLs   (wss://… , https://… , http://… , ws://… , sse://…)
 *   2.  Observatory deeplinks of the form
 *
 *         observatory://connect?ws=<urlEncoded>&token=<short>&fingerprint=<hex>&label=<name>
 *
 *   The deeplink is what `openclaw observatory connect` prints — it carries
 *   the agent's event endpoint, a short-lived bearer token, and an optional
 *   certificate fingerprint for the user to verify out-of-band.
 *
 *   Parsed payload is what gets handed to the adapter `connect({ endpoint, token })`.
 */

export interface PairingPayload {
  endpoint: string;
  token?: string;
  /** SHA-256 fingerprint of the server cert, shown to the user for verification. */
  fingerprint?: string;
  /** Optional friendly label for the source. */
  label?: string;
}

const HEX_FP_RE = /^[a-fA-F0-9:]{47,95}$/; // SHA-256 in hex with optional colons

export function parsePairingInput(raw: string): PairingPayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Deeplink form
  if (trimmed.toLowerCase().startsWith('observatory://')) {
    try {
      // Replace the scheme so URL() parses query string for us
      const u = new URL('https://x/' + trimmed.slice('observatory://'.length));
      const ws = u.searchParams.get('ws') ?? u.searchParams.get('endpoint');
      if (!ws) return null;
      return {
        endpoint: decodeURIComponent(ws),
        token: u.searchParams.get('token') ?? undefined,
        fingerprint: u.searchParams.get('fingerprint') ?? undefined,
        label: u.searchParams.get('label') ?? undefined,
      };
    } catch { return null; }
  }

  // Plain URL — best-effort validation
  try {
    const u = new URL(trimmed);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol)) return null;
    return { endpoint: trimmed };
  } catch { return null; }
}

/** Validate an out-of-band fingerprint match (used by the Pair screen). */
export function fingerprintLooksValid(fp: string | undefined): boolean {
  if (!fp) return true; // optional
  return HEX_FP_RE.test(fp);
}
