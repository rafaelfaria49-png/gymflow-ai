/**
 * GymFlow AI — Pipeline 3D (POC)
 * -------------------------------------------------------------------------
 * Configuração central, dirigida por dados, do sistema de avatar 3D.
 *
 * Este arquivo NÃO tem 'use client' de propósito: é só dados + funções puras,
 * podendo ser importado tanto por componentes cliente quanto por server
 * components / scripts de build.
 *
 * Aqui você liga avatares (.glb), registra animações e mapeia
 * `exercícios → animação`. Enquanto os assets reais não existirem, todos os
 * itens ficam com `available: false` e a POC mostra um placeholder honesto.
 */

export type AvatarGender = 'male' | 'female' | 'neutral';

export interface AvatarDefinition {
  id: AvatarGender;
  label: string;
  /** Caminho sob /public (ou URL remota) para o .glb/.gltf do avatar. */
  modelPath: string;
  /**
   * Vire para `true` SOMENTE depois de colocar o arquivo real em `modelPath`.
   * Com `false`, o viewer renderiza o palco 3D + placeholder (sem mentir que é "3D realista").
   */
  available: boolean;
  /** Escala uniforme opcional, caso o modelo de origem não esteja em metros. */
  scale?: number;
  /** Ajuste vertical opcional (metros) para "plantar" o avatar no chão. */
  yOffset?: number;
}

/**
 * Registro de avatares por gênero. Troca masculino/feminino/neutro é só config.
 * Os nomes de arquivo default casam com `public/assets/avatars/README.md`.
 */
export const AVATARS: Record<AvatarGender, AvatarDefinition> = {
  male: {
    id: 'male',
    label: 'Masculino',
    modelPath: '/assets/avatars/male.glb',
    available: false,
    scale: 1,
    yOffset: 0,
  },
  female: {
    id: 'female',
    label: 'Feminino',
    modelPath: '/assets/avatars/female.glb',
    available: false,
    scale: 1,
    yOffset: 0,
  },
  neutral: {
    id: 'neutral',
    label: 'Neutro',
    modelPath: '/assets/avatars/neutral.glb',
    available: false,
    scale: 1,
    yOffset: 0,
  },
};

export interface AnimationClipDef {
  id: string;
  label: string;
  /**
   * .glb separado contendo o AnimationClip (preferível, reutilizável entre avatares).
   * Deixe vazio ('') se a animação estiver embutida no próprio modelo do avatar.
   */
  path: string;
  /** Nome do clipe dentro do arquivo (opcional; usa o primeiro se omitido). */
  clipName?: string;
  /** Loop contínuo (execução de exercício normalmente é loop). */
  loop: boolean;
  /** Vire para `true` quando o arquivo de animação existir. */
  available: boolean;
}

export const DEFAULT_ANIMATION_ID = 'idle';

/**
 * Biblioteca de animações lógicas. Cada exercício é mapeado para uma destas.
 */
export const ANIMATIONS: Record<string, AnimationClipDef> = {
  idle: {
    id: 'idle',
    label: 'Respiração / Idle',
    path: '/assets/animations/idle.glb',
    loop: true,
    available: false,
  },
  squat: {
    id: 'squat',
    label: 'Agachamento',
    path: '/assets/animations/squat.glb',
    loop: true,
    available: false,
  },
  bench_press: {
    id: 'bench_press',
    label: 'Supino / Empurrar',
    path: '/assets/animations/bench-press.glb',
    loop: true,
    available: false,
  },
  shoulder_press: {
    id: 'shoulder_press',
    label: 'Desenvolvimento de Ombros',
    path: '/assets/animations/shoulder-press.glb',
    loop: true,
    available: false,
  },
  deadlift: {
    id: 'deadlift',
    label: 'Levantamento Terra / Stiff',
    path: '/assets/animations/deadlift.glb',
    loop: true,
    available: false,
  },
  row: {
    id: 'row',
    label: 'Remada / Puxada',
    path: '/assets/animations/row.glb',
    loop: true,
    available: false,
  },
  hip_thrust: {
    id: 'hip_thrust',
    label: 'Elevação Pélvica / Glúteo',
    path: '/assets/animations/hip-thrust.glb',
    loop: true,
    available: false,
  },
  biceps_curl: {
    id: 'biceps_curl',
    label: 'Rosca de Bíceps',
    path: '/assets/animations/biceps-curl.glb',
    loop: true,
    available: false,
  },
};

/**
 * Mapeamento exercício → animação, como DADOS (não como if/else dentro de um
 * componente). Cada regra define substrings que, se presentes no `exerciseId`
 * (ou no `videoId`), selecionam a animação. A ordem importa: a primeira regra
 * que casar vence.
 */
interface AnimationMapRule {
  match: string[];
  animationId: keyof typeof ANIMATIONS | string;
}

const ANIMATION_MAP_RULES: AnimationMapRule[] = [
  { match: ['agachamento', 'squat', 'leg_press', 'legpress', 'hack', 'afundo', 'goblet'], animationId: 'squat' },
  { match: ['desenvolvimento', 'shoulder', 'militar', 'arnold'], animationId: 'shoulder_press' },
  { match: ['supino', 'bench', 'press', 'pushup', 'flexao', 'crucifixo', 'peck', 'crossover', 'paralelas', 'fundos'], animationId: 'bench_press' },
  { match: ['terra', 'deadlift', 'stiff', 'rdl', 'flexora'], animationId: 'deadlift' },
  { match: ['remada', 'row', 'puxada', 'pulldown', 'pulley', 'barra_fixa', 'serrote'], animationId: 'row' },
  { match: ['pelvica', 'hip_thrust', 'thrust', 'gluteo', 'glutes'], animationId: 'hip_thrust' },
  { match: ['rosca', 'biceps', 'curl', 'triceps', 'testa', 'coice'], animationId: 'biceps_curl' },
];

/**
 * Resolve a animação lógica a partir de um id de exercício OU de vídeo.
 * Sempre devolve um id válido (cai em DEFAULT_ANIMATION_ID).
 */
export function resolveAnimationId(exerciseOrVideoId: string | undefined | null): string {
  const id = (exerciseOrVideoId || '').toLowerCase();
  for (const rule of ANIMATION_MAP_RULES) {
    if (rule.match.some((token) => id.includes(token))) {
      return rule.animationId;
    }
  }
  return DEFAULT_ANIMATION_ID;
}

export function getAvatar(gender: AvatarGender): AvatarDefinition {
  return AVATARS[gender] ?? AVATARS.neutral;
}

/** O avatar daquele gênero tem asset real disponível? */
export function isAvatarAvailable(gender: AvatarGender): boolean {
  return Boolean(getAvatar(gender)?.available);
}

/** Existe QUALQUER avatar com asset configurado? (útil para banners globais) */
export function hasAnyAvatarAsset(): boolean {
  return Object.values(AVATARS).some((a) => a.available);
}

export function getAnimation(animationId: string): AnimationClipDef | undefined {
  return ANIMATIONS[animationId];
}

/**
 * Configuração de palco/câmera/luz, alinhada ao tema visual do GymFlow
 * (cyber-lime + dark) definido em globals.css.
 */
export const STAGE_CONFIG = {
  /** Cor de fundo do canvas (combina com --color-gym-dark/--color-gym-card). */
  background: '#0b0b0f',
  groundColor: '#0e0e13',
  accent: '#a3e635',
  camera: {
    position: [0.0, 1.45, 3.4] as [number, number, number],
    fov: 35,
    target: [0, 1.0, 0] as [number, number, number],
  },
  controls: {
    enablePan: false,
    minDistance: 1.6,
    maxDistance: 7,
    minPolarAngle: 0.2,
    maxPolarAngle: Math.PI / 1.8,
  },
} as const;
