/**
 * Observatory canonical event protocol — v1.0.
 *
 * Every adapter normalises into this schema. The schema IS the protocol.
 * Anything that emits these events can drive the Observatory.
 */

export type EventType =
  | 'tool.invoke'
  | 'tool.result'
  | 'file.read'
  | 'file.write'
  | 'memory.query'
  | 'task.start'
  | 'task.complete'
  | 'agent.message'
  | 'heartbeat'
  | 'error';

export type EventStatus = 'ok' | 'error' | 'in_progress';

export type EventSource = 'openclaw' | 'http' | 'sse' | 'ws' | 'cli' | 'mcp' | 'synthetic';

export interface AgentEventPayload {
  tool_name?: string;
  file_path?: string;
  memory_key?: string;
  task_id?: string;
  task_label?: string;
  target_agent_id?: string;
  duration_ms?: number;
  tokens?: number;
  status?: EventStatus;
}

export interface AgentEvent {
  id: string;
  ts: string;
  agent_id: string;
  type: EventType;
  payload: AgentEventPayload;
  meta: {
    source: EventSource;
    version: '1.0';
  };
}

/** Helper to construct a canonical event with sane defaults. */
export function makeEvent(partial: Omit<AgentEvent, 'id' | 'ts' | 'meta'> & { id?: string; ts?: string; meta?: Partial<AgentEvent['meta']> }): AgentEvent {
  return {
    id: partial.id ?? `evt_${cryptoRandom()}`,
    ts: partial.ts ?? new Date().toISOString(),
    agent_id: partial.agent_id,
    type: partial.type,
    payload: partial.payload,
    meta: {
      source: partial.meta?.source ?? 'synthetic',
      version: '1.0',
    },
  };
}

function cryptoRandom(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  }
  // Fallback
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Type guards */
export const isToolEvent = (e: AgentEvent) => e.type === 'tool.invoke' || e.type === 'tool.result';
export const isFileEvent = (e: AgentEvent) => e.type === 'file.read' || e.type === 'file.write';
export const isMemoryEvent = (e: AgentEvent) => e.type === 'memory.query';
export const isTaskEvent = (e: AgentEvent) => e.type === 'task.start' || e.type === 'task.complete';
