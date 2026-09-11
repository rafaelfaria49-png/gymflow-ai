import { MediaManifest } from '../../src/domain/media/types';

export interface ManifestValidationOptions {
  /** Se verdadeiro, falha a validação caso o critério de conteúdo de >=20 vídeos aprovados não seja atingido */
  requireContentAcceptance?: boolean;
}

export interface ManifestValidationResult {
  valid: boolean;
  totalAssets: number;
  approvedVideosCount: number;
  draftVideosCount: number;
  retiredVideosCount: number;
  contentAcceptance: {
    target: number;
    achieved: number;
    fulfilled: boolean;
    status: 'fulfilled' | 'pending_human_production';
    message: string;
  };
  errors: string[];
  warnings: string[];
}

/**
 * Validador oficial do manifest de mídia contra LIBRARY §2–5 e Decisões D11–D14
 */
export function validateManifestFile(
  manifest: MediaManifest,
  options: ManifestValidationOptions = {}
): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return {
      valid: false,
      totalAssets: 0,
      approvedVideosCount: 0,
      draftVideosCount: 0,
      retiredVideosCount: 0,
      contentAcceptance: {
        target: 20,
        achieved: 0,
        fulfilled: false,
        status: 'pending_human_production',
        message: 'Manifest inválido ou nulo',
      },
      errors: ['Manifest inválido ou nulo'],
      warnings: [],
    };
  }

  if (typeof manifest.version !== 'number' || manifest.version < 1) {
    errors.push('Manifest deve ter version >= 1');
  }

  if (!manifest.schemaVersion) {
    errors.push('Manifest deve ter schemaVersion');
  }

  if (!manifest.cdnBaseUrl || !manifest.cdnBaseUrl.startsWith('http')) {
    errors.push('Manifest deve ter cdnBaseUrl válida (http/https)');
  }

  if (!manifest.assets || typeof manifest.assets !== 'object') {
    errors.push('Manifest deve ter objeto assets');
    return {
      valid: false,
      totalAssets: 0,
      approvedVideosCount: 0,
      draftVideosCount: 0,
      retiredVideosCount: 0,
      contentAcceptance: {
        target: 20,
        achieved: 0,
        fulfilled: false,
        status: 'pending_human_production',
        message: 'Manifest sem objeto assets',
      },
      errors,
      warnings,
    };
  }

  let approvedVideos = 0;
  let draftVideos = 0;
  let retiredVideos = 0;
  const entries = Object.entries(manifest.assets);

  for (const [key, media] of entries) {
    if (key !== media.exerciseId) {
      errors.push(`Chave '${key}' diverge do exerciseId '${media.exerciseId}'`);
    }

    // Thumbnail
    if (!media.thumbnail) {
      errors.push(`Exercício '${key}' não possui thumbnail`);
    } else {
      if (!media.thumbnail.url) errors.push(`Thumbnail de '${key}' não tem url`);
      if (media.thumbnail.status !== 'approved') {
        warnings.push(`Thumbnail de '${key}' não está approved`);
      }
    }

    // Vídeo
    if (media.video) {
      const v = media.video;
      if (!v.id) errors.push(`Vídeo de '${key}' não tem id`);
      if (!v.url) errors.push(`Vídeo de '${key}' não tem url`);

      // D12: validação de proporção 9:16 e duração 6s (padrão) ou 10s (excepcional)
      const ratio = v.width / v.height;
      if (ratio > 0.65) {
        errors.push(`D12 violada: vídeo de '${key}' não está em 9:16 vertical (proporção: ${ratio.toFixed(2)})`);
      }
      if (v.durationSeconds !== undefined && v.durationSeconds !== 6 && v.durationSeconds !== 10) {
        errors.push(`D12 violada: duração do vídeo de '${key}' é ${v.durationSeconds}s; padrão oficial é 6s (ou excepcionalmente 10s para cadência longa)`);
      }

      // D13: proveniência verificável
      if (!v.provenance && !v.license) {
        errors.push(`D13 violada: vídeo de '${key}' não possui metadados de proveniência`);
      } else if (v.provenance) {
        if (!v.provenance.provider || !v.provenance.provider.trim()) {
          errors.push(`D13 violada: vídeo de '${key}' não possui provenance.provider válido`);
        }
        // Rejeita licença inventada
        if (v.provenance.termsOrLicenseRef?.includes('Higgsfield Commercial License v1 - GymFlow Proprietary') ||
            v.license?.includes('Higgsfield Commercial License v1 - GymFlow Proprietary')) {
          errors.push(`D13 violada: vídeo de '${key}' utiliza licença proprietária inventada ('Higgsfield Commercial License v1 - GymFlow Proprietary')`);
        }
      }

      // D13 & QA Gate: status 'approved' em vídeo só pode ser atribuído com evidência humana formal de aprovação
      if (v.status === 'approved') {
        validateVideoApproval(v.provenance?.approval, `vídeo de '${key}'`, errors);
        // GOAL-056 P2: nenhum vídeo approved pode atestar direitos comerciais sem evidência
        const termsRef = v.provenance?.termsOrLicenseRef;
        const legacyLicense = v.license;
        if ((typeof termsRef === 'string' && /commercial/i.test(termsRef)) ||
            (typeof legacyLicense === 'string' && /commercial/i.test(legacyLicense))) {
          errors.push(`D13/QA Gate violado: vídeo de '${key}' com afirmação comercial não comprovada em termsOrLicenseRef/licença (direitos/licença comercial não são atestados pelo manifest)`);
        }
        approvedVideos++;
      } else if (v.status === 'draft') {
        draftVideos++;
      } else if (v.status === 'retired') {
        retiredVideos++;
      }
    }
  }

  const contentFulfilled = approvedVideos >= 20;
  const contentAcceptance = {
    target: 20,
    achieved: approvedVideos,
    fulfilled: contentFulfilled,
    status: contentFulfilled ? ('fulfilled' as const) : ('pending_human_production' as const),
    message: contentFulfilled
      ? `LIBRARY §5 cumprido: ${approvedVideos} vídeos aprovados servidos.`
      : `LIBRARY §5: Arquitetura suporta >= 20 vídeos aprovados, mas o aceite de conteúdo permanece pendente de produção humana (${approvedVideos}/20 vídeos aprovados atualmente).`,
  };

  if (options.requireContentAcceptance && !contentFulfilled) {
    errors.push(contentAcceptance.message);
  } else if (!contentFulfilled) {
    warnings.push(contentAcceptance.message);
  }

  return {
    valid: errors.length === 0,
    totalAssets: entries.length,
    approvedVideosCount: approvedVideos,
    draftVideosCount: draftVideos,
    retiredVideosCount: retiredVideos,
    contentAcceptance,
    errors,
    warnings,
  };
}

/**
 * GOAL-056 — Validação honesta da aprovação de vídeo:
 * exige aprovador real + evidência rastreável, sem timestamp falso.
 * `approvedAt` só é aceito com precisão 'exact' e formato ISO 8601 válido;
 * precisão 'unknown' proíbe `approvedAt` (mtime de arquivo não é timestamp do evento).
 */
function validateVideoApproval(approval: unknown, path: string, errors: string[]): void {
  const a = approval as Partial<import('../../src/domain/media/types').MediaAssetApproval> | undefined;
  if (!a || typeof a !== 'object') {
    errors.push(`D13/QA Gate violado: ${path} marcado como 'approved' sem metadados de aprovação humana formal (approval)`);
    return;
  }
  if (typeof a.approvedBy !== 'string' || !a.approvedBy.trim()) {
    errors.push(`D13/QA Gate violado: ${path} marcado como 'approved' sem aprovador humano real (approvedBy)`);
  }
  if (typeof a.approvalEvidenceRef !== 'string' || !a.approvalEvidenceRef.trim()) {
    errors.push(`D13/QA Gate violado: ${path} marcado como 'approved' sem evidência de aprovação rastreável (approvalEvidenceRef)`);
  }
  const precision = (a as { approvedAtPrecision?: unknown }).approvedAtPrecision;
  if (precision !== 'exact' && precision !== 'unknown') {
    errors.push(`D13/QA Gate violado: ${path} marcado como 'approved' sem declaração honesta de precisão do timestamp (approvedAtPrecision: 'exact' | 'unknown')`);
    return;
  }
  if (precision === 'exact') {
    if (typeof a.approvedAt !== 'string' || !a.approvedAt.trim()) {
      errors.push(`D13/QA Gate violado: ${path} com metadado contraditório — approvedAtPrecision 'exact' exige approvedAt com o timestamp comprovado do evento`);
    } else if (Number.isNaN(Date.parse(a.approvedAt))) {
      errors.push(`D13/QA Gate violado: ${path} com approvedAt em formato inválido (ISO 8601 esperado): '${a.approvedAt}'`);
    }
  } else if (a.approvedAt !== undefined) {
    errors.push(`D13/QA Gate violado: ${path} com metadado contraditório — approvedAtPrecision 'unknown' proíbe approvedAt (timestamp do evento desconhecido; mtime de arquivo não é timestamp do evento)`);
  }
}
