import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Quaternion,
  SpriteMaterial,
  Vector3,
} from 'three';
import {
  BODY_SIZES,
  ORBIT_ECCENTRICITY,
  ORBIT_RADII,
  TIMINGS,
  agentPalette,
  clamp,
  easeOutCubic,
} from '../lib/tokens';
import type { AgentState, BodyClass, OrbitalBody } from '../core/state';

/* ----------------------- pre-computed assets ----------------------- */

/** Shared glow texture for all orbital body halos. Created once at module load. */
const GLOW_TEXTURE: CanvasTexture = (() => {
  if (typeof document === 'undefined') return null as unknown as CanvasTexture;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.42)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.10)');
  g.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
})();

/* ----------------------- math helpers ----------------------- */

function frac(x: number) { return x - Math.floor(x); }
function classIndex(cls: BodyClass): number {
  return cls === 'subtask' ? 0 : cls === 'tool' ? 1 : cls === 'file' ? 2 : 3;
}

interface RingOrientation { tiltX: number; tiltZ: number; phase: number; eccentricityB: number; }

function ringOrientation(agentIndex: number, cls: BodyClass): RingOrientation {
  const seed = (agentIndex + 1) * 17 + classIndex(cls) * 31;
  const r1 = frac(Math.sin(seed * 12.9898) * 43758.5453);
  const r2 = frac(Math.sin(seed * 78.233) * 43758.5453);
  const r3 = frac(Math.sin(seed * 39.346) * 43758.5453);
  const tiltX = (r1 - 0.5) * 0.6;
  const tiltZ = (r2 - 0.5) * 0.4;
  const phase = r3 * Math.PI * 2;
  const eccentricityB = 1.0 - ORBIT_ECCENTRICITY[cls];
  return { tiltX, tiltZ, phase, eccentricityB };
}

function orbitalPeriodSec(cls: BodyClass): number {
  switch (cls) {
    case 'subtask': return 7;
    case 'tool': return 12;
    case 'file': return 22;
    case 'memory': return 34;
  }
}

/* ----------------------- components ----------------------- */

interface OrbitalBodiesProps {
  agent: AgentState;
  reducedMotion?: boolean;
}

export function OrbitalBodies({ agent, reducedMotion }: OrbitalBodiesProps) {
  const palette = useMemo(() => agentPalette(agent.colorIndex), [agent.colorIndex]);
  const center = useMemo(
    () => new Vector3(agent.position?.x ?? 0, agent.position?.y ?? 0, agent.position?.z ?? 0),
    [agent.position?.x, agent.position?.y, agent.position?.z],
  );

  // Group by class with stable order
  const byClass = useMemo(() => {
    const groups: Record<BodyClass, OrbitalBody[]> = { subtask: [], tool: [], file: [], memory: [] };
    for (const b of agent.bodies) groups[b.class].push(b);
    for (const k of Object.keys(groups) as BodyClass[]) {
      groups[k].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    }
    return groups;
  }, [agent.bodies]);

  const orientations = useMemo(() => ({
    subtask: ringOrientation(agent.colorIndex, 'subtask'),
    tool: ringOrientation(agent.colorIndex, 'tool'),
    file: ringOrientation(agent.colorIndex, 'file'),
    memory: ringOrientation(agent.colorIndex, 'memory'),
  }), [agent.colorIndex]);

  return (
    <group position={center}>
      {(['subtask', 'tool', 'file', 'memory'] as BodyClass[]).map((cls) => (
        <OrbitalRing
          key={cls}
          cls={cls}
          bodies={byClass[cls]}
          orientation={orientations[cls]}
          palette={palette}
          reducedMotion={!!reducedMotion}
        />
      ))}
    </group>
  );
}

interface RingProps {
  cls: BodyClass;
  bodies: OrbitalBody[];
  orientation: RingOrientation;
  palette: ReturnType<typeof agentPalette>;
  reducedMotion: boolean;
}

function OrbitalRing({ cls, bodies, orientation, palette, reducedMotion }: RingProps) {
  const groupRef = useRef<Group>(null);

  const quat = useMemo(
    () =>
      new Quaternion()
        .setFromAxisAngle(new Vector3(1, 0, 0), orientation.tiltX)
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), orientation.tiltZ)),
    [orientation],
  );
  const a = ORBIT_RADII[cls];
  const b = a * orientation.eccentricityB;
  const period = orbitalPeriodSec(cls);

  // Reusable scratch vec to avoid allocations in the frame loop
  const scratch = useMemo(() => new Vector3(), []);

  useFrame((s, delta) => {
    if (!groupRef.current) return;
    const time = s.clock.getElapsedTime();
    const now = performance.now();
    const count = bodies.length;
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const body = bodies[i];
      const child = groupRef.current.children[i] as Group | undefined;
      if (!child) continue;

      const baseAngle = orientation.phase + (i / count) * Math.PI * 2;
      const direction = (cls === 'tool' || cls === 'memory') ? 1 : -1;
      const angle = reducedMotion ? baseAngle : baseAngle + direction * (time / period) * Math.PI * 2;

      // Elliptical position
      const localX = a * Math.cos(angle);
      const localZ = b * Math.sin(angle);
      scratch.set(localX, 0, localZ).applyQuaternion(quat);

      // Enter / exit easing
      const ageMs = now - body.createdAt;
      const enterT = clamp(ageMs / TIMINGS.enterMs, 0, 1);
      const enterEase = easeOutCubic(enterT);
      let exitFactor = 1;
      if (body.retiringAt) {
        const exitMs = now - body.retiringAt;
        const exitT = clamp(exitMs / TIMINGS.exitMs, 0, 1);
        exitFactor = 1 - easeOutCubic(exitT);
      }

      // Slide in from outside the orbit
      const outerPush = (1 - enterEase) * 0.9;
      const dirLen = Math.sqrt(scratch.x * scratch.x + scratch.y * scratch.y + scratch.z * scratch.z) || 1;
      const dx = (scratch.x / dirLen) * outerPush;
      const dy = (scratch.y / dirLen) * outerPush;
      const dz = (scratch.z / dirLen) * outerPush;
      child.position.set(scratch.x + dx, scratch.y + dy, scratch.z + dz);

      const enterScale = 0.45 + 0.55 * enterEase;
      const size = BODY_SIZES[cls] * enterScale * exitFactor;
      child.scale.setScalar(size);

      // Self-rotation for life
      if (!reducedMotion) {
        child.rotation.x += delta * 0.45;
        child.rotation.y += delta * 0.7;
      }
    }
  });

  return (
    <group ref={groupRef}>
      {bodies.map((b) => (
        <OrbitalBodyMesh key={b.id} body={b} cls={cls} palette={palette} />
      ))}
    </group>
  );
}

interface BodyMeshProps {
  body: OrbitalBody;
  cls: BodyClass;
  palette: ReturnType<typeof agentPalette>;
}

function OrbitalBodyMesh({ body, cls, palette }: BodyMeshProps) {
  const error = body.status === 'error';
  const inProgress = body.status === 'in_progress';

  const haloColor = useMemo(() => (error ? new Color('#ff5050') : palette.core.clone()), [error, palette.core]);
  const haloMat = useMemo(() => new SpriteMaterial({
    map: GLOW_TEXTURE,
    color: haloColor,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.55,
  }), [haloColor]);

  const coreHex = palette.hex.core;
  const rimHex = palette.hex.rim;

  return (
    <group>
      {cls === 'tool' && (
        <mesh>
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color={error ? '#ff5050' : coreHex}
            emissive={error ? new Color('#ff5050') : palette.core}
            emissiveIntensity={inProgress ? 1.6 : 0.9}
            roughness={0.35}
            metalness={0.55}
            toneMapped={false}
          />
        </mesh>
      )}
      {cls === 'file' && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1, 1, 0.18, 36]} />
          <meshStandardMaterial
            color={rimHex}
            emissive={palette.core}
            emissiveIntensity={0.6}
            roughness={0.25}
            metalness={0.8}
            toneMapped={false}
            side={DoubleSide}
          />
        </mesh>
      )}
      {cls === 'memory' && (
        <mesh>
          <sphereGeometry args={[1, 24, 24]} />
          <meshStandardMaterial
            color={coreHex}
            emissive={palette.core}
            emissiveIntensity={0.7}
            transparent
            opacity={0.55}
            roughness={0.2}
            metalness={0.1}
            toneMapped={false}
          />
        </mesh>
      )}
      {cls === 'subtask' && (
        <mesh>
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial color={error ? '#ff8080' : coreHex} toneMapped={false} />
        </mesh>
      )}
      <sprite scale={[6, 6, 1]} material={haloMat} />
    </group>
  );
}
