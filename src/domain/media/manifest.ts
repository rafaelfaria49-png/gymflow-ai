import { ExerciseMedia, MediaAsset, MediaManifest } from './types';
import defaultManifestJson from './manifest.json';

/**
 * Manifest padrão embutido como baseline segura
 */
const DEFAULT_MANIFEST: MediaManifest = defaultManifestJson as MediaManifest;

let activeManifest: MediaManifest = DEFAULT_MANIFEST;

/**
 * Retorna o manifest ativo em memória
 */
export function getActiveManifest(): MediaManifest {
  return activeManifest;
}

/**
 * Define ou atualiza o manifest ativo
 */
export function setActiveManifest(manifest: MediaManifest): void {
  const validation = validateMediaManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Manifest inválido: ${validation.errors.join(', ')}`);
  }
  activeManifest = manifest;
}

/**
 * Reseta o manifest para o default embutido
 */
export function resetToDefaultManifest(): void {
  activeManifest = DEFAULT_MANIFEST;
}

export interface MediaManifestValidationOptions {
  /** Se verdadeiro, exige que o critério de conteúdo de >= 20 vídeos aprovados esteja satisfeito */
  requireContentAcceptance?: boolean;
}

export interface MediaManifestValidationSummary {
  valid: boolean;
  errors: string[];
  approvedVideoCount: number;
  draftVideoCount: number;
  retiredVideoCount: number;
  contentAcceptance: {
    target: number;
    achieved: number;
    status: 'fulfilled' | 'pending_human_production';
    message: string;
  };
}

/**
 * Validação profunda do manifest contra as regras do GOAL-34, LIBRARY §2–4 e Decisões D11–D14
 */
export function validateMediaManifest(
  manifest: unknown,
  options: MediaManifestValidationOptions = {}
): MediaManifestValidationSummary {
  const errors: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return {
      valid: false,
      errors: ['Manifest deve ser um objeto válido'],
      approvedVideoCount: 0,
      draftVideoCount: 0,
      retiredVideoCount: 0,
      contentAcceptance: {
        target: 20,
        achieved: 0,
        status: 'pending_human_production',
        message: 'Manifest inválido',
      },
    };
  }

  const m = manifest as Partial<MediaManifest>;

  if (typeof m.version !== 'number' || m.version < 1) {
    errors.push('Manifest deve possuir version numérica >= 1');
  }

  if (typeof m.schemaVersion !== 'string' || !m.schemaVersion.trim()) {
    errors.push('Manifest deve possuir schemaVersion válida');
  }

  if (typeof m.cdnBaseUrl !== 'string' || !m.cdnBaseUrl.startsWith('http')) {
    errors.push('Manifest deve possuir cdnBaseUrl válida com protocolo http/https');
  }

  if (!m.assets || typeof m.assets !== 'object') {
    errors.push('Manifest deve possuir mapa de assets');
    return {
      valid: false,
      errors,
      approvedVideoCount: 0,
      draftVideoCount: 0,
      retiredVideoCount: 0,
      contentAcceptance: {
        target: 20,
        achieved: 0,
        status: 'pending_human_production',
        message: 'Manifest sem mapa de assets',
      },
    };
  }

  let approvedVideoCount = 0;
  let draftVideoCount = 0;
  let retiredVideoCount = 0;

  for (const [exerciseId, media] of Object.entries(m.assets)) {
    if (!media || typeof media !== 'object') {
      errors.push(`Exercício ${exerciseId}: mídia malformada`);
      continue;
    }

    if (!media.exerciseId || media.exerciseId !== exerciseId) {
      errors.push(`Exercício ${exerciseId}: exerciseId diverge da chave do mapa`);
    }

    if (!media.thumbnail || typeof media.thumbnail !== 'object') {
      errors.push(`Exercício ${exerciseId}: thumbnail obrigatória ausente`);
    } else {
      validateAsset(media.thumbnail, `${exerciseId}.thumbnail`, errors);
    }

    if (media.video) {
      validateAsset(media.video, `${exerciseId}.video`, errors);
      if (media.video.status === 'approved') {
        approvedVideoCount++;
      } else if (media.video.status === 'draft') {
        draftVideoCount++;
      } else if (media.video.status === 'retired') {
        retiredVideoCount++;
      }
    }

    if (media.frames && Array.isArray(media.frames)) {
      media.frames.forEach((frame, idx) => {
        validateAsset(frame, `${exerciseId}.frames[${idx}]`, errors);
      });
    }
  }

  const contentFulfilled = approvedVideoCount >= 20;
  const contentAcceptance = {
    target: 20,
    achieved: approvedVideoCount,
    status: contentFulfilled ? ('fulfilled' as const) : ('pending_human_production' as const),
    message: contentFulfilled
      ? `LIBRARY §5 cumprido: ${approvedVideoCount} vídeos aprovados servidos.`
      : `LIBRARY §5: Arquitetura suporta >= 20 vídeos aprovados, mas o aceite de conteúdo permanece pendente de produção humana (${approvedVideoCount}/20 vídeos aprovados atualmente).`,
  };

  if (options.requireContentAcceptance && !contentFulfilled) {
    errors.push(`LIBRARY §5 violado: esperado no mínimo 20 vídeos aprovados, encontrados ${approvedVideoCount}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    approvedVideoCount,
    draftVideoCount,
    retiredVideoCount,
    contentAcceptance,
  };
}

function validateAsset(asset: MediaAsset, path: string, errors: string[]): void {
  if (!asset.id || typeof asset.id !== 'string') {
    errors.push(`${path}: id inválido`);
  }
  if (!asset.url || typeof asset.url !== 'string') {
    errors.push(`${path}: url inválida`);
  }
  if (typeof asset.bytes !== 'number' || asset.bytes <= 0) {
    errors.push(`${path}: bytes deve ser maior que 0`);
  }
  if (typeof asset.width !== 'number' || asset.width <= 0) {
    errors.push(`${path}: width inválida`);
  }
  if (typeof asset.height !== 'number' || asset.height <= 0) {
    errors.push(`${path}: height inválida`);
  }
  if (typeof asset.version !== 'number' || asset.version < 1) {
    errors.push(`${path}: version deve ser >= 1`);
  }
  if (!['draft', 'approved', 'retired'].includes(asset.status)) {
    errors.push(`${path}: status desconhecido '${asset.status}'`);
  }

  // D12: validação de proporção 9:16 e duração padrão 6s (excepcional 10s para cadências longas)
  if (path.endsWith('.video')) {
    const ratio = asset.width / asset.height;
    if (ratio > 0.65) {
      errors.push(`${path}: D12 violada: vídeo deve estar em 9:16 vertical (proporção atual: ${ratio.toFixed(2)})`);
    }
    if (asset.durationSeconds !== undefined && asset.durationSeconds !== 6 && asset.durationSeconds !== 10) {
      errors.push(`${path}: D12 violada: duração padrão do vídeo é 6s (ou 10s excepcional para cadências longas), encontrada ${asset.durationSeconds}s`);
    }
  }

  // D13: proveniência verificável
  if (!asset.provenance && !asset.license) {
    errors.push(`${path}: D13 violada: metadados de proveniência/licença ausentes`);
  } else if (asset.provenance) {
    if (!asset.provenance.provider || !asset.provenance.provider.trim()) {
      errors.push(`${path}: D13 violada: provenance.provider é obrigatório`);
    }
    // Proíbe explicitamente licença inventada
    if (asset.provenance.termsOrLicenseRef?.includes('Higgsfield Commercial License v1 - GymFlow Proprietary') ||
        asset.license?.includes('Higgsfield Commercial License v1 - GymFlow Proprietary')) {
      errors.push(`${path}: D13 violada: uso proibido de licença proprietária inventada ('Higgsfield Commercial License v1 - GymFlow Proprietary')`);
    }
  }

  // D13 & QA Gate: status 'approved' em vídeo só é autorizado com evidência humana formal de aprovação
  if (asset.status === 'approved' && path.endsWith('.video')) {
    validateVideoApproval(asset.provenance?.approval, path, errors);
    // GOAL-056 P2: nenhum vídeo approved pode atestar direitos comerciais sem evidência
    const termsRef = asset.provenance?.termsOrLicenseRef;
    const legacyLicense = asset.license;
    if ((typeof termsRef === 'string' && /commercial/i.test(termsRef)) ||
        (typeof legacyLicense === 'string' && /commercial/i.test(legacyLicense))) {
      errors.push(`${path}: D13/QA Gate violado: afirmação comercial não comprovada em termsOrLicenseRef/licença (direitos/licença comercial não são atestados pelo manifest)`);
    }
  }
}

/**
 * GOAL-056 — Validação honesta da aprovação de vídeo:
 * exige aprovador real + evidência rastreável, sem timestamp falso.
 * `approvedAt` só é aceito com precisão 'exact' e formato ISO 8601 válido;
 * precisão 'unknown' proíbe `approvedAt` (mtime de arquivo não é timestamp do evento).
 */
function validateVideoApproval(approval: unknown, path: string, errors: string[]): void {
  const a = approval as Partial<import('./types').MediaAssetApproval> | undefined;
  if (!a || typeof a !== 'object') {
    errors.push(`${path}: D13/QA Gate violado: vídeo com status 'approved' requer metadados de aprovação humana formal (approval)`);
    return;
  }
  if (typeof a.approvedBy !== 'string' || !a.approvedBy.trim()) {
    errors.push(`${path}: D13/QA Gate violado: vídeo com status 'approved' requer aprovador humano real (approvedBy)`);
  }
  if (typeof a.approvalEvidenceRef !== 'string' || !a.approvalEvidenceRef.trim()) {
    errors.push(`${path}: D13/QA Gate violado: vídeo com status 'approved' requer evidência de aprovação rastreável (approvalEvidenceRef)`);
  }
  const precision = (a as { approvedAtPrecision?: unknown }).approvedAtPrecision;
  if (precision !== 'exact' && precision !== 'unknown') {
    errors.push(`${path}: D13/QA Gate violado: vídeo com status 'approved' requer declaração honesta de precisão do timestamp (approvedAtPrecision: 'exact' | 'unknown')`);
    return;
  }
  if (precision === 'exact') {
    if (typeof a.approvedAt !== 'string' || !a.approvedAt.trim()) {
      errors.push(`${path}: D13/QA Gate violado: metadado contraditório — approvedAtPrecision 'exact' exige approvedAt com o timestamp comprovado do evento`);
    } else if (Number.isNaN(Date.parse(a.approvedAt))) {
      errors.push(`${path}: D13/QA Gate violado: approvedAt em formato inválido (ISO 8601 esperado): '${a.approvedAt}'`);
    }
  } else if (a.approvedAt !== undefined) {
    errors.push(`${path}: D13/QA Gate violado: metadado contraditório — approvedAtPrecision 'unknown' proíbe approvedAt (timestamp do evento desconhecido; mtime de arquivo não é timestamp do evento)`);
  }
}

/**
 * Obtém os dados de mídia de um exercício a partir do manifest ativo
 */
export function getExerciseMedia(exerciseId: string, manifest: MediaManifest = activeManifest): ExerciseMedia | null {
  return manifest.assets[exerciseId] ?? null;
}

/**
 * Busca manifest remoto atualizado (ex.: no CDN ou servidor local).
 * Se o manifest remoto for mais recente (version > ativa), ele é promovido a ativo.
 */
export async function fetchRemoteManifest(manifestUrl = '/media-manifest.json'): Promise<{ updated: boolean; manifest: MediaManifest }> {
  try {
    const res = await fetch(manifestUrl, { cache: 'no-cache' });
    if (!res.ok) {
      return { updated: false, manifest: activeManifest };
    }
    const data = (await res.json()) as MediaManifest;
    const validation = validateMediaManifest(data);
    if (!validation.valid) {
      console.warn('Manifest remoto inválido:', validation.errors);
      return { updated: false, manifest: activeManifest };
    }

    if (data.version > activeManifest.version) {
      activeManifest = data;
      return { updated: true, manifest: data };
    }

    return { updated: false, manifest: activeManifest };
  } catch (err) {
    console.warn('Falha ao buscar manifest remoto:', err);
    return { updated: false, manifest: activeManifest };
  }
}
