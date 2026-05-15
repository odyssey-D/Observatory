import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  LineBasicMaterial,
  Quaternion,
  SpriteMaterial,
  Vector3,
} from 'three';
import {
  BODY_SIZES,
  ORBIT_ECCENTRICITY,
  ORBIT_RADII,
  RADIAL_JITTER,
  TIMINGS,
  agentPalette,
  clamp,
  easeOutCubic,
} from '../lib/tokens';
import type { AgentState, BodyClass, OrbitalBody } from '../core/state';

/* ----------------------- pre-computed assets ----------------------- */

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
function hash(seed: number): number { return frac(Math.sin(seed * 12.9898) * 43758.5453); }
function classIndex(cls: BodyClass): number {
  return cls === 'subtask' ? 0 : cls === 'tool' ? 1 : cls === 'file' ? 2 : 3;
}

interface RingOrientation { tiltX: number; tiltZ: number; phase: number; eccentricityB: number; }

function ringOrientation(agentIndex: number, cls: BodyClass): RingOrientation {
  const seed = (agentIndex + 1) * 17 + classIndex(cls) * 31;
  const r1 = hash(seed);
  const r2 = hash(seed * 1.7);
  const r3 = hash(seed * 2.3);
  const tiltX = (r1 - 0.5) * 0.7;
  const tiltZ = (r2 - 0.5) * 0.5;
  const phase = r3 * Math.PI * 2;
  const eccentricityB = 1.0 - ORBIT_ECCENTRICITY[cls];
  return { tiltX, tiltZ, phase, eccentricityB };
}

function orbitalPeriodSec(cls: BodyClass): number {
  switch (cls) {
    case 'subtask': return 8;
    case 'tool': return 16;
    case 'file': return 28;
    case 'memory': return 42;
  }
}

/** Stable per-body parameters keyed by id.  Computed once, reused every frame. */
interface BodyParams {
  angularSpeed: number;     // radians/sec, with per-body variance
  radialAmp: number;        // radial wander amplitude
  radialFreq: number;       // radial wander frequency (Hz-ish)
  tangentialAmp: number;    // tangential micro-wander amplitude
  tangentialFreq: number;
  spinX: number;
  spinY: number;
  selfPhase: number;        // per-body phase offset
}

function paramsForBody(body: OrbitalBody): BodyParams {
  const seed = hashString(body.id);
  const cls = body.class;
  const periodVariance = 0.86 + hash(seed * 3.1) * 0.28; // 0.86..1.14
  const baseSpeed = (2 * Math.PI) / orbitalPeriodSec(cls);
  return {
    angularSpeed: baseSpeed * periodVariance,
    radialAmp: RADIAL_JITTER[cls] * (0.45 + hash(seed * 5.7) * 0.55),
    radialFreq: 0.08 + hash(seed * 7.1) * 0.10,
    tangentialAmp: 0.045 + hash(seed * 9.2) * 0.06,
    tangentialFreq: 0.10 + hash(seed * 11.3) * 0.12,
    spinX: 0.3 + hash(seed * 13.7) * 0.6,
    spinY: 0.4 + hash(seed * 17.1) * 0.6,
    selfPhase: hash(seed * 19.3) * Math.PI * 2,
  };
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = ((h * 16777619) >>> 0);
  }
  return ((h & 0xffff) / 0xffff) * 1000;
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

  // Snapshot bodies once per ingest so positions are stable refs across frames.
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

  // World positions of bodies, keyed by id — refreshed every frame by the rings,
  // and read by IntraAgentLinks to draw edges.
  const positionsRef = useRef<Map<string, Vector3>>(new Map());

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
          positionsRef={positionsRef}
        />
      ))}
      <IntraAgentLinks bodies={agent.bodies} palette={palette} positionsRef={positionsRef} />
    </group>
  );
}

interface RingProps {
  cls: BodyClass;
  bodies: OrbitalBody[];
  orientation: RingOrientation;
  palette: ReturnType<typeof agentPalette>;
  reducedMotion: boolean;
  positionsRef: React.MutableRefObject<Map<string, Vector3>>;
}

function OrbitalRing({ cls, bodies, orientation, palette, reducedMotion, positionsRef }: RingProps) {
  const groupRef = useRef<Group>(null);

  const quat = useMemo(
    () =>
      new Quaternion()
        .setFromAxisAngle(new Vector3(1, 0, 0), orientation.tiltX)
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), orientation.tiltZ)),
    [orientation],
  );
  const baseA = ORBIT_RADII[cls];
  const baseB = baseA * orientation.eccentricityB;

  const scratch = useMemo(() => new Vector3(), []);
  // Cached params per body id
  const paramsCache = useRef<Map<string, BodyParams>>(new Map());

  useFrame((s, delta) => {
    if (!groupRef.current) return;
    const time = s.clock.getElapsedTime();
    const now = performance.now();
    const count = bodies.length;
    if (count === 0) return;
    const directionSign = (cls === 'tool' || cls === 'memory') ? 1 : -1;

    for (let i = 0; i < count; i++) {
      const body = bodies[i];
      const child = groupRef.current.children[i] as Group | undefined;
      if (!child) continue;

      let p = paramsCache.current.get(body.id);
      if (!p) { p = paramsForBody(body); paramsCache.current.set(body.id, p); }

      // Base angular position: evenly spaced + per-body angular speed
      const slot = orientation.phase + (i / count) * Math.PI * 2;
      const angle = reducedMotion
        ? slot
        : slot + directionSign * p.angularSpeed * time + Math.sin(time * p.tangentialFreq + p.selfPhase) * p.tangentialAmp;

      // Radial wander — bounded.  Lets the body breathe in and out of its ring.
      const radialWander = reducedMotion ? 0 : Math.sin(time * p.radialFreq * Math.PI * 2 + p.selfPhase) * p.radialAmp;
      const a = baseA + radialWander;
      const b = baseB + radialWander * 0.8;

      const localX = a * Math.cos(angle);
      const localZ = b * Math.sin(angle);
      // Vertical drift — gentle out-of-plane bobbing
      const localY = reducedMotion ? 0 : Math.sin(time * 0.4 + p.selfPhase) * 0.04;
      scratch.set(localX, localY, localZ).applyQuaternion(quat);

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

      const outerPush = (1 - enterEase) * 0.7;
      const dirLen = Math.sqrt(scratch.x * scratch.x + scratch.y * scratch.y + scratch.z * scratch.z) || 1;
      const dx = (scratch.x / dirLen) * outerPush;
      const dy = (scratch.y / dirLen) * outerPush;
      const dz = (scratch.z / dirLen) * outerPush;

      // Smooth toward target position — damped, gives the fluid Obsidian feel
      const targetX = scratch.x + dx;
      const targetY = scratch.y + dy;
      const targetZ = scratch.z + dz;
      const k = reducedMotion ? 1 : 1 - Math.pow(0.001, delta * 3.5);
      child.position.x += (targetX - child.position.x) * k;
      child.position.y += (targetY - child.position.y) * k;
      child.position.z += (targetZ - child.position.z) * k;

      // Publish world-space position for connection lines.
      const world = positionsRef.current.get(body.id) ?? new Vector3();
      child.getWorldPosition(world);
      positionsRef.current.set(body.id, world);

      const enterScale = 0.45 + 0.55 * enterEase;
      const size = BODY_SIZES[cls] * enterScale * exitFactor;
      child.scale.setScalar(size);

      if (!reducedMotion) {
        child.rotation.x += delta * p.spinX;
        child.rotation.y += delta * p.spinY;
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

  const haloColor = useMemo(() => (error ? new Color('#FF9DB3') : palette.core.clone()), [error, palette.core]);
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
            color={error ? '#FF9DB3' : coreHex}
            emissive={error ? new Color('#FF9DB3') : palette.core}
            emissiveIntensity={inProgress ? 1.8 : 1.0}
            roughness={0.30}
            metalness={0.55}
            toneMapped={false}
          />
        </mesh>
      )}
      {cls === 'file' && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1, 1, 0.16, 36]} />
          <meshStandardMaterial
            color={rimHex}
            emissive={palette.core}
            emissiveIntensity={0.7}
            roughness={0.22}
            metalness={0.85}
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
            emissiveIntensity={0.85}
            transparent
            opacity={0.55}
            roughness={0.18}
            metalness={0.10}
            toneMapped={false}
          />
        </mesh>
      )}
      {cls === 'subtask' && (
        <mesh>
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial color={error ? '#FF9DB3' : coreHex} toneMapped={false} />
        </mesh>
      )}
      <sprite scale={[5.4, 5.4, 1]} material={haloMat} />
    </group>
  );
}

/* ----------------------- intra-agent connection lines ----------------------- */

interface LinksProps {
  bodies: OrbitalBody[];
  palette: ReturnType<typeof agentPalette>;
  positionsRef: React.MutableRefObject<Map<string, Vector3>>;
}

/** Thin glowing lines between connected bodies (tool ↔ file/memory).
 *  Reads positions from the shared positions map so the lines track the wandering nodes. */
function IntraAgentLinks({ bodies, palette, positionsRef }: LinksProps) {
  // Pairs that should be rendered.  Keyed by `${from}->${to}`.
  const pairs = useMemo(() => {
    const out: Array<{ from: string; to: string; id: string }> = [];
    for (const b of bodies) {
      if (!b.sourceBodyId) continue;
      out.push({ from: b.sourceBodyId, to: b.id, id: `${b.sourceBodyId}->${b.id}` });
    }
    return out;
  }, [bodies]);

  // One Line per pair, mounted lazily.
  return (
    <group>
      {pairs.map((p) => (
        <ConnectionLine key={p.id} fromId={p.from} toId={p.to} positionsRef={positionsRef} palette={palette} bodies={bodies} />
      ))}
    </group>
  );
}

function ConnectionLine({
  fromId, toId, positionsRef, palette, bodies,
}: {
  fromId: string;
  toId: string;
  positionsRef: React.MutableRefObject<Map<string, Vector3>>;
  palette: ReturnType<typeof agentPalette>;
  bodies: OrbitalBody[];
}) {
  const geomRef = useRef<BufferGeometry>(null);
  const positions = useMemo(() => new Float32Array(2 * 3), []);

  const material = useMemo(() => new LineBasicMaterial({
    color: palette.core,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.35,
  }), [palette.core]);

  // Bind the buffer once
  useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  useFrame(() => {
    const a = positionsRef.current.get(fromId);
    const b = positionsRef.current.get(toId);
    if (!a || !b || !geomRef.current) return;
    positions[0] = a.x; positions[1] = a.y; positions[2] = a.z;
    positions[3] = b.x; positions[4] = b.y; positions[5] = b.z;
    const attr = geomRef.current.getAttribute('position') as BufferAttribute;
    attr.needsUpdate = true;

    // Fade with age of the destination body
    const dest = bodies.find((bb) => bb.id === toId);
    if (dest) {
      const ageMs = performance.now() - dest.lastEventAt;
      const fade = Math.max(0, 1 - ageMs / 12_000);
      material.opacity = 0.35 * fade;
    }
  });

  return (
    <line>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <primitive object={material} attach="material" />
    </line>
  );
}
