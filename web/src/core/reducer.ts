/**
 * Pure reducer: (state, event) -> state.
 *
 * The reducer is the only place state mutates. Tests can replay an event log
 * deterministically by folding over the reducer.
 */

import type { AgentEvent } from './protocol';
import {
  ACTIVE_WINDOW_MS,
  BODY_RETIRE_AFTER_MS,
  EVENT_LOG_CAPACITY,
  HEARTBEAT_TIMEOUT_MS,
  INITIAL_STATE,
  PULSE_HISTORY_WINDOW_MS,
  type AgentState,
  type BodyClass,
  type InterAgentLink,
  type ObservatoryState,
  type OrbitalBody,
} from './state';

const GOLDEN = 0.6180339887;

function ensureAgent(state: ObservatoryState, id: string, now: number): AgentState {
  const existing = state.agents[id];
  if (existing) return existing;
  const colorIndex = Object.keys(state.agents).length;
  const agent: AgentState = {
    id,
    name: id,
    colorIndex,
    status: 'idle',
    lastEventAt: now,
    lastHeartbeatAt: now,
    bodies: [],
    pulses: [],
    position: galaxyPosition(colorIndex),
  };
  state.agents[id] = agent;
  return agent;
}

/** Lay agents out on a golden-ratio spiral so spacing feels natural at any count. */
function galaxyPosition(idx: number): { x: number; y: number; z: number } {
  if (idx === 0) return { x: 0, y: 0, z: 0 };
  const r = 4.8 + Math.sqrt(idx) * 2.2;
  const theta = idx * Math.PI * 2 * GOLDEN;
  return { x: Math.cos(theta) * r, y: (Math.sin(theta * 1.3) * 0.6), z: Math.sin(theta) * r };
}

function pushBody(agent: AgentState, body: OrbitalBody) {
  // Replace existing body with same id (idempotent on retries)
  const idx = agent.bodies.findIndex((b) => b.id === body.id);
  if (idx >= 0) {
    agent.bodies[idx] = { ...agent.bodies[idx], ...body, retiringAt: undefined };
  } else {
    agent.bodies.push(body);
  }
}

function markRetiring(agent: AgentState, predicate: (b: OrbitalBody) => boolean, now: number) {
  for (const b of agent.bodies) {
    if (!b.retiringAt && predicate(b)) {
      b.retiringAt = now;
    }
  }
}

function pruneRetired(agent: AgentState, now: number) {
  agent.bodies = agent.bodies.filter((b) => !b.retiringAt || now - b.retiringAt < BODY_RETIRE_AFTER_MS + 50);
}

function recordPulse(agent: AgentState, evtId: string, now: number) {
  agent.pulses.push({ id: evtId, at: now });
  // Trim ancient pulses
  const cutoff = now - PULSE_HISTORY_WINDOW_MS;
  agent.pulses = agent.pulses.filter((p) => p.at >= cutoff);
}

function recordLink(state: ObservatoryState, fromAgent: string, toAgent: string, now: number) {
  const id = `${fromAgent}::${toAgent}`;
  const existing = state.links.find((l) => l.id === id);
  if (existing) {
    existing.lastEventAt = now;
  } else {
    state.links.push({ id, fromAgent, toAgent, lastEventAt: now });
  }
}

function pruneStale(state: ObservatoryState, now: number) {
  // Drop links that have been inactive for >2.6s
  state.links = state.links.filter((l) => now - l.lastEventAt < 2_600);
  for (const agent of Object.values(state.agents)) {
    pruneRetired(agent, now);
  }
}

function recomputeStatuses(state: ObservatoryState, now: number) {
  for (const agent of Object.values(state.agents)) {
    if (agent.status === 'error' && now - (agent.lastErrorAt ?? 0) > ACTIVE_WINDOW_MS) {
      agent.status = 'idle';
    }
    if (now - agent.lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS) {
      agent.status = 'disconnected';
      continue;
    }
    if (agent.status === 'disconnected') {
      // recovered if any heartbeat in window
      if (now - agent.lastHeartbeatAt < HEARTBEAT_TIMEOUT_MS) {
        agent.status = now - agent.lastEventAt < ACTIVE_WINDOW_MS ? 'active' : 'idle';
      }
    } else if (agent.status !== 'error') {
      agent.status = now - agent.lastEventAt < ACTIVE_WINDOW_MS ? 'active' : 'idle';
    }
  }
}

/**
 * Main reducer. `now` is monotonic ms (performance.now()) supplied by the caller.
 * All state timestamps are monotonic — event.ts is preserved only in the event log.
 */
export function reduce(state: ObservatoryState, event: AgentEvent, now: number): ObservatoryState {
  const eventMs = now;
  const agent = ensureAgent(state, event.agent_id, eventMs);
  agent.lastEventAt = eventMs;

  switch (event.type) {
    case 'tool.invoke': {
      const tool = event.payload.tool_name ?? 'tool';
      pushBody(agent, {
        id: `tool::${tool}::${event.payload.task_id ?? event.id}`,
        class: 'tool',
        label: tool,
        hint: event.payload.task_label,
        createdAt: eventMs,
        lastEventAt: eventMs,
        status: event.payload.status ?? 'in_progress',
      });
      recordPulse(agent, event.id, eventMs);
      break;
    }
    case 'tool.result': {
      const tool = event.payload.tool_name ?? 'tool';
      const bodyId = `tool::${tool}::${event.payload.task_id ?? event.id}`;
      markRetiring(agent, (b) => b.id === bodyId, eventMs);
      // ANY tool body for this tool name → retire too (for adapters that don't pass task_id)
      markRetiring(agent, (b) => b.class === 'tool' && b.label === tool && !b.retiringAt, eventMs);
      break;
    }
    case 'file.read':
    case 'file.write': {
      const path = event.payload.file_path ?? 'file';
      const filename = path.split('/').pop() ?? path;
      const bodyId = `file::${path}`;
      pushBody(agent, {
        id: bodyId,
        class: 'file',
        label: filename,
        hint: path,
        createdAt: eventMs,
        lastEventAt: eventMs,
        status: event.type === 'file.write' ? 'in_progress' : 'ok',
      });
      // Auto-retire after 4s of no further mention
      scheduleRetire(agent, bodyId, eventMs, 4_000);
      recordPulse(agent, event.id, eventMs);
      break;
    }
    case 'memory.query': {
      const key = event.payload.memory_key ?? 'memory';
      const bodyId = `mem::${key}`;
      pushBody(agent, {
        id: bodyId,
        class: 'memory',
        label: key,
        createdAt: eventMs,
        lastEventAt: eventMs,
        status: 'ok',
      });
      scheduleRetire(agent, bodyId, eventMs, 3_500);
      recordPulse(agent, event.id, eventMs);
      break;
    }
    case 'task.start': {
      const taskId = event.payload.task_id ?? event.id;
      pushBody(agent, {
        id: `task::${taskId}`,
        class: 'subtask',
        label: event.payload.task_label ?? taskId,
        createdAt: eventMs,
        lastEventAt: eventMs,
        status: 'in_progress',
      });
      recordPulse(agent, event.id, eventMs);
      break;
    }
    case 'task.complete': {
      const taskId = event.payload.task_id ?? event.id;
      markRetiring(agent, (b) => b.id === `task::${taskId}`, eventMs);
      break;
    }
    case 'agent.message': {
      if (event.payload.target_agent_id) {
        ensureAgent(state, event.payload.target_agent_id, eventMs);
        recordLink(state, agent.id, event.payload.target_agent_id, eventMs);
      }
      recordPulse(agent, event.id, eventMs);
      break;
    }
    case 'heartbeat': {
      agent.lastHeartbeatAt = eventMs;
      break;
    }
    case 'error': {
      agent.status = 'error';
      agent.lastErrorAt = eventMs;
      break;
    }
  }

  // Maintain event log (bounded)
  state.eventLog.push(event);
  if (state.eventLog.length > EVENT_LOG_CAPACITY) {
    state.eventLog.splice(0, state.eventLog.length - EVENT_LOG_CAPACITY);
  }

  pruneStale(state, now);
  recomputeStatuses(state, now);
  state.lastUpdatedAt = now;
  return state;
}

/** Light-weight scheduler — stamps an autoRetireAt that animation tick can react to */
function scheduleRetire(agent: AgentState, bodyId: string, now: number, afterMs: number) {
  const body = agent.bodies.find((b) => b.id === bodyId);
  if (!body) return;
  // store as a pseudo-property on the body via lastEventAt offset; renderer reads retiringAt only
  body.lastEventAt = now;
  // We don't auto-retire here — the tick() function below does it.
  void afterMs;
}

/** Called by the animation loop on every frame — applies time-based retirement, prunes. */
export function tick(state: ObservatoryState, now: number): ObservatoryState {
  for (const agent of Object.values(state.agents)) {
    for (const body of agent.bodies) {
      if (body.retiringAt) continue;
      // Idle retire rules per class
      const inactiveMs = now - body.lastEventAt;
      if (body.class === 'file' && inactiveMs > 4_000) body.retiringAt = now;
      else if (body.class === 'memory' && inactiveMs > 3_500) body.retiringAt = now;
      else if (body.class === 'tool' && inactiveMs > 6_000) body.retiringAt = now;
      else if (body.class === 'subtask' && inactiveMs > 8_000) body.retiringAt = now;
    }
    pruneRetired(agent, now);
    // Trim pulse history
    const cutoff = now - PULSE_HISTORY_WINDOW_MS;
    agent.pulses = agent.pulses.filter((p) => p.at >= cutoff);
  }
  pruneStale(state, now);
  recomputeStatuses(state, now);
  state.lastUpdatedAt = now;
  return state;
}

export { INITIAL_STATE };
