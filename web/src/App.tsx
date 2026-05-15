import { useCallback, useEffect, useRef, useState } from 'react';
import { Scene } from './scene/Scene';
import { Onboarding } from './components/Onboarding';
import { Chrome } from './components/Chrome';
import { makeAdapterFromEndpoint, makeSyntheticAdapter, type AgentAdapter } from './adapters';
import { useObservatory } from './store/observatory';

export default function App() {
  const setConnection = useObservatory((s) => s.setConnection);
  const bootstrapped = useObservatory((s) => s.bootstrapped);
  const setBootstrapped = useObservatory((s) => s.setBootstrapped);
  const ingest = useObservatory((s) => s.ingest);
  const reducedMotion = useObservatory((s) => s.reducedMotion);
  const setReducedMotion = useObservatory((s) => s.setReducedMotion);

  const adapterRef = useRef<AgentAdapter | null>(null);
  const subRef = useRef<{ close: () => void } | null>(null);
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null);
  const [screensaverMode, setScreensaverMode] = useState(false);

  // Detect prefers-reduced-motion once at mount.
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(m.matches);
    const cb = () => setReducedMotion(m.matches);
    m.addEventListener?.('change', cb);
    return () => m.removeEventListener?.('change', cb);
  }, [setReducedMotion]);

  const connect = useCallback(async (endpoint: string, token?: string) => {
    setConnection('connecting');
    try {
      const adapter = await makeAdapterFromEndpoint(endpoint, { token });
      adapterRef.current = adapter;
      await adapter.connect({ endpoint, token });
      subRef.current?.close();
      subRef.current = adapter.subscribe((evt) => ingest(evt));
      setConnection('connected', adapter.label);
      setBootstrapped(true);
    } catch (e) {
      setConnection('error', String((e as Error).message ?? e));
      // Fallback to synthetic so the screensaver isn't ever blank.
      const adapter = makeSyntheticAdapter();
      adapterRef.current = adapter;
      await adapter.connect({});
      subRef.current = adapter.subscribe((evt) => ingest(evt));
      setConnection('connected', adapter.label);
      setBootstrapped(true);
      throw e;
    }
  }, [ingest, setConnection, setBootstrapped]);

  // Cleanup on unmount
  useEffect(() => () => {
    subRef.current?.close();
    adapterRef.current?.disconnect();
  }, []);

  // Keyboard shortcuts: Cmd+Ctrl+S → screensaver toggle, Esc → clear focus / exit screensaver
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (screensaverMode) setScreensaverMode(false);
        else setFocusedAgentId(null);
      } else if (e.key === 's' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        setScreensaverMode((v) => !v);
      } else if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [screensaverMode]);

  return (
    <div className="observatory-root">
      {bootstrapped && (
        <Scene
          reducedMotion={reducedMotion}
          screensaverMode={screensaverMode}
          focusedAgentId={focusedAgentId}
          onAgentClick={(id) => setFocusedAgentId((prev) => (prev === id ? null : id))}
        />
      )}
      {bootstrapped && (
        <Chrome
          focusedAgentId={focusedAgentId}
          onClearFocus={() => setFocusedAgentId(null)}
          onToggleScreensaver={() => setScreensaverMode((v) => !v)}
          screensaverMode={screensaverMode}
        />
      )}
      {!bootstrapped && <Onboarding onConnect={connect} />}
    </div>
  );
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}
