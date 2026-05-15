import { useEffect, useMemo, useState } from 'react';
import { useObservatory } from '../store/observatory';
import { agentPalette } from '../lib/tokens';
import './Chrome.css';

interface ChromeProps {
  focusedAgentId: string | null;
  onClearFocus: () => void;
  onToggleScreensaver: () => void;
  screensaverMode: boolean;
}

/** The thinnest possible chrome.  Single status pill, focused-agent panel,
 *  bottom-right screensaver toggle.  Everything else is deliberately not here. */
export function Chrome({ focusedAgentId, onClearFocus, onToggleScreensaver, screensaverMode }: ChromeProps) {
  const connection = useObservatory((s) => s.connection);
  const sourceLabel = useObservatory((s) => s.sourceLabel);
  const agents = useObservatory((s) => Object.values(s.state.agents));
  const focusedAgent = useMemo(
    () => agents.find((a) => a.id === focusedAgentId),
    [agents, focusedAgentId],
  );

  if (screensaverMode) {
    return <ScreensaverHint onExit={onToggleScreensaver} />;
  }

  return (
    <div className="chrome observatory-chrome" aria-live="polite">
      <div className="chrome-top">
        <StatusPill connection={connection} sourceLabel={sourceLabel} agentCount={agents.length} />
      </div>

      {focusedAgent && (
        <FocusedPanel
          name={focusedAgent.name}
          colorIndex={focusedAgent.colorIndex}
          bodies={focusedAgent.bodies.length}
          status={focusedAgent.status}
          onClose={onClearFocus}
        />
      )}

      <div className="chrome-bottom">
        <button
          className="chrome-iconbtn"
          aria-label="Enter screensaver mode"
          title="Screensaver"
          onClick={onToggleScreensaver}
        >
          <MoonIcon />
        </button>
      </div>
    </div>
  );
}

function StatusPill({ connection, sourceLabel, agentCount }: { connection: string; sourceLabel: string; agentCount: number }) {
  return (
    <div className={`status-pill status-${connection}`}>
      <span className="status-dot" aria-hidden />
      <span className="status-text">
        <span className="status-label">{labelForConnection(connection)}</span>
        {sourceLabel && <span className="status-source">{sourceLabel}</span>}
        <span className="status-count">{agentCount} agent{agentCount === 1 ? '' : 's'}</span>
      </span>
    </div>
  );
}

function labelForConnection(c: string): string {
  switch (c) {
    case 'connected': return 'Live';
    case 'connecting': return 'Connecting';
    case 'error': return 'Error';
    case 'disconnected': return 'Disconnected';
    default: return 'Idle';
  }
}

function FocusedPanel({ name, colorIndex, bodies, status, onClose }: { name: string; colorIndex: number; bodies: number; status: string; onClose: () => void }) {
  const palette = agentPalette(colorIndex);
  return (
    <div className="focused-panel" role="region" aria-label={`Agent ${name}`}>
      <div className="focused-color" style={{ background: palette.hex.core, boxShadow: `0 0 18px ${palette.hex.core}88` }} />
      <div className="focused-meta">
        <div className="focused-name">{name.toUpperCase()}</div>
        <div className="focused-line">
          <span className="focused-status">{status}</span>
          <span className="focused-sep">·</span>
          <span className="focused-bodies">{bodies} active</span>
        </div>
      </div>
      <button className="focused-close" aria-label="Close" onClick={onClose}>×</button>
    </div>
  );
}

function ScreensaverHint({ onExit }: { onExit: () => void }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const handler = () => setVisible(true);
    const hider = setTimeout(() => setVisible(false), 3_000);
    window.addEventListener('pointermove', handler);
    window.addEventListener('keydown', handler);
    window.addEventListener('touchstart', handler);
    return () => {
      window.removeEventListener('pointermove', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
      clearTimeout(hider);
    };
  }, []);
  return (
    <div className={`screensaver-hint${visible ? ' visible' : ''}`} onClick={onExit}>
      <span>Tap to exit screensaver</span>
    </div>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
