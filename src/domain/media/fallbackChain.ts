import { ExerciseMedia, MediaAsset, MediaRenderTier } from './types';

export interface FallbackTechniqueFrame {
  image?: string;
  label?: string;
  cue?: string;
  order?: number;
}

export interface FallbackResolutionOptions {
  /** Lista de URLs que falharam ao carregar na sessão atual */
  failedUrls?: string[];
  /** Indica se a rede está offline (modo avião) */
  isOffline?: boolean;
  /** URLs que comprovadamente estão salvas no Cache Storage local */
  cachedUrls?: Set<string> | string[];
  /** Sequência técnica preexistente do exercício (fallback compatível) */
  legacyFrames?: FallbackTechniqueFrame[];
}

export interface FallbackTierResult {
  /** Nível ativo a ser renderizado */
  tier: MediaRenderTier;
  /** Asset de vídeo quando tier === 'video' */
  videoAsset: MediaAsset | null;
  /** Lista de URLs ou frames para sequência visual quando tier === 'frames' */
  frames: Array<{ url: string; label?: string; cue?: string }>;
  /** URL da imagem para exibição quando tier === 'thumbnail' */
  thumbnailUrl: string | null;
  /** Mensagem descritiva honesta para acessibilidade e UX */
  badgeLabel: string;
  /** Motivo da escolha (para auditoria e telemetria) */
  reason: string;
}

/**
 * Resolução pura da cadeia de fallback para um exercício.
 * Garante que em NENHUM cenário ocorra tela em branco ou erro não tratado.
 */
export function resolveMediaRenderTier(
  media: ExerciseMedia | null | undefined,
  options: FallbackResolutionOptions = {}
): FallbackTierResult {
  const failedUrls = new Set(options.failedUrls ?? []);
  const cachedUrls = new Set(options.cachedUrls ?? []);
  const isOffline = options.isOffline ?? false;

  // 1. TIER 1: VÍDEO TÉCNICO V2
  // QA GATE RÍGIDO: Se não for 'approved', NUNCA entra em Tier 1.
  if (media?.video) {
    const video = media.video;
    const isApproved = video.status === 'approved';
    const hasFailed = failedUrls.has(video.url);
    const isCached = cachedUrls.has(video.url);

    // Se estiver em modo avião sem cache ou se falhou o load, não usa vídeo
    const canPlayOffline = !isOffline || isCached;

    if (isApproved && !hasFailed && canPlayOffline) {
      return {
        tier: 'video',
        videoAsset: video,
        frames: [],
        thumbnailUrl: media.thumbnail?.url ?? null,
        badgeLabel: 'Vídeo HD • Coach Kai',
        reason: isCached ? 'video_cached' : 'video_online_approved',
      };
    }
  }

  // 2. TIER 2: SEQUÊNCIA DE FRAMES (PLAYER TÉCNICO)
  // Tenta frames do ExerciseMedia primeiro, depois legacyFrames
  const candidateFrames: Array<{ url: string; label?: string; cue?: string }> = [];

  if (media?.frames && media.frames.length > 0) {
    for (const frame of media.frames) {
      if (frame.status === 'approved' && !failedUrls.has(frame.url)) {
        candidateFrames.push({ url: frame.url });
      }
    }
  }

  if (candidateFrames.length === 0 && options.legacyFrames && options.legacyFrames.length > 0) {
    for (const frame of options.legacyFrames) {
      if (frame.image && !failedUrls.has(frame.image)) {
        candidateFrames.push({
          url: frame.image,
          label: frame.label,
          cue: frame.cue,
        });
      }
    }
  }

  if (candidateFrames.length > 0) {
    return {
      tier: 'frames',
      videoAsset: null,
      frames: candidateFrames,
      thumbnailUrl: media?.thumbnail?.url ?? null,
      badgeLabel: 'Sequência visual provisória',
      reason: media?.video?.status === 'draft' ? 'draft_blocked_fallback_to_frames' : 'frames_available',
    };
  }

  // 3. TIER 3: IMAGEM ESTÁTICA / THUMBNAIL
  if (media?.thumbnail?.url && !failedUrls.has(media.thumbnail.url)) {
    return {
      tier: 'thumbnail',
      videoAsset: null,
      frames: [],
      thumbnailUrl: media.thumbnail.url,
      badgeLabel: 'Demonstração estática',
      reason: 'thumbnail_fallback',
    };
  }

  // 4. TIER 4: PLACEHOLDER HONESTO (AVATAR DEMO EM BREVE)
  return {
    tier: 'placeholder',
    videoAsset: null,
    frames: [],
    thumbnailUrl: null,
    badgeLabel: 'Demonstração em breve',
    reason: 'placeholder_honest_fallback',
  };
}

/**
 * Validador estrito de QA Gate: apenas status 'approved' é autorizado.
 */
export function isMediaApproved(asset: MediaAsset | null | undefined): boolean {
  return asset?.status === 'approved';
}
