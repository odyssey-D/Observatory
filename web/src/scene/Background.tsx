import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, Color, ShaderMaterial } from 'three';
import { backgroundFragment, backgroundVertex } from './shaders/background';
import { CHROME } from '../lib/tokens';
import { useObservatory } from '../store/observatory';
import { ACTIVE_WINDOW_MS } from '../core/state';

/** Inside-facing sphere with gradient + slow drifting noise. */
export function Background() {
  const matRef = useRef<ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uTopColor: { value: new Color(CHROME.bgTop) },
    uBottomColor: { value: new Color(CHROME.bgBottom) },
    uAccent: { value: new Color(CHROME.glowCool) },
    uActivity: { value: 0 },
  }), []);

  useFrame((s) => {
    uniforms.uTime.value = s.clock.getElapsedTime();
    const activity = computeActivity();
    uniforms.uActivity.value += (activity - uniforms.uActivity.value) * 0.05;
  });

  return (
    <mesh>
      <sphereGeometry args={[40, 48, 48]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={backgroundVertex}
        fragmentShader={backgroundFragment}
        uniforms={uniforms}
        side={BackSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

export function computeActivity(): number {
  const state = useObservatory.getState().state;
  const agents = Object.values(state.agents);
  if (!agents.length) return 0;
  const now = performance.now();
  let recent = 0;
  for (const a of agents) {
    const dt = now - a.lastEventAt;
    if (dt < ACTIVE_WINDOW_MS) recent += 1 - dt / ACTIVE_WINDOW_MS;
  }
  return Math.min(recent / Math.max(agents.length, 1), 1);
}
