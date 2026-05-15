import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, Group, Mesh, ShaderMaterial, SpriteMaterial, Texture, CanvasTexture } from 'three';
import { nucleusFragment, nucleusVertex } from './shaders/nucleus';
import { agentBreathPeriod, agentPalette, agentRotationSpeed, NUCLEUS_RADIUS, TIMINGS } from '../lib/tokens';
import type { AgentState } from '../core/state';

interface NucleusProps {
  agent: AgentState;
  /** Whether this agent is currently focused (other agents will dim). */
  focused?: boolean;
  /** Whether some other agent is focused (we should dim). */
  otherFocused?: boolean;
  /** Reduced-motion: disable rotation, replace pulses with static intensity. */
  reducedMotion?: boolean;
  onPointerOver?: () => void;
  onPointerOut?: () => void;
  onClick?: () => void;
}

/** A soft-edged sphere with radial gradient core->rim, slow rotation, breathe + pulse. */
export function Nucleus({ agent, focused, otherFocused, reducedMotion, onPointerOver, onPointerOut, onClick }: NucleusProps) {
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);
  const haloRef = useRef<Mesh>(null);
  const matRef = useRef<ShaderMaterial>(null);

  const palette = useMemo(() => agentPalette(agent.colorIndex), [agent.colorIndex]);
  const rotSpeed = useMemo(() => agentRotationSpeed(agent.colorIndex), [agent.colorIndex]);
  const breathPeriod = useMemo(() => agentBreathPeriod(agent.colorIndex), [agent.colorIndex]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uCoreColor: { value: palette.core.clone() },
    uRimColor: { value: palette.rim.clone() },
    uPulse: { value: 0 },
    uBreath: { value: 0 },
    uErrorMix: { value: 0 },
  }), [palette]);

  const haloMaterial = useMemo(() => {
    // Soft halo around the nucleus — bloom does most of the work but a sprite gives it body
    const tex = createRadialTexture();
    const mat = new SpriteMaterial({
      map: tex,
      color: palette.core,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.0,
    });
    return mat;
  }, [palette]);

  // The renderer animation tick.
  useFrame((s, delta) => {
    const t = s.clock.getElapsedTime();
    uniforms.uTime.value = t;

    if (!groupRef.current || !meshRef.current) return;

    const now = performance.now();

    // Breath
    const breath = Math.sin(((t % breathPeriod) / breathPeriod) * Math.PI * 2);
    uniforms.uBreath.value = reducedMotion ? 0 : breath;

    // Pulse decay — most recent pulses drive uPulse
    let pulseMag = 0;
    for (const p of agent.pulses) {
      const age = now - p.at;
      if (age < TIMINGS.pulseMs) {
        // exp decay
        const k = 1 - age / TIMINGS.pulseMs;
        pulseMag = Math.max(pulseMag, k * k);
      }
    }
    uniforms.uPulse.value = reducedMotion ? Math.min(pulseMag * 0.6, 0.4) : pulseMag;

    // Error tint
    const target = agent.status === 'error' ? 1 : 0;
    uniforms.uErrorMix.value += (target - uniforms.uErrorMix.value) * 0.1;

    // Rotation
    if (!reducedMotion) {
      const activityFactor = agent.status === 'active' ? 1.7 : 1.0;
      meshRef.current.rotation.y += delta * rotSpeed * activityFactor;
      meshRef.current.rotation.x += delta * rotSpeed * 0.4 * activityFactor;
    }

    // Scale modulation — pulse adds a small swell on top of breath
    const breathScale = 1.0 + (reducedMotion ? 0 : breath * 0.025);
    const pulseScale = 1.0 + pulseMag * 0.06;
    const focusScale = focused ? 1.18 : (otherFocused ? 0.78 : 1.0);
    const radius = NUCLEUS_RADIUS * breathScale * pulseScale * focusScale;
    groupRef.current.scale.setScalar(radius);

    // Halo follows pulse intensity + activity
    if (haloRef.current) {
      const haloMat = haloRef.current.material as SpriteMaterial;
      const target = (agent.status === 'active' ? 0.55 : 0.32) + pulseMag * 0.55;
      haloMat.opacity += (target - haloMat.opacity) * 0.12;
      // Halo color tinges toward error
      haloMat.color.copy(palette.core).lerp(new Color('#ff5050'), uniforms.uErrorMix.value);
    }

    // Dim during disconnected
    if (matRef.current) {
      const targetDim = agent.status === 'disconnected' ? 0.35 : (otherFocused ? 0.45 : 1.0);
      // Apply via material color scale via uCoreColor — we instead drive a separate property below
      (matRef.current as ShaderMaterial & { __dim?: number }).__dim = targetDim;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[agent.position?.x ?? 0, agent.position?.y ?? 0, agent.position?.z ?? 0]}
      onPointerOver={(e) => { e.stopPropagation(); onPointerOver?.(); }}
      onPointerOut={(e) => { e.stopPropagation(); onPointerOut?.(); }}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
    >
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={nucleusVertex}
          fragmentShader={nucleusFragment}
          uniforms={uniforms}
          transparent
          depthWrite
          toneMapped={false}
        />
      </mesh>
      {/* Halo sprite */}
      {/* @ts-expect-error R3F overrides sprite typing for material prop */}
      <sprite ref={haloRef} scale={[5.2, 5.2, 1]} material={haloMaterial} />
    </group>
  );
}

/** Generate a soft radial gradient texture once for halo sprites. */
function createRadialTexture(): Texture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.18)');
  g.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}
