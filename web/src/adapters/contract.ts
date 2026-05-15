/**
 * Adapter contract — TypeScript form.
 *
 * Any AgentAdapter implementing this can drive the Observatory.
 * Adapters translate their native protocol into canonical AgentEvent.
 *
 * Mirror of the Rust trait specified in section 4.3 of the spec.
 */

import type { AgentEvent } from '../core/protocol';

export type HealthStatus =
  | { state: 'ok'; latencyMs?: number }
  | { state: 'degraded'; reason: string }
  | { state: 'down'; reason: string };

export interface AdapterConfig {
  endpoint?: string;
  token?: string;
  agentFilter?: string[];
  /** Arbitrary adapter-specific keys */
  [key: string]: unknown;
}

export type EventSink = (event: AgentEvent) => void;

export interface Subscription {
  close(): void;
}

export interface AgentAdapter {
  readonly id: string;
  /** Display label shown in the chrome */
  readonly label: string;
  connect(config: AdapterConfig): Promise<void>;
  subscribe(sink: EventSink): Subscription;
  disconnect(): Promise<void>;
  health(): HealthStatus;
}

/** Auto-detect helper used by onboarding: probe a URL and infer the adapter type. */
export type AdapterKind = 'openclaw' | 'http' | 'sse' | 'ws' | 'synthetic';

export async function detectAdapter(endpoint: string): Promise<AdapterKind> {
  try {
    const url = new URL(endpoint);
    if (url.protocol === 'ws:' || url.protocol === 'wss:') return 'ws';
    // OpenClaw default port heuristic
    if (url.port === '18789') return 'openclaw';
    // Probe content type
    const head = await fetch(endpoint, { method: 'HEAD' }).catch(() => null);
    const ct = head?.headers.get('content-type') ?? '';
    if (ct.includes('text/event-stream')) return 'sse';
    return 'http';
  } catch {
    return 'synthetic';
  }
}
