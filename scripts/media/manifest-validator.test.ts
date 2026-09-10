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
          termsOrLicenseRef: 'Higgsfield Terms of Service (Commercial Generation)',
          approval: {
            approvedBy: 'coach_lead_human_gymflow',
            approvedAt: '2026-09-02T19:30:00.000Z',
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
});
