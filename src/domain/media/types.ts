/**
 * GOAL-34 — Domínio de Mídia e Vídeos Técnicos
 * Conforme LIBRARY §2–4 e Decisões D11–D14
 */

export type MediaAssetStatus = 'draft' | 'approved' | 'retired';

export interface MediaAssetApproval {
  /** Identificador do revisor humano do GymFlow */
  approvedBy: string;
  /** Timestamp ISO 8601 da aprovação */
  approvedAt: string;
  /** Notas da revisão técnica/biomecânica */
  notes?: string;
}

export interface MediaAssetProvenance {
  /** Provedor ou pipeline de origem (ex: 'higgsfield', 'runway', 'luma', 'manual_capture', 'gymflow_catalog') */
  provider: string;
  /** Modelo ou workflow quando conhecido (ex: 'character_soul_kai_v2', 'coach_camera_rig_1') */
  modelOrWorkflow?: string;
  /** Timestamp ISO 8601 da geração ou captura */
  generatedAt?: string;
  /** Referência aplicável de termos de serviço, licença da plataforma ou contrato */
  termsOrLicenseRef?: string;
  /** Notas de proveniência ou identificador de lote */
  provenanceNotes?: string;
  /** Metadados do fluxo de aprovação humana no GymFlow */
  approval?: MediaAssetApproval;
}

export interface MediaAsset {
  /** Identificador único do asset (ex.: 'vid_chest_supino_reto_v1') */
  id: string;
  /** URL remoto (CDN) ou caminho de asset local */
  url: string;
  /** Tamanho em bytes do asset */
  bytes: number;
  /** Largura em pixels (ex.: 720 ou 1080) */
  width: number;
  /** Altura em pixels (ex.: 1280 ou 1920) */
  height: number;
  /** Duração em segundos (D12: 6s padrão; 10s excepcional para cadência longa) */
  durationSeconds?: number;
  /** Repetições completas gravadas (D12: normalmente 2 repetições naturais) */
  repCount?: number;
  /** Taxa de quadros normalizada (D12: 24 fps) */
  fps?: number;
  /** Codec de vídeo (D12: 'h264') */
  codec?: string;
  /** Versão incremental do vídeo (permite troca sem mexer no exercício) */
  version: number;
  /** Status de aprovação: apenas 'approved' com aprovação humana é renderizado em produção */
  status: MediaAssetStatus;
  /** Proveniência e fatos auditáveis do asset (D13) */
  provenance?: MediaAssetProvenance;
  /** Checksum SHA-256 opcional para validação de integridade */
  checksum?: string;
  /** Tipo MIME (ex.: 'video/mp4', 'image/jpeg') */
  contentType?: string;
  /** @deprecated Mantido opcional para retrocompatibilidade */
  license?: string;
}

export interface ExerciseMedia {
  /** ID do exercício canônico na biblioteca */
  exerciseId: string;
  /** Thumbnail leve do exercício */
  thumbnail: MediaAsset;
  /** Sequência de frames para player de decomposição técnica (fallback nível 2) */
  frames?: MediaAsset[];
  /** Vídeo técnico 9:16 vertical loop (nível 1 - GymFlow Video Standard v2: 6s padrão / 10s excepcional, movimento natural) */
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
