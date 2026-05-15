/**
 * Aurora — a soft glow around the edges of the screen that hue-shifts on a 90s cycle.
 * Drawn as a fullscreen quad in screen space, additive blend.
 */

export const auroraVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const auroraFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uActivity; // 0..1
  uniform vec3 uWarm;
  uniform vec3 uCool;

  void main() {
    // Distance from centre as elliptical
    vec2 p = vUv - vec2(0.5);
    p.x *= 1.6;
    float d = length(p);

    // Edge ring
    float ring = smoothstep(0.45, 0.92, d) * (1.0 - smoothstep(0.92, 1.15, d));

    // Hue shift along a 90s cycle
    float phase = sin(uTime * (6.2831853 / 90.0));      // -1..1
    float t = phase * 0.5 + 0.5;                       // 0..1
    vec3 hue = mix(uCool, uWarm, t);

    // Angular sweep: two soft poles drifting around the rim
    float ang = atan(p.y, p.x);
    float sweep1 = 0.5 + 0.5 * sin(ang * 1.0 + uTime * 0.07);
    float sweep2 = 0.5 + 0.5 * sin(ang * 2.0 - uTime * 0.05 + 1.4);
    float sweep = sweep1 * 0.65 + sweep2 * 0.35;

    float intensity = ring * (0.55 + 0.45 * sweep);
    intensity *= (0.45 + uActivity * 0.55);

    vec3 col = hue * intensity;

    // Push to additive; alpha doesn't matter for additive blend, keep at intensity for safety
    gl_FragColor = vec4(col, intensity);
  }
`;
