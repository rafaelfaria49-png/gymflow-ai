'use client';

/**
 * GymFlow AI — Pipeline 3D (POC) · Viewer
 * -------------------------------------------------------------------------
 * Cena React Three Fiber de verdade: <Canvas> WebGL, GLTFLoader, AnimationMixer
 * (via useAnimations), luzes, câmera, OrbitControls e contact shadows.
 *
 * Este componente é carregado APENAS no cliente (a Stage faz o dynamic import
 * com `ssr: false`), porque o WebGL não pode rodar no servidor.
 *
 * Honestidade da POC:
 *  - Se houver um .glb real configurado (`available: true`), carrega o avatar e
 *    a animação real, com retargeting básico via AnimationMixer.
 *  - Se NÃO houver asset, renderiza um PLACEHOLDER 3D real (objeto primitivo —
 *    nunca um humano desenhado, nunca skeleton/wireframe) só para provar que o
 *    palco/luz/câmera/loop estão funcionando. A Stage exibe o aviso textual.
 */

import React, {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  Component,
  type ReactNode,
} from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import {
  AvatarGender,
  getAvatar,
  getAnimation,
  resolveAnimationId,
  STAGE_CONFIG,
} from './avatar-config';

export type ViewerStatus = 'placeholder' | 'loading' | 'model' | 'error';

export interface GymFlowAvatarViewerProps {
  gender: AvatarGender;
  exerciseId: string;
  isPlaying?: boolean;
  playbackSpeed?: number;
  autoRotate?: boolean;
  /** Chamado quando o estado da cena muda (placeholder / model / error). */
  onStatusChange?: (status: ViewerStatus) => void;
}

/* -------------------------------------------------------------------------- */
/* Error boundary 3D (captura falha de carregamento de .glb dentro do Canvas) */
/* -------------------------------------------------------------------------- */

interface BoundaryProps {
  fallback: ReactNode;
  onError?: () => void;
  children: ReactNode;
}
interface BoundaryState {
  hasError: boolean;
}

class R3FErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) return <>{this.props.fallback}</>;
    return <>{this.props.children}</>;
  }
}

/* -------------------------------------------------------------------------- */
/* Rig de animação: liga clips ao modelo e controla play/pause/velocidade      */
/* -------------------------------------------------------------------------- */

interface RigProps {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
  clipName?: string;
  loop: boolean;
  scale: number;
  yOffset: number;
  isPlaying: boolean;
  playbackSpeed: number;
  onReady?: () => void;
}

function AnimationRig({
  scene,
  clips,
  clipName,
  loop,
  scale,
  yOffset,
  isPlaying,
  playbackSpeed,
  onReady,
}: RigProps) {
  const group = useRef<THREE.Group>(null);
  const { actions, names } = useAnimations(clips, group);

  // Seleciona e inicia o clipe assim que as actions existirem.
  useEffect(() => {
    if (names.length === 0) {
      onReady?.();
      return;
    }
    const selected = clipName && actions[clipName] ? clipName : names[0];
    const action = selected ? actions[selected] : undefined;
    if (!action) {
      onReady?.();
      return;
    }
    action
      .reset()
      .setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
      .fadeIn(0.3)
      .play();
    onReady?.();
    return () => {
      action.fadeOut(0.2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, names, clipName, loop]);

  // Reflete play/pause e velocidade nas actions.
  useEffect(() => {
    Object.values(actions).forEach((action) => {
      if (!action) return;
      action.paused = !isPlaying;
      action.timeScale = playbackSpeed;
    });
  }, [isPlaying, playbackSpeed, actions]);

  return (
    <group ref={group} scale={scale} position={[0, yOffset, 0]} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar com clipe EXTERNO (.glb de animação separado)                        */
/* -------------------------------------------------------------------------- */

interface ExternalClipProps extends Omit<RigProps, 'clips' | 'scene'> {
  modelPath: string;
  clipPath: string;
}

function AvatarWithExternalClip({ modelPath, clipPath, ...rig }: ExternalClipProps) {
  const model = useGLTF(modelPath);
  const clipGltf = useGLTF(clipPath);
  // Nota: para renderizar MÚLTIPLAS instâncias do mesmo avatar skinned ao mesmo
  // tempo (ex.: lista do treino ativo), clone com `SkeletonUtils.clone(scene)`
  // (three/examples/jsm/utils/SkeletonUtils) — clone() simples quebra o skinning.
  return <AnimationRig scene={model.scene} clips={clipGltf.animations} {...rig} />;
}

/* -------------------------------------------------------------------------- */
/* Avatar com clipe EMBUTIDO no próprio modelo                                 */
/* -------------------------------------------------------------------------- */

interface EmbeddedClipProps extends Omit<RigProps, 'clips' | 'scene'> {
  modelPath: string;
}

function AvatarWithEmbeddedClip({ modelPath, ...rig }: EmbeddedClipProps) {
  const model = useGLTF(modelPath);
  return <AnimationRig scene={model.scene} clips={model.animations} {...rig} />;
}

/* -------------------------------------------------------------------------- */
/* Decisor: escolhe a estratégia de animação com base na config                */
/* -------------------------------------------------------------------------- */

interface AvatarModelProps {
  gender: AvatarGender;
  exerciseId: string;
  isPlaying: boolean;
  playbackSpeed: number;
  onReady?: () => void;
}

function AvatarModel({ gender, exerciseId, isPlaying, playbackSpeed, onReady }: AvatarModelProps) {
  const avatar = getAvatar(gender);
  const animId = resolveAnimationId(exerciseId);
  const animDef = getAnimation(animId);

  const commonRig = {
    clipName: animDef?.clipName,
    loop: animDef?.loop ?? true,
    scale: avatar.scale ?? 1,
    yOffset: avatar.yOffset ?? 0,
    isPlaying,
    playbackSpeed,
    onReady,
  };

  if (animDef?.available && animDef.path) {
    return (
      <AvatarWithExternalClip modelPath={avatar.modelPath} clipPath={animDef.path} {...commonRig} />
    );
  }
  return <AvatarWithEmbeddedClip modelPath={avatar.modelPath} {...commonRig} />;
}

/* -------------------------------------------------------------------------- */
/* Placeholder 3D real (objeto primitivo — NÃO é humano, NÃO é skeleton)       */
/* -------------------------------------------------------------------------- */

function PlaceholderDumbbell({ isPlaying }: { isPlaying: boolean }) {
  const group = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (!group.current) return;
    const t = _state.clock.getElapsedTime();
    group.current.position.y = 1.05 + Math.sin(t * 1.4) * 0.06;
    if (isPlaying) group.current.rotation.y += delta * 0.5;
  });

  const barMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#d4d4d8', metalness: 0.9, roughness: 0.25 }),
    [],
  );
  const plateMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#1c1c24', metalness: 0.6, roughness: 0.4 }),
    [],
  );

  return (
    <group ref={group} position={[0, 1.05, 0]}>
      {/* Barra */}
      <mesh rotation={[0, 0, Math.PI / 2]} material={barMat} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 1.25, 24]} />
      </mesh>
      {/* Anilhas */}
      {[-0.5, 0.5].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={plateMat} castShadow>
          <cylinderGeometry args={[0.24, 0.24, 0.09, 32]} />
        </mesh>
      ))}
      {[-0.42, 0.42].map((x) => (
        <mesh key={`inner-${x}`} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={plateMat} castShadow>
          <cylinderGeometry args={[0.19, 0.19, 0.07, 32]} />
        </mesh>
      ))}
      {/* Anel accent (identidade visual GymFlow) */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.012, 16, 64]} />
        <meshStandardMaterial
          color={STAGE_CONFIG.accent}
          emissive={STAGE_CONFIG.accent}
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Loader 3D (fallback de Suspense — também é 3D, não HTML)                     */
/* -------------------------------------------------------------------------- */

function Loader3D() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_s, delta) => {
    if (ref.current) {
      ref.current.rotation.x += delta * 1.5;
      ref.current.rotation.y += delta * 2.0;
    }
  });
  return (
    <mesh ref={ref} position={[0, 1.1, 0]}>
      <torusKnotGeometry args={[0.28, 0.085, 80, 16]} />
      <meshStandardMaterial color={STAGE_CONFIG.accent} metalness={0.3} roughness={0.4} />
    </mesh>
  );
}

/* -------------------------------------------------------------------------- */
/* Conteúdo da cena: luzes, chão, controles + avatar/placeholder               */
/* -------------------------------------------------------------------------- */

function SceneContents({
  gender,
  exerciseId,
  isPlaying = true,
  playbackSpeed = 1,
  autoRotate = false,
  onStatusChange,
}: GymFlowAvatarViewerProps) {
  const avatar = getAvatar(gender);
  const showRealAvatar = avatar.available;

  // Reporta o status inicial conforme a disponibilidade do asset.
  useEffect(() => {
    onStatusChange?.(showRealAvatar ? 'loading' : 'placeholder');
  }, [showRealAvatar, gender, onStatusChange]);

  return (
    <>
      <color attach="background" args={[STAGE_CONFIG.background]} />
      <fog attach="fog" args={[STAGE_CONFIG.background, 6, 14]} />

      {/* Iluminação de estúdio */}
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[3.5, 6, 4]}
        intensity={2.4}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
      />
      <directionalLight position={[-4, 3, -2]} intensity={0.7} color="#9bd1ff" />
      <pointLight position={[0, 3.2, 1.5]} intensity={12} distance={9} color={STAGE_CONFIG.accent} />

      {/* Chão que recebe sombra */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial color={STAGE_CONFIG.groundColor} roughness={1} metalness={0} />
      </mesh>
      <ContactShadows position={[0, 0.01, 0]} opacity={0.55} scale={9} blur={2.6} far={4.5} color="#000000" />

      {/* Avatar real OU placeholder 3D */}
      {showRealAvatar ? (
        <R3FErrorBoundary
          fallback={<PlaceholderDumbbell isPlaying={isPlaying} />}
          onError={() => onStatusChange?.('error')}
        >
          <Suspense fallback={<Loader3D />}>
            <AvatarModel
              gender={gender}
              exerciseId={exerciseId}
              isPlaying={isPlaying}
              playbackSpeed={playbackSpeed}
              onReady={() => onStatusChange?.('model')}
            />
          </Suspense>
        </R3FErrorBoundary>
      ) : (
        <PlaceholderDumbbell isPlaying={isPlaying} />
      )}

      <OrbitControls
        makeDefault
        enablePan={STAGE_CONFIG.controls.enablePan}
        minDistance={STAGE_CONFIG.controls.minDistance}
        maxDistance={STAGE_CONFIG.controls.maxDistance}
        minPolarAngle={STAGE_CONFIG.controls.minPolarAngle}
        maxPolarAngle={STAGE_CONFIG.controls.maxPolarAngle}
        target={STAGE_CONFIG.camera.target}
        autoRotate={autoRotate}
        autoRotateSpeed={0.8}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Export default: o <Canvas> WebGL completo                                   */
/* -------------------------------------------------------------------------- */

export default function GymFlowAvatarViewer(props: GymFlowAvatarViewerProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: STAGE_CONFIG.camera.position, fov: STAGE_CONFIG.camera.fov }}
    >
      <SceneContents {...props} />
    </Canvas>
  );
}
