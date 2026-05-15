import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  LineBasicMaterial,
  Line as ThreeLine,
  QuadraticBezierCurve3,
  SpriteMaterial,
  Sprite,
  Vector3,
} from 'three';
import { agentPalette, clamp, easeOutCubic } from '../lib/tokens';
import type { AgentState, InterAgentLink } from '../core/state';

interface Props {
  links: InterAgentLink[];
  agents: Record<string, AgentState>;
  reducedMotion?: boolean;
}

const POINT_TEX: CanvasTexture = (() => {
  if (typeof document === 'undefined') return null as unknown as CanvasTexture;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
})();

export function InterAgentLinks({ links, agents, reducedMotion }: Props) {
  return (
    <group>
      {links.map((link) => (
        <ArcLink key={link.id} link={link} agents={agents} reducedMotion={!!reducedMotion} />
      ))}
    </group>
  );
}

const SEGMENTS = 48;

function ArcLink({ link, agents, reducedMotion }: { link: InterAgentLink; agents: Record<string, AgentState>; reducedMotion: boolean }) {
  const fromAgent = agents[link.fromAgent];
  const toAgent = agents[link.toAgent];
  const lineRef = useRef<ThreeLine>(null);
  const spriteRef = useRef<Sprite>(null);

  const color = useMemo(() => {
    if (!fromAgent || !toAgent) return new Color('#ffffff');
    const c1 = agentPalette(fromAgent.colorIndex).core.clone();
    const c2 = agentPalette(toAgent.colorIndex).core.clone();
    return c1.lerp(c2, 0.5);
  }, [fromAgent, toAgent]);

  const { geometry, curve } = useMemo(() => {
    const from = fromAgent?.position ?? { x: 0, y: 0, z: 0 };
    const to = toAgent?.position ?? { x: 0, y: 0, z: 0 };
    const p0 = new Vector3(from.x, from.y, from.z);
    const p2 = new Vector3(to.x, to.y, to.z);
    const mid = p0.clone().lerp(p2, 0.5);
    const radial = mid.clone();
    const radialLen = radial.length() || 1;
    radial.multiplyScalar(1 / radialLen);
    const dist = p0.distanceTo(p2);
    mid.add(radial.multiplyScalar(dist * 0.32 + 0.4));
    mid.y += dist * 0.18;
    const curve = new QuadraticBezierCurve3(p0, mid, p2);
    const points = curve.getPoints(SEGMENTS);

    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      positions[i * 3 + 0] = points[i].x;
      positions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = points[i].z;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    return { geometry: g, curve };
  }, [fromAgent?.position?.x, fromAgent?.position?.y, fromAgent?.position?.z, toAgent?.position?.x, toAgent?.position?.y, toAgent?.position?.z]);

  const material = useMemo(() => new LineBasicMaterial({
    color,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }), [color]);

  const spriteMaterial = useMemo(() => new SpriteMaterial({
    map: POINT_TEX,
    color,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.9,
  }), [color]);

  useFrame((s) => {
    const now = performance.now();
    const age = now - link.lastEventAt;
    const t = clamp(age / 2_000, 0, 1);
    const fade = 1 - easeOutCubic(t);
    material.opacity = 0.62 * fade;

    const time = s.clock.getElapsedTime();
    const u = reducedMotion ? 0.5 : (time % 1.2) / 1.2;
    const pos = curve.getPointAt(u);
    if (spriteRef.current) {
      spriteRef.current.position.copy(pos);
      spriteRef.current.scale.setScalar(0.55 * (0.9 + 0.2 * Math.sin(time * 8)));
    }
    spriteMaterial.opacity = 0.9 * fade;
  });

  return (
    <group>
      {/* @ts-expect-error R3F element typing varies between versions */}
      <line ref={lineRef as never} geometry={geometry} material={material} />
      <sprite ref={spriteRef} material={spriteMaterial} />
    </group>
  );
}
