/**
 * OpenClawAdapter — reference adapter for OpenClaw's event stream.
 *
 * OpenClaw emits events over a WebSocket on its gateway port (default 18789).
 * This adapter wraps the generic WsAdapter and translates OpenClaw-native
 * event names into the canonical schema (table 4.4 of the spec).
 */

import type { AgentEvent } from '../core/protocol';
import { makeEvent } from '../core/protocol';
import type { AdapterConfig, AgentAdapter, EventSink, HealthStatus, Subscription } from './contract';
import { WsAdapter } from './http';

interface OpenClawNativeEvent {
  type: string;
  agent?: string;
  agent_id?: string;
  ts?: string;
  tool?: string;
  path?: string;
  task?: string;
  task_id?: string;
  target?: string;
  duration_ms?: number;
  tokens?: number;
  status?: 'ok' | 'error' | 'in_progress';
  memory_key?: string;
  // Catch-all for any extra fields
  [key: string]: unknown;
}

const TYPE_MAP: Record<string, AgentEvent['type'] | undefined> = {
  tool_call_start: 'tool.invoke',
  tool_call_end: 'tool.result',
  'file_io.read': 'file.read',
  'file_io.write': 'file.write',
  'memory.query': 'memory.query',
  room_dispatch: 'task.start',
  room_complete: 'task.complete',
  'room.dispatch': 'task.start',
  'room.complete': 'task.complete',
  'agent.heartbeat': 'heartbeat',
  heartbeat: 'heartbeat',
  error: 'error',
  'agent.message': 'agent.message',
};

export class OpenClawAdapter implements AgentAdapter {
  readonly id = 'openclaw';
  readonly label = 'OpenClaw';

  private ws: WsAdapter;
  private sinks = new Set<EventSink>();
  private innerSub?: Subscription;

  constructor() {
    this.ws = new WsAdapter('OpenClaw — ws');
  }

  async connect(config: AdapterConfig): Promise<void> {
    if (!config.endpoint) throw new Error('endpoint required');
    await this.ws.connect(config);
    this.innerSub = this.ws.subscribe((e) => {
      // The inner WS adapter forwards as canonical if upstream is canonical;
      // detect a native OpenClaw event by absence of meta.source === 'http'/etc.
      const translated = this.translate(e as unknown as OpenClawNativeEvent);
      if (translated) {
        for (const sink of this.sinks) sink(translated);
      } else if (this.looksCanonical(e)) {
        for (const sink of this.sinks) sink(e);
      }
    });
  }

  subscribe(sink: EventSink): Subscription {
    this.sinks.add(sink);
    return { close: () => this.sinks.delete(sink) };
  }

  async disconnect(): Promise<void> {
    this.innerSub?.close();
    await this.ws.disconnect();
    this.sinks.clear();
  }

  health(): HealthStatus { return this.ws.health(); }

  private looksCanonical(e: unknown): e is AgentEvent {
    return !!e && typeof e === 'object' && 'agent_id' in (e as object) && 'type' in (e as object) && 'meta' in (e as object);
  }

  private translate(e: OpenClawNativeEvent): AgentEvent | null {
    const canonicalType = TYPE_MAP[e.type];
    if (!canonicalType) return null;
    const agentId = e.agent_id ?? e.agent ?? 'unknown';
    return makeEvent({
      agent_id: agentId,
      type: canonicalType,
      payload: {
        tool_name: e.tool,
        file_path: e.path,
        memory_key: e.memory_key,
        task_id: e.task_id ?? e.task,
        task_label: typeof e.task === 'string' ? e.task : undefined,
        target_agent_id: e.target,
        duration_ms: e.duration_ms,
        tokens: e.tokens,
        status: e.status,
      },
      meta: { source: 'openclaw' },
    });
  }
}
