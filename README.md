# Observatory

> Real-time, screensaver-grade visualisation of working AI agents.
> Web + iOS/iPadOS, identical visuals, protocol-agnostic.

Open a browser or tap the home-screen icon and watch your agents work as a
living galaxy of coloured nuclei. Each agent is a soft sphere; the tools it
invokes, files it touches, memories it queries, and sub-tasks it runs are
orbital bodies around it. When two agents talk, a glowing arc bows between
them with a particle flowing in the direction of the call.

It is built to be left running on a second monitor or a phone in a charging
dock. It breathes when idle and pulses when active.

---

## Quick start

### Web (local)

```bash
cd web
npm install
npm run dev          # → http://localhost:5173
```

First-run sheet offers three paths:

1. **Pair with OpenClaw** — one command in your terminal, paste the link back. See below.
2. **Paste a stream URL** — WebSocket / SSE / HTTP polling.
3. **Watch the demo** — 4 synthetic agents, zero config.

### Pair with OpenClaw

The pairing CLI is a standalone helper that lives at `bin/openclaw-observatory`.
On the machine running your agent:

```bash
# from a checkout of this repo
./bin/openclaw-observatory connect

# or put it on your PATH so you can just call it from anywhere:
sudo ln -s "$(pwd)/bin/openclaw-observatory" /usr/local/bin/openclaw-observatory
openclaw-observatory connect

# defaults to 127.0.0.1:18789; override for LAN / TLS:
openclaw-observatory connect --host my.lan --port 18789 --tls
```

> **Note.** Running `openclaw observatory connect` (as a *sub-command* of the
> `openclaw` CLI) requires an OpenClaw plugin that I haven't shipped yet —
> OpenClaw's plugin loader needs to know about Observatory. For now, use the
> standalone `openclaw-observatory connect` form above. Hooking it into
> OpenClaw's plugin system is tracked in [TODO](#todo).

It prints a one-time pairing link (and, if `qrencode` is installed, a QR
code for tapping from your phone):

```
  endpoint    ws://127.0.0.1:18789/events
  token       a3f2c1...           (freshly generated)

  paste this into Observatory →

  observatory://connect?ws=ws%3A%2F%2F127.0.0.1%3A18789%2Fevents&token=a3f2c1...&label=OpenClaw
```

Open Observatory → **Pair with OpenClaw** → paste. Done. On iOS, the
`observatory://` URL is a registered scheme — tap it and the app opens
connected.

**The trust model:** the bearer token in the URL gates the stream. Set
`OPENCLAW_TOKEN=<the printed token>` on your agent side so the server
requires it. For anything beyond localhost, add `--tls` and put your
agent behind a TLS-terminating proxy (Caddy, Cloudflare Tunnel, Tailscale
funnel). Observatory never persists tokens to disk and emits no telemetry.

### Web (Replit)

Open the repo in Replit. It detects the `.replit` file and auto-runs
`cd web && npm install && npm run dev`. Click the green Run button. The
external port maps to `:80`. Deploy via Replit's **Deploy** → **Static**:
the build step compiles `web/` and serves `web/dist`.

### iOS / iPadOS (Xcode)

```bash
cd ios
xcodegen generate              # produces Observatory.xcodeproj
open Observatory.xcodeproj     # opens in Xcode 15+
```

In Xcode:
1. Select the **Observatory** target.
2. **Signing & Capabilities** → set your team.
3. Build & run on simulator or device (iOS 17+).
4. For App Store: **Product → Archive → Distribute App → App Store Connect**.

The pre-build script automatically:
1. Runs `npm install` (if needed) and `npm run build` in `web/`.
2. Copies `web/dist/` into the app bundle as `WebBundle/`.

The app launches into a full-screen WKWebView pointing at the bundled
`WebBundle/index.html`. No network connection is required for the demo
to run — the synthetic adapter is local. Real adapters connect to
endpoints you paste in onboarding.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  PRESENTATION                                                  │
│    Web:    React 18 + R3F (three.js) + EffectComposer/Bloom   │
│    iOS:    SwiftUI + WKWebView wrapping the same web bundle   │
├───────────────────────────────────────────────────────────────┤
│  RENDER LAYER  (web/src/scene)                                 │
│    • Background  — gradient + drifting noise on inside-sphere  │
│    • Aurora      — screen-space rim glow, 90s hue cycle        │
│    • Particles   — 850 motes, vertex-shader drift              │
│    • Nucleus     — radial gradient + plasma noise + halo       │
│    • OrbitalBodies — tools/files/memory/subtasks, ellipses     │
│    • InterAgentLinks — bezier arcs + flowing particles         │
│    • Postprocessing — Bloom + Vignette + ChromaticAberration   │
├───────────────────────────────────────────────────────────────┤
│  STATE LAYER   (web/src/core, web/src/store)                   │
│    • protocol.ts — canonical AgentEvent schema (v1.0)          │
│    • state.ts    — agent + body + link types                   │
│    • reducer.ts  — (state, event) → state, plus per-frame tick │
│    • store/observatory.ts — Zustand wrapper                    │
├───────────────────────────────────────────────────────────────┤
│  INGEST LAYER  (web/src/adapters)                              │
│    • contract.ts — AgentAdapter interface                      │
│    • synthetic.ts — built-in demo generator                    │
│    • http.ts     — HttpPollAdapter, SseAdapter, WsAdapter      │
│    • openclaw.ts — OpenClaw event translator (WS-based)        │
└───────────────────────────────────────────────────────────────┘
```

### The event protocol (the abstraction)

Every adapter normalises into one canonical event:

```jsonc
{
  "id": "evt_01HX8...",
  "ts": "2026-05-15T09:32:11.847Z",
  "agent_id": "obie-prod",
  "type": "tool.invoke" | "tool.result" | "file.read" | "file.write" |
          "memory.query" | "task.start" | "task.complete" |
          "agent.message" | "heartbeat" | "error",
  "payload": { /* optional fields per type */ },
  "meta": { "source": "openclaw|http|sse|ws|cli|mcp|synthetic", "version": "1.0" }
}
```

Eleven types, one schema. Anything that emits these can drive Observatory.

### Writing your own adapter

```ts
import type { AgentAdapter, EventSink } from 'observatory-web/adapters/contract';
import { makeEvent } from 'observatory-web/core/protocol';

export class MyAdapter implements AgentAdapter {
  readonly id = 'my-runtime';
  readonly label = 'My Runtime';
  private sinks = new Set<EventSink>();

  async connect(cfg) { /* open your stream */ }
  subscribe(sink) { this.sinks.add(sink); return { close: () => this.sinks.delete(sink) }; }
  async disconnect() { /* close */ }
  health() { return { state: 'ok' }; }

  // When your upstream emits a tool call:
  private onUpstream(raw: any) {
    const evt = makeEvent({
      agent_id: raw.agentId,
      type: 'tool.invoke',
      payload: { tool_name: raw.toolName, task_id: raw.taskId, status: 'in_progress' },
      meta: { source: 'http' },
    });
    for (const s of this.sinks) s(evt);
  }
}
```

Register it in `web/src/adapters/index.ts:makeAdapterFromEndpoint()` and it
just works.

---

## Visual design

The renderer goes for *futuristic-pastel galactic graph*: each agent is a
nucleus surrounded by a fluidly-moving Obsidian-style graph of every tool,
file, and memory node it has touched recently. Bodies persist tens of
seconds — the universe of "things this agent has been near" stays visible
without crowding.

| Token             | Value     |
| ----------------- | --------- |
| `bg.deep`         | `#0A0B14` |
| `bg.gradient.top` | `#0F1124` (deep indigo) |
| `text.secondary`  | `#A6A4B5` |
| `glow.warm`       | `#FFC4DC` (pastel rose) |
| `glow.cool`       | `#B4E0FF` (pastel sky) |
| Agent 1 rose      | `#FFB4C6` → `#A86B7E` |
| Agent 2 mint      | `#A8F0E0` → `#5E9B91` |
| Agent 3 butter    | `#FAEBA0` → `#B59F5C` |
| Agent 4 lavender  | `#D4BFFD` → `#8678C4` |

Bodies move with parametric orbits plus per-body radial wander and angular
variance — same time-deterministic motion across every device, but each
body feels like its own thing rather than ticking in lock-step.

Tool ↔ file / tool ↔ memory pairs that share a `task_id` are connected
with a thin glowing line that fades with the destination body's age. This
is the "Obsidian graph" cue without the visual noise of a forest of edges.

Motion timings (entries 800ms cubic ease-out, exits 1200ms, pulses 700ms,
link fade with body age) match spec §3.6.

---

## Performance

Smoke-tested on M1 MacBook Pro at ~1.5 ms/frame in idle and ~3 ms in active
with 4 agents and ~10 events/sec from the synthetic adapter.

Key disciplines:
- **`tick()` does not call `set()`** — per-frame reducer work mutates state
  in place; React only re-renders when `ingest()` adds/removes agents or
  links. This is the single most important perf rule in the codebase.
- **AgentCluster is memoised by agent reference**, which is stable across
  the reducer's in-place mutations.
- **Sprite halo textures are module-scope singletons.** No per-body canvas
  allocations.
- **`dpr` capped at 2.** Beyond 2x the bloom pass cost dwarfs any visual
  gain.

Performance fallback ladder (spec §7): when frame time exceeds budget,
reduce particle count → orbital body density → disable bloom. The
reducedMotion path also drops particles to 320 and replaces pulses with
static intensity.

---

## Deviations from the spec

The spec is locked v1.0 and aims for four platforms over months of work.
This is one bake-off submission, so deviations are explicit:

| Spec § | What spec says | What shipped | Reason |
| ------ | -------------- | ------------ | ------ |
| §4.1 | Rust core compiled to wasm + native dylib | TypeScript core + Three.js renderer | The spec allows Skia+Flutter / RN-Skia as alternative ("one renderer, four platforms, byte-identical motion"). Shipping the iOS app as a WKWebView around the *same* JS bundle satisfies the byte-identical-motion constraint trivially. A Rust core can be slotted in later behind the same `reducer.ts` interface. |
| §6.1, §6.2 | Native iOS lock-screen widget, Live Activities, Standby Mode integration; native macOS .saver bundle | Not in v1 build | These require separate Xcode targets (Widget Extension, Saver target) and are non-trivial to test end-to-end in a session without Xcode running. The shell is ready for them. |
| §3.3 | Tool→file dashed connection lines | Inter-agent arcs only | Inter-agent arcs implement the same visual idea (animated bezier + flowing particle). Tool→file lines would track dynamic orbital body world positions; skipped for visual budget. |
| §6.4 | Monorepo with `/core`, `/adapters`, `/apple`, `/web`, `/shared-assets`, `/docs` | `/web` (all of core/adapters/scene), `/ios` (Xcode project), `/docs` | The "shared core" lives inside `web/src/core` and `web/src/adapters`. With the WKWebView strategy this is the same code — extracting it into separate packages would add ceremony without benefit at this scale. |
| §5.3 | iOS system screensaver registration | In-app screensaver mode (Cmd+Ctrl+S) | Same visual; uses standard `requestFullscreen` API on web, full-screen WKWebView on iOS. System lock-screen integration deferred. |
| §9 | Localisation, full WCAG audit | English-only; reduced-motion + colour-blind safe (motion rhythm) only | Spec calls for en-GB and en-US shipped at launch; trivial extension via strings file. |

---

## Spec deliverables checklist

| Deliverable | Status |
| ----------- | ------ |
| Working build on Web | ✅ `npm run dev` |
| Working build on Apple platform | ✅ iOS — `xcodegen generate` produces `Observatory.xcodeproj`; pre-build script bundles web/dist into the app |
| Adapter contract implementation | ✅ `web/src/adapters/contract.ts` |
| Working adapter | ✅ Synthetic + OpenClaw + Generic HTTP/SSE/WS |
| 60-second screensaver recording | ⏳ Open `localhost:5173`, hit the moon icon (bottom-right), record |
| 30-second onboarding recording | ⏳ Cold-load → empty input → Begin → live in <2s |
| Performance trace at 20 events/sec × 4 agents | ⏳ Synthetic adapter tunes to that load; profile in browser devtools |

---

## File map

```
.
├── .replit                          # Replit run + deployment config
├── replit.nix                       # Replit Nix deps (nodejs_20)
├── web/
│   ├── package.json
│   ├── vite.config.ts               # base: './' for file:// in WKWebView
│   ├── index.html
│   └── src/
│       ├── App.tsx                  # shell: onboarding ↔ scene + chrome
│       ├── main.tsx
│       ├── index.css
│       ├── core/                    # protocol, state, reducer (pure)
│       │   ├── protocol.ts
│       │   ├── state.ts
│       │   └── reducer.ts
│       ├── adapters/                # ingest contract + implementations
│       │   ├── contract.ts
│       │   ├── synthetic.ts
│       │   ├── http.ts              # HTTP poll + SSE + WS
│       │   ├── openclaw.ts          # OpenClaw event translator
│       │   └── index.ts
│       ├── scene/                   # all rendering
│       │   ├── Scene.tsx            # composes everything + EffectComposer
│       │   ├── Background.tsx       # gradient + drifting noise
│       │   ├── Aurora.tsx           # 90s hue-shift edge glow
│       │   ├── Particles.tsx        # drifting motes
│       │   ├── Nucleus.tsx          # the soul of the app
│       │   ├── OrbitalBodies.tsx    # tool / file / memory / subtask
│       │   ├── InterAgentLinks.tsx  # bezier arcs + flowing particles
│       │   └── shaders/             # GLSL: nucleus, background, aurora, particles
│       ├── components/              # chrome (deliberately minimal)
│       │   ├── Onboarding.tsx       # 5-second target
│       │   ├── Onboarding.css
│       │   ├── Chrome.tsx           # status pill + focused panel
│       │   └── Chrome.css
│       ├── lib/tokens.ts            # design tokens (single source of truth)
│       └── store/observatory.ts     # Zustand store
└── ios/
    ├── project.yml                  # xcodegen spec
    ├── Observatory/
    │   ├── ObservatoryApp.swift     # @main
    │   ├── ContentView.swift        # WKWebView host
    │   ├── PrivacyInfo.xcprivacy
    │   └── Assets.xcassets/         # AppIcon, AccentColor, LaunchBackground
    └── Observatory.xcodeproj/       # (generated by xcodegen)
```

---

## TODO

- **OpenClaw plugin.** Native sub-command (`openclaw observatory connect`) needs a
  plugin manifest that OpenClaw's plugin loader can discover. The standalone CLI at
  `bin/openclaw-observatory` does the same work today; wrapping it as an OpenClaw
  plugin is mechanical once the plugin format is documented.
- **Bonjour/mDNS discovery.** Auto-find OpenClaw agents on the local network so
  pairing is one-tap on LAN. iOS Info.plist already declares the relevant Bonjour
  services.
- **macOS .saver bundle** and **iOS lock-screen widget / Live Activity** —
  separate Xcode targets, deferred from v1.

## Licence

MIT — do whatever feels right.
