/**
 * Design tokens — the single source of truth for colour, motion, and sizing.
 * Every value here is referenced from the spec.
 */

import { Color } from 'three';

export const CHROME = {
  bgDeep: '#0A0B14',
  bgTop: '#0F1124',
  bgBottom: '#06070F',
  textPrimary: '#F2EEF7',
  textSecondary: '#A6A4B5',
  glowWarm: '#FFC4DC',   // pastel rose
  glowCool: '#B4E0FF',   // pastel sky
  divider: '#1B1D2A',
};

/** Per-agent palette — futuristic pastels.
 *  Core: high-L pastel.  Rim: same hue, mid-L, slightly desaturated for depth.
 *  After index 4, golden-ratio hue rotation from the seed. */
const AGENT_PAIRS: Array<[string, string]> = [
  ['#FFB4C6', '#A86B7E'], // rose
  ['#A8F0E0', '#5E9B91'], // mint
  ['#FAEBA0', '#B59F5C'], // butter
  ['#D4BFFD', '#8678C4'], // lavender
];

const GOLDEN_HUE_STEP = 137.50776; // golden-ratio hue rotation in degrees

export function agentPalette(index: number): { core: Color; rim: Color; hex: { core: string; rim: string } } {
  if (index < AGENT_PAIRS.length) {
    const [core, rim] = AGENT_PAIRS[index];
    return { core: new Color(core), rim: new Color(rim), hex: { core, rim } };
  }
  // Golden-ratio hue rotation from a seed.  Pastel envelope (high L, mid S).
  const seedH = 4 * GOLDEN_HUE_STEP;
  const h = ((seedH + (index - AGENT_PAIRS.length) * GOLDEN_HUE_STEP) % 360) / 360;
  const core = new Color().setHSL(h, 0.55, 0.78);
  const rim = new Color().setHSL(h, 0.50, 0.46);
  return { core, rim, hex: { core: `#${core.getHexString()}`, rim: `#${rim.getHexString()}` } };
}

/** Per-agent rotation speed (radians/sec). Each agent feels like a distinct character. */
export function agentRotationSpeed(index: number): number {
  // 30s/rev when idle => 2π/30; we let bake-in slight variance per agent
  const base = (2 * Math.PI) / 30;
  return base * (0.85 + ((index * 0.137) % 1) * 0.4);
}

/** Per-agent idle breath rhythm (period seconds). */
export function agentBreathPeriod(index: number): number {
  return 3.6 + ((index * 0.241) % 1) * 1.4; // 3.6–5.0s
}

/** Orbit radii by body class — preferred mean distance from the nucleus.
 *  Bodies wander within ±RADIAL_JITTER of this. */
export const ORBIT_RADII = {
  subtask: 0.62,
  tool: 1.20,
  file: 2.05,
  memory: 2.95,
} as const;

/** Orbit eccentricity (0 = circle). */
export const ORBIT_ECCENTRICITY = {
  subtask: 0.10,
  tool: 0.15,
  file: 0.22,
  memory: 0.28,
} as const;

/** Allowed wander either side of the preferred radius. */
export const RADIAL_JITTER = {
  subtask: 0.10,
  tool: 0.22,
  file: 0.32,
  memory: 0.40,
} as const;

/** Body sizes — smaller so the graph feels dense + readable. */
export const BODY_SIZES = {
  subtask: 0.038,
  tool: 0.095,
  file: 0.110,
  memory: 0.108,
} as const;

/** Nucleus radius at idle baseline. */
export const NUCLEUS_RADIUS = 0.46;

/** Animation timings (ms). */
export const TIMINGS = {
  enterMs: 800,
  exitMs: 1_200,
  pulseMs: 700,
  linkFadeMs: 600,
  errorTintMs: 2_000,
};

/** Easing helpers. */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function clamp(x: number, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, x));
}
