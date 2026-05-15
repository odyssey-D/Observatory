/**
 * Generic adapters for plain HTTP/JSON, SSE, and WebSocket sources.
 *
 * Each expects the upstream to emit canonical AgentEvent JSON.
 * The "OpenClaw" adapter is a thin specialisation of WebSocket that also
 * understands legacy event names and translates them — see openclaw.ts.
 */

import type { AgentEvent } from '../core/protocol';
import type { AdapterConfig, AgentAdapter, EventSink, HealthStatus, Subscription } from './contract';

/** HTTP long-poll adapter. Calls `GET endpoint` every `pollMs` and expects an array of events. */
export class HttpPollAdapter implements AgentAdapter {
  readonly id = 'http';
  readonly label: string;

  private sinks = new Set<EventSink>();
  private timer: number | null = null;
  private endpoint = '';
  private token?: string;
  private pollMs = 1_500;
  private lastSeenMs = 0;
  private lastErr?: string;

  constructor(label?: string) {
    this.label = label ?? 'HTTP — poll';
  }

  async connect(config: AdapterConfig): Promise<void> {
    if (!config.endpoint) throw new Error('endpoint required');
    this.endpoint = config.endpoint;
    this.token = config.token;
    this.pollMs = (config.pollMs as number) ?? 1_500;
    // Initial poll, then schedule
    await this.poll();
    this.timer = window.setInterval(() => { void this.poll(); }, this.pollMs);
  }

  subscribe(sink: EventSink): Subscription {
    this.sinks.add(sink);
    return { close: () => this.sinks.delete(sink) };
  }

  async disconnect(): Promise<void> {
    if (this.timer != null) { clearInterval(this.timer); this.timer = null; }
    this.sinks.clear();
  }

  health(): HealthStatus {
    if (this.lastErr) return { state: 'degraded', reason: this.lastErr };
    return { state: 'ok' };
  }

  private async poll() {
    try {
      const url = this.lastSeenMs > 0 ? `${this.endpoint}?since=${this.lastSeenMs}` : this.endpoint;
      const headers: Record<string, string> = { accept: 'application/json' };
      if (this.token) headers['authorization'] = `Bearer ${this.token}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const events: AgentEvent[] = Array.isArray(data) ? data : data.events ?? [];
      for (const e of events) {
        for (const sink of this.sinks) sink(e);
      }
      this.lastSeenMs = Date.now();
      this.lastErr = undefined;
    } catch (err) {
      this.lastErr = String(err);
    }
  }
}

/** Server-Sent Events adapter. */
export class SseAdapter implements AgentAdapter {
  readonly id = 'sse';
  readonly label: string;

  private sinks = new Set<EventSink>();
  private es: EventSource | null = null;
  private lastErr?: string;

  constructor(label?: string) {
    this.label = label ?? 'SSE — stream';
  }

  async connect(config: AdapterConfig): Promise<void> {
    if (!config.endpoint) throw new Error('endpoint required');
    return new Promise((resolve, reject) => {
      try {
        this.es = new EventSource(config.endpoint!);
        this.es.onopen = () => { this.lastErr = undefined; resolve(); };
        this.es.onerror = (e) => {
          this.lastErr = 'sse error';
          // The browser will auto-reconnect; do not reject after open.
          void e;
        };
        this.es.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data);
            const events: AgentEvent[] = Array.isArray(data) ? data : [data];
            for (const e of events) for (const sink of this.sinks) sink(e);
          } catch (err) {
            this.lastErr = String(err);
          }
        };
      } catch (err) { reject(err); }
    });
  }

  subscribe(sink: EventSink): Subscription {
    this.sinks.add(sink);
    return { close: () => this.sinks.delete(sink) };
  }

  async disconnect(): Promise<void> {
    this.es?.close();
    this.es = null;
    this.sinks.clear();
  }

  health(): HealthStatus {
    if (this.lastErr) return { state: 'degraded', reason: this.lastErr };
    return this.es?.readyState === 1 ? { state: 'ok' } : { state: 'down', reason: 'not open' };
  }
}

/** WebSocket adapter. */
export class WsAdapter implements AgentAdapter {
  readonly id = 'ws';
  readonly label: string;

  private sinks = new Set<EventSink>();
  private ws: WebSocket | null = null;
  private lastErr?: string;
  private endpoint = '';
  private token?: string;
  private reconnectTimer: number | null = null;

  constructor(label?: string) {
    this.label = label ?? 'WebSocket — stream';
  }

  async connect(config: AdapterConfig): Promise<void> {
    if (!config.endpoint) throw new Error('endpoint required');
    this.endpoint = config.endpoint;
    this.token = config.token;
    await this.open();
  }

  private open(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = this.token ? `${this.endpoint}?token=${encodeURIComponent(this.token)}` : this.endpoint;
        this.ws = new WebSocket(url);
        this.ws.onopen = () => { this.lastErr = undefined; resolve(); };
        this.ws.onerror = () => { this.lastErr = 'ws error'; };
        this.ws.onclose = () => {
          // Auto-reconnect with backoff
          if (this.reconnectTimer == null) {
            this.reconnectTimer = window.setTimeout(() => { this.reconnectTimer = null; void this.open().catch(() => {}); }, 1_500);
          }
        };
        this.ws.onmessage = (evt) => {
          try {
            const data = typeof evt.data === 'string' ? JSON.parse(evt.data) : null;
            if (!data) return;
            const events: AgentEvent[] = Array.isArray(data) ? data : data.events ?? [data];
            for (const e of events) for (const sink of this.sinks) sink(e);
          } catch (err) { this.lastErr = String(err); }
        };
      } catch (err) { reject(err); }
    });
  }

  subscribe(sink: EventSink): Subscription {
    this.sinks.add(sink);
    return { close: () => this.sinks.delete(sink) };
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer != null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.ws?.close();
    this.ws = null;
    this.sinks.clear();
  }

  health(): HealthStatus {
    if (this.lastErr) return { state: 'degraded', reason: this.lastErr };
    return this.ws?.readyState === WebSocket.OPEN ? { state: 'ok' } : { state: 'down', reason: 'not open' };
  }
}
