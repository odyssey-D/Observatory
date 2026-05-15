/**
 * Design tokens — the single source of truth for colour, motion, and sizing.
 * Every value here is referenced from the spec.
 */

import { Color } from 'three';

export const CHROME = {
  bgDeep: '#08090C',
  bgTop: '#0E1015',
  bgBottom: '#050608',
  textPrimary: '#F5F5F7',
  textSecondary: '#A1A1AA',
  glowWarm: '#FFB37C',
  glowCool: '#7CC4FF',
  divider: '#1F2024',
};

/** Per-agent palette as core → rim pairs.  After index 4, golden-ratio hue rotation. */
const AGENT_PAIRS: Array<[string, string]> = [
  ['#FF6B6B', '#C44545'], // coral
  ['#4ECDC4', '#2A9D96'], // teal
  ['#FFD93D', '#D4A700'], // amber
  ['#A78BFA', '#7C5FE6'], // violet
];

const GOLDEN_HUE_STEP = 137.50776; // golden-ratio hue rotation in degrees

export function agentPalette(index: number): { core: Color; rim: Color; hex: { core: string; rim: string } } {
  if (index < AGENT_PAIRS.length) {
    const [core, rim] = AGENT_PAIRS[index];
    return { core: new Color(core), rim: new Color(rim), hex: { core, rim } };
  }
  // Golden-ratio hue rotation from a seed
  const seedH = 4 * GOLDEN_HUE_STEP; // start where pair 4 would have been
  const h = ((seedH + (index - AGENT_PAIRS.length) * GOLDEN_HUE_STEP) % 360) / 360;
  const core = new Color().setHSL(h, 0.72, 0.66);
  const rim = new Color().setHSL(h, 0.78, 0.40);
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

/** Orbit radii by body class. */
export const ORBIT_RADII = {
  subtask: 0.55,
  tool: 1.10,
  file: 1.85,
  memory: 2.65,
} as const;

/** Orbit eccentricity (0 = circle). */
export const ORBIT_ECCENTRICITY = {
  subtask: 0.12,
  tool: 0.18,
  file: 0.24,
  memory: 0.30,
} as const;

/** Body sizes. */
export const BODY_SIZES = {
  subtask: 0.05,
  tool: 0.13,
  file: 0.16,
  memory: 0.17,
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
