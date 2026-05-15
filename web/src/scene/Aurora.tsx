import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, ShaderMaterial } from 'three';
import { auroraFragment, auroraVertex } from './shaders/aurora';
import { CHROME } from '../lib/tokens';
import { computeActivity } from './Background';

/** Screen-space aurora ring, additive blend. */
export function Aurora() {
  const matRef = useRef<ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uActivity: { value: 0 },
    uWarm: { value: new Color(CHROME.glowWarm) },
    uCool: { value: new Color(CHROME.glowCool) },
  }), []);

  useFrame((s) => {
    uniforms.uTime.value = s.clock.getElapsedTime();
    const activity = computeActivity();
    uniforms.uActivity.value += (activity - uniforms.uActivity.value) * 0.05;
  });

  return (
    <mesh frustumCulled={false} renderOrder={999}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={auroraVertex}
        fragmentShader={auroraFragment}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
        transparent
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}
