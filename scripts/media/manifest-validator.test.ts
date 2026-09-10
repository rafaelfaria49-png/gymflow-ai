import { describe, it, expect } from 'vitest';
import manifestJson from '../../src/domain/media/manifest.json';
import { validateManifestFile } from './manifest-validator';
import { MediaManifest } from '../../src/domain/media/types';

describe('Validador de Manifest de Mídia (GOAL-34 & Decisões D11–D14)', () => {
  it('valida que o manifest inicial do repo é estruturalmente válido e reporta honestamente o status real dos assets', () => {
    const report = validateManifestFile(manifestJson as unknown as MediaManifest);

    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
    // GOAL-053: 1 vídeo aprovado real (back_remada_baixa) com aprovação humana comprovada
    expect(report.approvedVideosCount).toBe(1);
    expect(report.draftVideosCount).toBeGreaterThanOrEqual(20);
    // Reporta explicitamente pendência de produção de conteúdo
    expect(report.contentAcceptance.fulfilled).toBe(false);
    expect(report.contentAcceptance.status).toBe('pending_human_production');
    expect(report.contentAcceptance.message).toContain('pendente de produção humana');
  });

  it('suporta e valida integralmente o requisito de >= 20 vídeos reais aprovados quando o lote for produzido', () => {
    const mockApprovedManifest = JSON.parse(JSON.stringify(manifestJson)) as MediaManifest;
    let count = 0;
    for (const key of Object.keys(mockApprovedManifest.assets)) {
      if (mockApprovedManifest.assets[key]?.video && count < 20) {
        mockApprovedManifest.assets[key].video!.status = 'approved';
        mockApprovedManifest.assets[key].video!.provenance = {
          provider: 'higgsfield',
          modelOrWorkflow: 'character_soul_kai_v2',
          generatedAt: '2026-09-02T19:00:00.000Z',
          approval: {
            approvedBy: 'coach_lead_human_gymflow',
            approvedAt: '2026-09-02T19:30:00.000Z',
            approvedAtPrecision: 'exact',
            approvalEvidenceRef: 'human-review-log 2026-09-02 (biomechanical review, 2 reps @24fps)',
            notes: 'Revisão biomecânica aprovada em 2 reps a 24fps sem aceleração artificial.',
          },
        };
        count++;
      }
    }

    const report = validateManifestFile(mockApprovedManifest, { requireContentAcceptance: true });
    expect(report.valid).toBe(true);
    expect(report.approvedVideosCount).toBe(20);
    expect(report.contentAcceptance.fulfilled).toBe(true);
    expect(report.contentAcceptance.status).toBe('fulfilled');
  });

  it('QA Gate (D13): rejeita vídeo marcado como approved sem evidência de aprovação humana formal', () => {
    const corrupted = JSON.parse(JSON.stringify(manifestJson)) as MediaManifest;
    const firstKey = Object.keys(corrupted.assets)[0];
    if (corrupted.assets[firstKey]?.video) {
      // Tenta promover artificialmente a approved sem fluxo humano
      corrupted.assets[firstKey].video!.status = 'approved';
      delete corrupted.assets[firstKey].video!.provenance?.approval;
    }

    const report = validateManifestFile(corrupted);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes('D13/QA Gate violado'))).toBe(true);
  });

  it('D13: rejeita uso de licença inventada ("Higgsfield Commercial License v1 - GymFlow Proprietary")', () => {
    const corrupted = JSON.parse(JSON.stringify(manifestJson)) as MediaManifest;
    const firstKey = Object.keys(corrupted.assets)[0];
    if (corrupted.assets[firstKey]?.video) {
      corrupted.assets[firstKey].video!.provenance = {
        provider: 'higgsfield',
        termsOrLicenseRef: 'Higgsfield Commercial License v1 - GymFlow Proprietary',
      };
    }

    const report = validateManifestFile(corrupted);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes('licença proprietária inventada'))).toBe(true);
  });

  it('D12: valida proporção 9:16 vertical e duração padrão (6s) ou excepcional (10s), rejeitando durações fora da norma', () => {
    const corrupted = JSON.parse(JSON.stringify(manifestJson)) as MediaManifest;
    const firstKey = Object.keys(corrupted.assets)[0];
    if (corrupted.assets[firstKey]?.video) {
      corrupted.assets[firstKey].video!.durationSeconds = 4.8; // Norma antiga rejeitada
    }

    const report = validateManifestFile(corrupted);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes('D12 violada'))).toBe(true);
  });

  describe('Proveniência de aprovação honesta (GOAL-056)', () => {
    function remadaVideoPatch(patch: Record<string, unknown>) {
      const clone = JSON.parse(JSON.stringify(manifestJson)) as MediaManifest;
      Object.assign(clone.assets['back_remada_baixa'].video!, patch);
      return clone;
    }

    it('aceita aprovação com timestamp exato comprovado', () => {
      const manifest = remadaVideoPatch({
        provenance: {
          provider: 'grok',
          approval: {
            approvedBy: 'rafaelfaria49-png',
            approvedAt: '2026-09-10T12:00:00.000Z',
            approvedAtPrecision: 'exact',
            approvalEvidenceRef: 'human-review-log 2026-09-10 (aprovacao registrada com horario)',
          },
        },
      });
      const report = validateManifestFile(manifest);
      expect(report.valid).toBe(true);
    });

    it('aceita aprovação comprovada sem timestamp exato (baseline real: precisão unknown, sem approvedAt)', () => {
      const report = validateManifestFile(manifestJson as unknown as MediaManifest);
      expect(report.valid).toBe(true);
      const approval = (manifestJson as unknown as MediaManifest).assets['back_remada_baixa'].video!
        .provenance!.approval as unknown as Record<string, unknown>;
      expect(approval['approvedAt']).toBeUndefined();
      expect(approval['approvedAtPrecision']).toBe('unknown');
      expect(String(approval['approvalEvidenceRef'])).toContain('GYMFLOW_VIDEO_SKILL');
    });

    it('rejeita approved sem evidência rastreável', () => {
      const noEvidence = remadaVideoPatch({
        provenance: {
          provider: 'grok',
          approval: {
            approvedBy: 'rafaelfaria49-png',
            approvedAtPrecision: 'unknown',
          },
        },
      });
      const reportNoEvidence = validateManifestFile(noEvidence);
      expect(reportNoEvidence.valid).toBe(false);
      expect(reportNoEvidence.errors.some((e) => e.includes('approvalEvidenceRef'))).toBe(true);

      const noApproval = remadaVideoPatch({ provenance: { provider: 'grok' } });
      const reportNoApproval = validateManifestFile(noApproval);
      expect(reportNoApproval.valid).toBe(false);
      expect(reportNoApproval.errors.some((e) => e.includes('D13/QA Gate violado'))).toBe(true);
    });

    it('rejeita approved com metadado contraditório (unknown + approvedAt, exact sem approvedAt, formato inválido)', () => {
      const mtimeReuse = remadaVideoPatch({
        provenance: {
          provider: 'grok',
          approval: {
            approvedBy: 'rafaelfaria49-png',
            approvedAt: '2026-08-14T18:26:08.526Z',
            approvedAtPrecision: 'unknown',
            approvalEvidenceRef: 'GYMFLOW_VIDEO_SKILL (1).md, secao 8',
          },
        },
      });
      const reportMtime = validateManifestFile(mtimeReuse);
      expect(reportMtime.valid).toBe(false);
      expect(reportMtime.errors.some((e) => e.includes('contraditório'))).toBe(true);

      const exactWithoutAt = remadaVideoPatch({
        provenance: {
          provider: 'grok',
          approval: {
            approvedBy: 'rafaelfaria49-png',
            approvedAtPrecision: 'exact',
            approvalEvidenceRef: 'human-review-log 2026-09-10',
          },
        },
      });
      expect(validateManifestFile(exactWithoutAt).valid).toBe(false);

      const malformed = remadaVideoPatch({
        provenance: {
          provider: 'grok',
          approval: {
            approvedBy: 'rafaelfaria49-png',
            approvedAt: 'ontem à tarde',
            approvedAtPrecision: 'exact',
            approvalEvidenceRef: 'human-review-log 2026-09-10',
          },
        },
      });
      const reportMalformed = validateManifestFile(malformed);
      expect(reportMalformed.valid).toBe(false);
      expect(reportMalformed.errors.some((e) => e.includes('formato inválido'))).toBe(true);
    });

    it('rejeita afirmação comercial não comprovada em vídeo approved', () => {
      const commercial = remadaVideoPatch({
        provenance: {
          provider: 'grok',
          termsOrLicenseRef: 'X.AI Grok Terms of Service (commercial generation)',
          approval: {
            approvedBy: 'rafaelfaria49-png',
            approvedAtPrecision: 'unknown',
            approvalEvidenceRef: 'GYMFLOW_VIDEO_SKILL (1).md, secao 8',
          },
        },
      });
      const report = validateManifestFile(commercial);
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.includes('comercial não comprovada'))).toBe(true);
    });
  });
});
