/**
 * Particle drift — slow stars / solar-wind motes in background.
 */

export const particleVertex = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec3 p = position;
    // Slow drift, individual phase per particle
    p.x += sin(uTime * 0.07 + aSeed * 6.283) * 0.18;
    p.y += cos(uTime * 0.05 + aSeed * 6.283 * 1.7) * 0.12;
    p.z += sin(uTime * 0.04 + aSeed * 6.283 * 2.3) * 0.20;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    // Size attenuation with distance
    gl_PointSize = aSize * (320.0 / -mv.z);
    // Twinkle
    vAlpha = 0.35 + 0.5 * (0.5 + 0.5 * sin(uTime * 0.9 + aSeed * 31.4));
    vSeed = aSeed;
  }
`;

export const particleFragment = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  varying float vSeed;
  uniform vec3 uColor;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    // Slight tint per particle
    vec3 col = uColor * (0.85 + 0.15 * vSeed);
    gl_FragColor = vec4(col, a * vAlpha * 0.75);
  }
`;
