/**
 * SyntheticAdapter — generates a believable stream of agent activity.
 *
 * This is what runs on first launch so the app is never empty.
 * It models four agents doing realistic-feeling work: invoking tools,
 * touching files, querying memory, completing sub-tasks, and occasionally
 * messaging each other.
 *
 * The cadence is tuned to look beautiful — not realistic. ~3-6 events/sec
 * across all agents in active periods, with calm gaps for idle pulses.
 */

import { makeEvent, type AgentEvent } from '../core/protocol';
import type { AdapterConfig, AgentAdapter, EventSink, HealthStatus, Subscription } from './contract';

const AGENTS = [
  { id: 'obie', tools: ['shell', 'edit', 'grep', 'task', 'browser'], files: ['core/reducer.ts', 'scene/Nucleus.tsx', 'README.md', '.replit'] },
  { id: 'claude-code', tools: ['Read', 'Edit', 'Grep', 'Bash', 'Write', 'Glob'], files: ['vite.config.ts', 'package.json', 'index.html', 'src/App.tsx'] },
  { id: 'research', tools: ['fetch', 'crawl', 'extract', 'embed'], files: ['notes/intel.md', 'notes/spec.md', 'sources/01.html'] },
  { id: 'planner', tools: ['plan', 'estimate', 'split', 'rank'], files: ['plan/sprint.md', 'plan/refactor.md'] },
];

const MEMORY_KEYS = ['style_guide', 'user_preferences', 'last_session', 'project_context', 'voice_attrs', 'recent_files'];
const TASK_LABELS = ['Refactor reducer', 'Read spec', 'Wire shaders', 'Bench performance', 'Sketch palette', 'Draft README', 'Bundle iOS', 'Probe adapter'];

interface Inflight {
  agentId: string;
  toolName: string;
  taskId: string;
  filePath?: string;
  invokedAt: number;
  durationMs: number;
}

export class SyntheticAdapter implements AgentAdapter {
  readonly id = 'synthetic';
  readonly label = 'Demo — synthetic agents';

  private sinks: Set<EventSink> = new Set();
  private timer: number | null = null;
  private heartbeat: number | null = null;
  private connected = false;
  private inflight: Inflight[] = [];
  private tickIndex = 0;

  async connect(_config: AdapterConfig): Promise<void> {
    void _config;
    this.connected = true;
    // Initial heartbeats so all agents register immediately
    for (const a of AGENTS) {
      this.emit(makeEvent({ agent_id: a.id, type: 'heartbeat', payload: {}, meta: { source: 'synthetic' } }));
    }
    // Main event tick
    this.timer = window.setInterval(() => this.tick(), 280);
    this.heartbeat = window.setInterval(() => {
      for (const a of AGENTS) {
        this.emit(makeEvent({ agent_id: a.id, type: 'heartbeat', payload: {}, meta: { source: 'synthetic' } }));
      }
    }, 5_000);
  }

  subscribe(sink: EventSink): Subscription {
    this.sinks.add(sink);
    return {
      close: () => {
        this.sinks.delete(sink);
      },
    };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.timer != null) { clearInterval(this.timer); this.timer = null; }
    if (this.heartbeat != null) { clearInterval(this.heartbeat); this.heartbeat = null; }
    this.sinks.clear();
  }

  health(): HealthStatus {
    return this.connected ? { state: 'ok', latencyMs: 0 } : { state: 'down', reason: 'not connected' };
  }

  private emit(e: AgentEvent) {
    for (const sink of this.sinks) sink(e);
  }

  private tick() {
    this.tickIndex++;
    const now = Date.now();

    // Retire inflight tools whose duration elapsed
    for (let i = this.inflight.length - 1; i >= 0; i--) {
      const f = this.inflight[i];
      if (now - f.invokedAt >= f.durationMs) {
        this.emit(makeEvent({
          agent_id: f.agentId, type: 'tool.result',
          payload: { tool_name: f.toolName, task_id: f.taskId, status: Math.random() < 0.03 ? 'error' : 'ok', duration_ms: f.durationMs },
          meta: { source: 'synthetic' },
        }));
        this.emit(makeEvent({
          agent_id: f.agentId, type: 'task.complete',
          payload: { task_id: f.taskId },
          meta: { source: 'synthetic' },
        }));
        this.inflight.splice(i, 1);
      }
    }

    // Probability of firing new work per agent this tick
    for (const agent of AGENTS) {
      const inflightForAgent = this.inflight.filter((f) => f.agentId === agent.id).length;
      const p = inflightForAgent === 0 ? 0.45 : 0.18 - inflightForAgent * 0.04;
      if (Math.random() > p) continue;

      const tool = agent.tools[Math.floor(Math.random() * agent.tools.length)];
      const taskId = `t_${this.tickIndex}_${Math.floor(Math.random() * 1e6).toString(36)}`;
      const taskLabel = TASK_LABELS[Math.floor(Math.random() * TASK_LABELS.length)];
      const file = Math.random() < 0.55 ? agent.files[Math.floor(Math.random() * agent.files.length)] : undefined;
      const durationMs = 800 + Math.random() * 4_000;

      this.emit(makeEvent({
        agent_id: agent.id, type: 'task.start',
        payload: { task_id: taskId, task_label: taskLabel },
        meta: { source: 'synthetic' },
      }));
      this.emit(makeEvent({
        agent_id: agent.id, type: 'tool.invoke',
        payload: { tool_name: tool, task_id: taskId, status: 'in_progress' },
        meta: { source: 'synthetic' },
      }));
      if (file) {
        this.emit(makeEvent({
          agent_id: agent.id, type: Math.random() < 0.5 ? 'file.read' : 'file.write',
          payload: { file_path: file, task_id: taskId },
          meta: { source: 'synthetic' },
        }));
      }
      if (Math.random() < 0.35) {
        const key = MEMORY_KEYS[Math.floor(Math.random() * MEMORY_KEYS.length)];
        this.emit(makeEvent({
          agent_id: agent.id, type: 'memory.query',
          payload: { memory_key: key },
          meta: { source: 'synthetic' },
        }));
      }

      this.inflight.push({ agentId: agent.id, toolName: tool, taskId, filePath: file, invokedAt: now, durationMs });
    }

    // Occasional inter-agent message — drives the bezier arc
    if (Math.random() < 0.12) {
      const from = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      let to = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      while (to.id === from.id) to = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      this.emit(makeEvent({
        agent_id: from.id, type: 'agent.message',
        payload: { target_agent_id: to.id, task_label: 'consult' },
        meta: { source: 'synthetic' },
      }));
    }

    // Rare error to exercise the error tint
    if (Math.random() < 0.012) {
      const a = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      this.emit(makeEvent({
        agent_id: a.id, type: 'error',
        payload: { status: 'error' },
        meta: { source: 'synthetic' },
      }));
    }
  }
}
