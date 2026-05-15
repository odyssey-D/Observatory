import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial } from 'three';
import { particleFragment, particleVertex } from './shaders/particles';

/** Slow-drifting motes that fill the dead space without ever calling attention. */
export function Particles({ count = 850 }: { count?: number }) {
  const ref = useRef<Points>(null);

  const { geometry, uniforms } = useMemo(() => {
    const g = new BufferGeometry();
    const pos = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Sphere of radius ~18 around origin, hollow-ish
      const r = 6 + Math.random() * 18;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55; // flatter on Y
      pos[i * 3 + 2] = r * Math.cos(phi);
      sizes[i] = 0.6 + Math.random() * 2.4;
      seeds[i] = Math.random();
    }
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aSize', new BufferAttribute(sizes, 1));
    g.setAttribute('aSeed', new BufferAttribute(seeds, 1));

    const u = {
      uTime: { value: 0 },
      uColor: { value: new Color('#9CB6D8') },
    };
    return { geometry: g, uniforms: u };
  }, [count]);

  useFrame((s) => {
    uniforms.uTime.value = s.clock.getElapsedTime();
  });

  const material = useMemo(() => new ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  }), [uniforms]);

  return <points ref={ref} geometry={geometry} material={material} />;
}
