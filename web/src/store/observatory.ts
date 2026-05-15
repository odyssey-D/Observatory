/**
 * Zustand store wrapping the reducer.
 *
 * Performance discipline:
 *   - ingest(event)   — runs the reducer AND bumps `version` so React re-renders.
 *                       Shallow clones state so selector identity comparisons fire.
 *   - tick(now)       — runs the per-frame retire/prune logic in place.
 *                       Does NOT touch any React-visible reference.  The render
 *                       loop reads bodies/positions via getState() each frame.
 *
 * This separation is the difference between a smooth 60fps and a stuttery mess.
 */

import { create } from 'zustand';
import type { AgentEvent } from '../core/protocol';
import { reduce, tick as runTick } from '../core/reducer';
import { INITIAL_STATE, type ObservatoryState } from '../core/state';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected';

interface ObservatoryStore {
  state: ObservatoryState;
  /** Monotonic counter — bumps when ingest changes state */
  version: number;
  connection: ConnectionState;
  sourceLabel: string;
  bootstrapped: boolean;
  reducedMotion: boolean;

  ingest: (event: AgentEvent) => void;
  tick: (now: number) => void;
  reset: () => void;
  setConnection: (c: ConnectionState, label?: string) => void;
  setBootstrapped: (b: boolean) => void;
  setReducedMotion: (b: boolean) => void;
}

function freshState(): ObservatoryState {
  return { ...INITIAL_STATE, agents: {}, links: [], eventLog: [] };
}

export const useObservatory = create<ObservatoryStore>((set, get) => ({
  state: freshState(),
  version: 0,
  connection: 'idle',
  sourceLabel: '',
  bootstrapped: false,
  reducedMotion: false,

  ingest: (event) => {
    const s = get();
    reduce(s.state, event, performance.now());
    // Shallow-clone agents map and links so selectors that key on object identity update.
    set({
      state: {
        ...s.state,
        agents: { ...s.state.agents },
        links: [...s.state.links],
      },
      version: s.version + 1,
    });
  },
  tick: (now) => {
    // Pure mutate.  No set().  Render loop reads via getState() / closure.
    runTick(get().state, now);
  },
  reset: () =>
    set({
      state: freshState(),
      version: 0,
      connection: 'idle',
      sourceLabel: '',
    }),
  setConnection: (connection, sourceLabel) =>
    set((s) => ({ connection, sourceLabel: sourceLabel ?? s.sourceLabel })),
  setBootstrapped: (bootstrapped) => set({ bootstrapped }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
}));
