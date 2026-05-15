/**
 * Adapter registry — pick an adapter by URL / kind.
 */

import { HttpPollAdapter, SseAdapter, WsAdapter } from './http';
import { OpenClawAdapter } from './openclaw';
import { SyntheticAdapter } from './synthetic';
import { detectAdapter, type AdapterConfig, type AgentAdapter } from './contract';

export { detectAdapter };
export type { AdapterConfig, AgentAdapter };

export async function makeAdapterFromEndpoint(endpoint: string, opts?: { token?: string }): Promise<AgentAdapter> {
  if (!endpoint || endpoint === 'demo' || endpoint === 'synthetic') {
    return new SyntheticAdapter();
  }
  const kind = await detectAdapter(endpoint);
  switch (kind) {
    case 'openclaw': return new OpenClawAdapter();
    case 'ws': return new WsAdapter();
    case 'sse': return new SseAdapter();
    case 'http': return new HttpPollAdapter();
    default: return new SyntheticAdapter();
  }
}

export function makeSyntheticAdapter(): AgentAdapter {
  return new SyntheticAdapter();
}
