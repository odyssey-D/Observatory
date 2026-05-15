/**
 * Background — deep gradient with very slow drifting noise.
 * Renders behind everything as a large dome / sphere from the inside.
 */

export const backgroundVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const backgroundFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  uniform float uTime;
  uniform vec3 uTopColor;
  uniform vec3 uBottomColor;
  uniform vec3 uAccent;
  uniform float uActivity;  // 0..1

  // 2D simplex noise — small enough to inline
  vec3 permute(vec3 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute( i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    // Vertical gradient
    float t = clamp((vUv.y * 1.05) - 0.025, 0.0, 1.0);
    vec3 base = mix(uBottomColor, uTopColor, smoothstep(0.0, 1.0, t));

    // Volumetric-ish noise drift
    float n1 = snoise(vUv * 2.4 + vec2(uTime * 0.012, uTime * 0.008));
    float n2 = snoise(vUv * 4.7 - vec2(uTime * 0.006, uTime * 0.018));
    float n = (n1 * 0.6 + n2 * 0.4) * 0.5 + 0.5;
    base += vec3(0.020, 0.026, 0.038) * (n - 0.4);

    // A *very* faint accent ribbon across the upper half
    float band = smoothstep(0.45, 0.85, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
    base += uAccent * 0.018 * band * (0.6 + 0.4 * sin(uTime * 0.1 + vUv.x * 6.28));

    // Activity raises the floor very slightly
    base += vec3(0.006, 0.008, 0.012) * uActivity;

    gl_FragColor = vec4(base, 1.0);
  }
`;
