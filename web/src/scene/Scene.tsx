import { Suspense, memo, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, ChromaticAberration, BrightnessContrast } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Vector2, ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { Background } from './Background';
import { Aurora } from './Aurora';
import { Particles } from './Particles';
import { Nucleus } from './Nucleus';
import { OrbitalBodies } from './OrbitalBodies';
import { InterAgentLinks } from './InterAgentLinks';
import { useObservatory } from '../store/observatory';
import { ACTIVE_WINDOW_MS, type AgentState } from '../core/state';

interface SceneProps {
  reducedMotion?: boolean;
  screensaverMode?: boolean;
  onAgentClick?: (id: string) => void;
  focusedAgentId?: string | null;
}

export function Scene({ reducedMotion, screensaverMode, onAgentClick, focusedAgentId }: SceneProps) {
  const dpr = useMemo<[number, number]>(() => [1, Math.min(window.devicePixelRatio ?? 1, 2)], []);

  return (
    <Canvas
      dpr={dpr}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
        stencil: false,
        depth: true,
        preserveDrawingBuffer: false,
      }}
      camera={{ fov: 38, near: 0.1, far: 200, position: [0, 1.2, 13] }}
      onCreated={(state) => {
        state.gl.toneMapping = ACESFilmicToneMapping;
        state.gl.toneMappingExposure = 1.05;
        state.gl.outputColorSpace = SRGBColorSpace;
      }}
    >
      <Suspense fallback={null}>
        <SceneContents
          reducedMotion={!!reducedMotion}
          screensaverMode={!!screensaverMode}
          onAgentClick={onAgentClick}
          focusedAgentId={focusedAgentId}
        />
      </Suspense>
    </Canvas>
  );
}

function SceneContents({
  reducedMotion,
  screensaverMode,
  onAgentClick,
  focusedAgentId,
}: {
  reducedMotion: boolean;
  screensaverMode: boolean;
  onAgentClick?: (id: string) => void;
  focusedAgentId?: string | null;
}) {
  // Subscribe to state for structural changes (new agents/links).
  // Frame-by-frame reads happen via useObservatory.getState() inside child useFrame callbacks.
  const state = useObservatory((s) => s.state);

  // Drive the reducer's per-frame tick.  This does NOT trigger a React re-render
  // because tick() does not call set() (see store comment).
  useFrame(() => {
    useObservatory.getState().tick(performance.now());
  });

  const agents = useMemo(() => Object.values(state.agents), [state.agents]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[6, 8, 6]} intensity={0.7} color="#ffffff" />
      <pointLight position={[-6, -4, -6]} intensity={0.45} color="#80a0ff" />

      <Background />
      <Particles count={reducedMotion ? 320 : 850} />

      {agents.map((agent) => (
        <AgentCluster
          key={agent.id}
          agent={agent}
          reducedMotion={reducedMotion}
          focused={focusedAgentId === agent.id}
          otherFocused={!!focusedAgentId && focusedAgentId !== agent.id}
          onClick={() => onAgentClick?.(agent.id)}
        />
      ))}

      <InterAgentLinks
        links={state.links}
        agents={state.agents}
        reducedMotion={reducedMotion}
      />

      <Aurora />

      <CameraRig
        reducedMotion={reducedMotion}
        screensaverMode={screensaverMode}
        focusedAgentId={focusedAgentId ?? null}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={1.45}
          luminanceThreshold={0.16}
          luminanceSmoothing={0.42}
          mipmapBlur
          radius={0.78}
        />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new Vector2(0.0008, 0.0006)}
          radialModulation={false}
          modulationOffset={0}
        />
        <Vignette eskil={false} offset={0.3} darkness={0.85} />
        <BrightnessContrast brightness={-0.01} contrast={0.05} />
      </EffectComposer>
    </>
  );
}


const AgentCluster = memo(function AgentCluster({
  agent,
  reducedMotion,
  focused,
  otherFocused,
  onClick,
}: {
  agent: AgentState;
  reducedMotion: boolean;
  focused: boolean;
  otherFocused: boolean;
  onClick: () => void;
}) {
  return (
    <group>
      <Nucleus
        agent={agent}
        focused={focused}
        otherFocused={otherFocused}
        reducedMotion={reducedMotion}
        onClick={onClick}
      />
      <OrbitalBodies agent={agent} reducedMotion={reducedMotion} />
    </group>
  );
}, (prev, next) => {
    // Agent objects are stable references (mutated in place by reducer).
    // Only re-render when focus state or reducedMotion changes.
    return (
      prev.agent === next.agent &&
      prev.focused === next.focused &&
      prev.otherFocused === next.otherFocused &&
      prev.reducedMotion === next.reducedMotion
    );
  });

/** Smooth camera — idle parallax, focus dolly, screensaver cinematic. */
function CameraRig({
  reducedMotion,
  screensaverMode,
  focusedAgentId,
}: {
  reducedMotion: boolean;
  screensaverMode: boolean;
  focusedAgentId: string | null;
}) {
  const { camera } = useThree();
  const target = useMemo(() => ({ x: 0, y: 1.2, z: 13 }), []);
  const look = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);

  useFrame((s, delta) => {
    const time = s.clock.getElapsedTime();
    const agents = useObservatory.getState().state.agents;

    if (focusedAgentId && agents[focusedAgentId]?.position) {
      const p = agents[focusedAgentId].position!;
      target.x = p.x * 0.5;
      target.y = p.y + 1.5;
      target.z = 7;
      look.x = p.x; look.y = p.y; look.z = p.z;
    } else if (screensaverMode && !reducedMotion) {
      const cycle = (time % 240) / 240;
      const angle = cycle * Math.PI * 2;
      const radius = 11 + 2.5 * Math.sin(angle * 0.5);
      const height = 1.0 + 2.4 * Math.sin(angle * 0.33);
      target.x = Math.sin(angle) * radius;
      target.y = height;
      target.z = Math.cos(angle) * radius;
      look.x = 0; look.y = 0; look.z = 0;
    } else {
      const drift = reducedMotion ? 0 : 0.6;
      target.x = Math.sin(time * 0.045) * drift;
      target.y = 1.2 + Math.cos(time * 0.06) * drift * 0.25;
      target.z = 13 + Math.cos(time * 0.03) * drift * 0.5;
      look.x = 0; look.y = 0; look.z = 0;
    }

    const k = 1 - Math.pow(0.001, delta);
    camera.position.x += (target.x - camera.position.x) * k;
    camera.position.y += (target.y - camera.position.y) * k;
    camera.position.z += (target.z - camera.position.z) * k;
    camera.lookAt(look.x, look.y, look.z);
  });

  return null;
}
