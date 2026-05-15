/**
 * Agent state model — what the renderer reads.
 *
 * The reducer in reducer.ts turns event streams into this state.
 * The renderer NEVER reads events directly.
 */

import type { AgentEvent } from './protocol';

export type AgentStatus = 'idle' | 'active' | 'error' | 'disconnected';

export type BodyClass = 'tool' | 'file' | 'memory' | 'subtask';

export interface OrbitalBody {
  /** Stable id used for ring spacing + animation continuity */
  id: string;
  class: BodyClass;
  label: string;
  /** A short hint used for hover/inspect (e.g. file path, tool args summary) */
  hint?: string;
  /** Monotonic frame-time when the body appeared. Used for enter/exit easing. */
  createdAt: number;
  /** When set, body begins exit animation. Removed after exit completes. */
  retiringAt?: number;
  /** Last event time, drives nucleus pulse */
  lastEventAt: number;
  /** Status colourisation */
  status?: 'ok' | 'error' | 'in_progress';
  /** Optional source id for connection-line targets (e.g. tool body that touched this file) */
  sourceBodyId?: string;
}

export interface InterAgentLink {
  id: string;
  fromAgent: string;
  toAgent: string;
  /** Last touch time — link fades after 2s */
  lastEventAt: number;
}

export interface AgentState {
  id: string;
  /** Display name (defaults to id) */
  name: string;
  /** Stable colour index assigned at creation */
  colorIndex: number;
  status: AgentStatus;
  /** Last event time across any class — drives idle/active transition */
  lastEventAt: number;
  /** Most recent error timestamp, if any */
  lastErrorAt?: number;
  /** Last heartbeat */
  lastHeartbeatAt: number;
  /** Bodies currently in orbit (live + retiring) */
  bodies: OrbitalBody[];
  /** Recent pulse events — used to trigger pulse animations on the renderer */
  pulses: { id: string; at: number }[];
  /** Position in galaxy (assigned on first sight) */
  position?: { x: number; y: number; z: number };
}

export interface ObservatoryState {
  agents: Record<string, AgentState>;
  links: InterAgentLink[];
  /** Append-only event log (ring buffer, bounded) */
  eventLog: AgentEvent[];
  /** Last n events count for replay buffer guard */
  lastUpdatedAt: number;
}

export const INITIAL_STATE: ObservatoryState = {
  agents: {},
  links: [],
  eventLog: [],
  lastUpdatedAt: 0,
};

export const EVENT_LOG_CAPACITY = 4000;
export const ACTIVE_WINDOW_MS = 8_000;
export const HEARTBEAT_TIMEOUT_MS = 30_000;
export const PULSE_HISTORY_WINDOW_MS = 2_500;
export const BODY_RETIRE_AFTER_MS = 1_200;
export const ERROR_HIGHLIGHT_MS = 2_000;
