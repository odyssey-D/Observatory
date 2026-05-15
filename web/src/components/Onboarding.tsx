import { useEffect, useRef, useState } from 'react';
import { parsePairingInput } from '../lib/pairing';
import './Onboarding.css';

type Mode = 'home' | 'openclaw' | 'paste';

interface OnboardingProps {
  /** Called with whatever the user enters — a URL, a deeplink, or 'demo'. */
  onConnect: (endpointOrDeeplink: string, token?: string) => Promise<void>;
}

export function Onboarding({ onConnect }: OnboardingProps) {
  const [mode, setMode] = useState<Mode>('home');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async (endpoint: string, token?: string) => {
    setError(null);
    setBusy(true);
    try {
      await onConnect(endpoint, token);
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setBusy(false);
    }
  };

  // Auto-handle observatory:// deeplinks the user might paste into the URL bar
  // or have arrived via a system handler (iOS URL scheme).
  useEffect(() => {
    const launchUrl = new URLSearchParams(window.location.search).get('pair')
      ?? new URLSearchParams(window.location.search).get('connect');
    if (launchUrl) {
      const parsed = parsePairingInput(launchUrl);
      if (parsed) void start(parsed.endpoint, parsed.token);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="onboarding-shell" role="dialog" aria-modal="true" aria-label="Connect to your agent">
      <div className="onboarding-pulse" aria-hidden />
      <div className="onboarding-card">
        {mode === 'home' && (
          <Home onPickOpenClaw={() => setMode('openclaw')} onPickPaste={() => setMode('paste')} onDemo={() => start('demo')} busy={busy} />
        )}
        {mode === 'openclaw' && (
          <OpenClawPair onBack={() => setMode('home')} onPaired={(p) => start(p, undefined)} busy={busy} error={error} setError={setError} />
        )}
        {mode === 'paste' && (
          <PasteUrl onBack={() => setMode('home')} onSubmit={(p) => start(p)} busy={busy} error={error} setError={setError} />
        )}
        {error && <div className="onboarding-error" role="alert">{error}</div>}
      </div>
    </div>
  );
}

/* ---------------------- panels ---------------------- */

function Home({ onPickOpenClaw, onPickPaste, onDemo, busy }: { onPickOpenClaw: () => void; onPickPaste: () => void; onDemo: () => void; busy: boolean }) {
  return (
    <>
      <h1 className="onboarding-title">Where is your agent?</h1>
      <p className="onboarding-sub">Pick how you want to connect. Everything stays on your machine.</p>
      <div className="onboarding-options">
        <button className="onboarding-option ob-primary" disabled={busy} onClick={onPickOpenClaw}>
          <SpanIcon><OpenClawIcon /></SpanIcon>
          <span className="ob-option-text">
            <span className="ob-option-title">Pair with OpenClaw</span>
            <span className="ob-option-sub">One command in your terminal</span>
          </span>
          <span className="ob-option-chev">›</span>
        </button>
        <button className="onboarding-option" disabled={busy} onClick={onPickPaste}>
          <SpanIcon><LinkIcon /></SpanIcon>
          <span className="ob-option-text">
            <span className="ob-option-title">Paste a stream URL</span>
            <span className="ob-option-sub">WebSocket · SSE · HTTP</span>
          </span>
          <span className="ob-option-chev">›</span>
        </button>
        <button className="onboarding-option" disabled={busy} onClick={onDemo}>
          <SpanIcon><SparkleIcon /></SpanIcon>
          <span className="ob-option-text">
            <span className="ob-option-title">Watch the demo</span>
            <span className="ob-option-sub">Four synthetic agents · zero config</span>
          </span>
          <span className="ob-option-chev">›</span>
        </button>
      </div>
    </>
  );
}

function OpenClawPair({ onBack, onPaired, busy, setError }: { onBack: () => void; onPaired: (deeplink: string) => void; busy: boolean; error: string | null; setError: (e: string | null) => void }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const submit = () => {
    const parsed = parsePairingInput(value);
    if (!parsed) { setError('That doesn\'t look like a pairing URL.'); return; }
    onPaired(value);
  };

  return (
    <>
      <button className="ob-back" onClick={onBack} aria-label="Back">‹ Back</button>
      <h1 className="onboarding-title">Pair with OpenClaw</h1>
      <p className="onboarding-sub">One-time install. Then one command. Then you're in.</p>
      <CodeBlock>$ openclaw plugins install plugins/openclaw-observatory</CodeBlock>
      <CodeBlock>$ openclaw observatory connect</CodeBlock>
      <p className="onboarding-sub-faint">
        The command prints a one-time pair link. Paste it below — or, on iOS, tap the link to open Observatory directly.
        Don't want to install a plugin? <code className="ob-inline-code">./bin/openclaw-observatory connect</code> does the same job.
      </p>
      <form className="onboarding-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input
          ref={inputRef}
          className="onboarding-input"
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="observatory://connect?ws=…"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          aria-label="Pairing URL"
        />
        <button className="onboarding-button" type="submit" disabled={busy || !value.trim()} aria-busy={busy}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </form>
      <p className="onboarding-trust">
        <ShieldIcon /> Bearer token in URL stays in this app. Observatory never persists tokens to disk.
      </p>
    </>
  );
}

function PasteUrl({ onBack, onSubmit, busy, setError }: { onBack: () => void; onSubmit: (s: string) => void; busy: boolean; error: string | null; setError: (e: string | null) => void }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const submit = () => {
    const parsed = parsePairingInput(value);
    if (!parsed) { setError('Enter a wss://, ws://, https://, or http:// URL.'); return; }
    onSubmit(value);
  };

  return (
    <>
      <button className="ob-back" onClick={onBack} aria-label="Back">‹ Back</button>
      <h1 className="onboarding-title">Paste a stream URL</h1>
      <p className="onboarding-sub">WebSocket, Server-Sent Events, or HTTP polling.</p>
      <form className="onboarding-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input
          ref={inputRef}
          className="onboarding-input"
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="wss://agent.lan:18789/events"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          aria-label="Stream URL"
        />
        <button className="onboarding-button" type="submit" disabled={busy || !value.trim()} aria-busy={busy}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </form>
    </>
  );
}

/* ---------------------- bits & pieces ---------------------- */

function CodeBlock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = ref.current?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text.replace(/^\$ /, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1_200);
    } catch { /* ignore */ }
  };
  return (
    <div className="ob-code">
      <pre ref={ref}><code>{children}</code></pre>
      <button className="ob-copy" onClick={copy} aria-label="Copy command">
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
}

function SpanIcon({ children }: { children: React.ReactNode }) { return <span className="ob-option-icon">{children}</span>; }

function OpenClawIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.5" />
      <ellipse cx="12" cy="12" rx="9.5" ry="4" />
      <ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(120 12 12)" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}
function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 4v6c0 5-4 8-8 9-4-1-8-4-8-9V7l8-4z" />
    </svg>
  );
}
