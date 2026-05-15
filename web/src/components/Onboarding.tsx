import { useEffect, useRef, useState } from 'react';
import './Onboarding.css';

interface OnboardingProps {
  onConnect: (endpoint: string, token?: string) => Promise<void>;
}

/** First-run sheet. "Where is your agent?"  One field, one button.
 *  Hitting Begin with empty input launches synthetic demo immediately.
 */
export function Onboarding({ onConnect }: OnboardingProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Autofocus shortly after mount (lets the splash pulse breathe first)
    const t = setTimeout(() => inputRef.current?.focus(), 600);
    return () => clearTimeout(t);
  }, []);

  const begin = async () => {
    setError(null);
    setBusy(true);
    try {
      await onConnect(value.trim() || 'demo');
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setBusy(false);
    }
  };

  return (
    <div className="onboarding-shell" role="dialog" aria-modal="true" aria-label="Connect to your agent">
      <div className="onboarding-pulse" aria-hidden />
      <div className="onboarding-card">
        <h1 className="onboarding-title">Where is your agent?</h1>
        <p className="onboarding-sub">Paste a stream URL, or leave blank to watch the demo.</p>
        <form
          className="onboarding-form"
          onSubmit={(e) => { e.preventDefault(); void begin(); }}
        >
          <input
            ref={inputRef}
            className="onboarding-input"
            type="text"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ws://192.168.1.50:18789/events    ·    https://...    ·    leave blank for demo"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Agent endpoint URL"
          />
          <button className="onboarding-button" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? 'Connecting…' : 'Begin'}
          </button>
        </form>
        {error && <div className="onboarding-error" role="alert">{error}</div>}
        <div className="onboarding-hint">
          <span>Supports OpenClaw · WebSocket · SSE · HTTP polling</span>
        </div>
      </div>
    </div>
  );
}
