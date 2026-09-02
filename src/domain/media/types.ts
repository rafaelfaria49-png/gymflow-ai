/**
 * GOAL-34 — Domínio de Mídia e Vídeos Técnicos
 * Conforme LIBRARY §2–4 e Decisões D11–D14
 */

export type MediaAssetStatus = 'draft' | 'approved' | 'retired';

export interface MediaAsset {
  /** Identificador único do asset (ex.: 'vid_chest_supino_reto_v1') */
  id: string;
  /** URL remoto (CDN) ou 'bundle:' para recursos locais embutidos */
  url: string;
  /** Tamanho em bytes do asset */
  bytes: number;
  /** Largura em pixels (ex.: 720) */
  width: number;
  /** Altura em pixels (ex.: 1280) */
  height: number;
  /** Versão incremental do vídeo (permite troca sem mexer no exercício) */
  version: number;
  /** Status de aprovação: apenas 'approved' pode ser renderizado em produção */
  status: MediaAssetStatus;
  /** Proveniência de licença comercial auditável (D13) */
  license: string;
  /** Checksum SHA-256 opcional para validação de integridade */
  checksum?: string;
  /** Tipo MIME (ex.: 'video/mp4', 'image/webp') */
  contentType?: string;
}

export interface ExerciseMedia {
  /** ID do exercício canônico na biblioteca */
  exerciseId: string;
  /** Thumbnail leve do exercício */
  thumbnail: MediaAsset;
  /** Sequência de frames para player de decomposição técnica (fallback nível 2) */
  frames?: MediaAsset[];
  /** Vídeo técnico 9:16 vertical loop ~4.8s (nível 1 - GymFlow Video Standard v2) */
  video?: MediaAsset;
}

export interface MediaManifest {
  /** Versão global do manifest */
  version: number;
  /** Versão do schema de manifest (ex.: '1.0.0') */
  schemaVersion: string;
  /** Data da última atualização ISO-8601 */
  updatedAt: string;
  /** URL base do CDN oficial (D14) */
  cdnBaseUrl: string;
  /** Mapa indexado por exerciseId */
  assets: Record<string, ExerciseMedia>;
}

export type MediaRenderTier = 'video' | 'frames' | 'thumbnail' | 'placeholder';

export interface MediaCacheStats {
  count: number;
  totalBytes: number;
  cacheName: string;
}

export interface ProgramMediaDownloadProgress {
  total: number;
  completed: number;
  currentExerciseName?: string;
}

export interface ProgramMediaDownloadResult {
  success: boolean;
  downloaded: number;
  failed: number;
  totalBytes: number;
}

export interface MediaTelemetryEvent {
  exerciseId: string;
  eventType: 'view' | 'video_play' | 'fallback_frames' | 'fallback_image' | 'workout_executed';
  timestamp: string;
}

export interface ExerciseExecutionStat {
  exerciseId: string;
  executionCount: number;
  lastExecutedAt: string;
}
