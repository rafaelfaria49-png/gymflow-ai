import { describe, it, expect, beforeEach } from 'vitest';
import {
  getActiveManifest,
  getExerciseMedia,
  resetToDefaultManifest,
  setActiveManifest,
  validateMediaManifest,
} from './manifest';
import { MediaManifest } from './types';

describe('Manifest de Mídia (GOAL-34)', () => {
  beforeEach(() => {
    resetToDefaultManifest();
  });

  it('carrega o manifest baseline com version 4, schema 1.1.0, cdn real (Vercel Blob) e 2 vídeos aprovados reais', () => {
    const manifest = getActiveManifest();
    expect(manifest.version).toBe(4);
    expect(manifest.schemaVersion).toBe('1.1.0');
    // GOAL-053: cdnBaseUrl passou a apontar para a origem REAL (Vercel Blob public storage)
    expect(manifest.cdnBaseUrl).toBe('https://jmnpdtxahhb8xobk.public.blob.vercel-storage.com');

    const approvedVideos = Object.values(manifest.assets).filter(
      (a) => a.video && a.video.status === 'approved'
    );
    // GOAL-059: exatamente 2 vídeos com aprovação humana comprovada (back_remada_baixa + back_puxada_pulley)
    expect(approvedVideos.length).toBe(2);
    expect(approvedVideos.map((a) => a.exerciseId).sort()).toEqual(['back_puxada_pulley', 'back_remada_baixa']);
    const remada = approvedVideos.find((a) => a.exerciseId === 'back_remada_baixa')!;
    expect(remada.video?.url).toBe(
      'https://jmnpdtxahhb8xobk.public.blob.vercel-storage.com/back_remada_baixa_v1.mp4'
    );
    expect(remada.video?.checksum).toBe(
      'sha256:93fc1fa4cb1a68f266c7d98e2b09229194e238ce91dd063ce239c41fdd161732'
    );
    expect(remada.video?.provenance?.approval?.approvedBy).toBe('rafaelfaria49-png');
    // GOAL-056: aprovação comprovada sem timestamp falso — precisão 'unknown',
    // sem approvedAt (mtime não é timestamp do evento), evidência rastreável
    expect(remada.video?.provenance?.approval?.approvedAt).toBeUndefined();
    expect(remada.video?.provenance?.approval?.approvedAtPrecision).toBe('unknown');
    expect(remada.video?.provenance?.approval?.approvalEvidenceRef).toContain('GYMFLOW_VIDEO_SKILL');
    // GOAL-056: provider preservado sem model/run inventado; nenhum claim comercial
    expect(remada.video?.provenance?.provider).toBe('grok');
    expect(remada.video?.provenance?.modelOrWorkflow).toBeUndefined();
    expect(remada.video?.provenance?.termsOrLicenseRef).toBeUndefined();
    // GOAL-059: Puxada Alta publicada como approved v1, sem timestamp falso
    const puxada = getExerciseMedia('back_puxada_pulley');
    expect(puxada?.video?.status).toBe('approved');
    expect(puxada?.video?.url).toBe(
      'https://jmnpdtxahhb8xobk.public.blob.vercel-storage.com/back_puxada_pulley_v1.mp4'
    );
    expect(puxada?.video?.checksum).toBe(
      'sha256:3a995473ccf46d2addc6a9a7a236c684aa5b1b8a417406bfd4624438b2d0bbdf'
    );
    expect(puxada?.video?.width).toBe(1080);
    expect(puxada?.video?.height).toBe(1920);
    expect(puxada?.video?.fps).toBe(24);
    expect(puxada?.video?.codec).toBe('h264');
    expect(puxada?.video?.bytes).toBe(4148838);
    expect(puxada?.video?.provenance?.provider).toBe('grok');
    expect(puxada?.video?.provenance?.modelOrWorkflow).toBeUndefined();
    expect(puxada?.video?.provenance?.termsOrLicenseRef).toBeUndefined();
    expect(puxada?.video?.provenance?.approval?.approvedBy).toBe('rafaelfaria49-png');
    expect(puxada?.video?.provenance?.approval?.approvedAt).toBeUndefined();
    expect(puxada?.video?.provenance?.approval?.approvedAtPrecision).toBe('unknown');
    expect(puxada?.video?.provenance?.approval?.approvalEvidenceRef).toContain('GYMFLOW_VIDEO_INGEST_059');

    const draftVideos = Object.values(manifest.assets).filter(
      (a) => a.video && a.video.status === 'draft'
    );
    expect(draftVideos.length).toBeGreaterThanOrEqual(20);
  });

  it('obtém mídia de exercício existente por ID com proveniência factual', () => {
    const media = getExerciseMedia('chest_supino_reto');
    expect(media).not.toBeNull();
    expect(media?.exerciseId).toBe('chest_supino_reto');
    expect(media?.video?.status).toBe('draft');
    expect(media?.video?.provenance?.provider).toBe('higgsfield');
    expect(media?.video?.provenance?.termsOrLicenseRef).toContain('Higgsfield Terms of Service');
    expect(media?.thumbnail?.provenance?.provider).toBe('gymflow_catalog');
  });

  it('retorna null para exercício inexistente no manifest', () => {
    const media = getExerciseMedia('exercicio_inexistente_xyz');
    expect(media).toBeNull();
  });

  it('manifest bump: troca URL e versão do vídeo dinamicamente sem release do app', () => {
    const current = getActiveManifest();
    const upgraded: MediaManifest = JSON.parse(JSON.stringify(current));
    upgraded.version = 3;
    upgraded.assets['chest_supino_reto'].video = {
      id: 'vid_chest_supino_reto_v2',
      url: 'https://assets.gymflow.ai/media/videos/chest_supino_reto_v2.mp4',
      bytes: 1750000,
      width: 720,
      height: 1280,
      durationSeconds: 6,
      repCount: 2,
      fps: 24,
      codec: 'h264',
      version: 2,
      status: 'approved',
      provenance: {
        provider: 'higgsfield',
        modelOrWorkflow: 'character_soul_kai_v2',
        generatedAt: '2026-09-02T19:00:00.000Z',
        approval: {
          approvedBy: 'coach_lead_human_gymflow',
          approvedAt: '2026-09-02T19:30:00.000Z',
          approvedAtPrecision: 'exact',
          approvalEvidenceRef: 'human-review-log 2026-09-02 (biomechanical review, 2 reps @24fps)',
          notes: 'Aprovado após revisão biomecânica humana.',
        },
      },
      contentType: 'video/mp4',
    };

    setActiveManifest(upgraded);

    const active = getActiveManifest();
    expect(active.version).toBe(3);
    const updatedMedia = getExerciseMedia('chest_supino_reto');
    expect(updatedMedia?.video?.version).toBe(2);
    expect(updatedMedia?.video?.url).toBe('https://assets.gymflow.ai/media/videos/chest_supino_reto_v2.mp4');
    expect(updatedMedia?.video?.status).toBe('approved');
  });

  it('rejeita manifest malformado estruturalmente', () => {
    const invalidManifest = {
      version: 0,
      schemaVersion: '',
      cdnBaseUrl: 'not-a-url',
      assets: {},
    };

    const res = validateMediaManifest(invalidManifest);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('valida rejeição quando exigido critério de conteúdo de >=20 vídeos aprovados', () => {
    const current = getActiveManifest();
    const res = validateMediaManifest(current, { requireContentAcceptance: true });
    // Falha quando exigido o critério de conteúdo porque o repositório não tem 20 vídeos aprovados ainda
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('LIBRARY §5 violado'))).toBe(true);
    expect(res.contentAcceptance.status).toBe('pending_human_production');
  });

  describe('Proveniência de aprovação honesta (GOAL-056)', () => {
    function manifestWithRemadaProvenance(overrides: Record<string, unknown> = {}) {
      const current = getActiveManifest();
      const clone: MediaManifest = JSON.parse(JSON.stringify(current));
      const video = clone.assets['back_remada_baixa'].video!;
      // Base honesta: aprovação comprovada sem timestamp exato
      video.provenance = {
        provider: 'grok',
        provenanceNotes: 'Direitos/licenca comercial nao atestados por este manifest.',
        approval: {
          approvedBy: 'rafaelfaria49-png',
          approvedAtPrecision: 'unknown',
          approvalEvidenceRef: 'GYMFLOW_VIDEO_SKILL (1).md, secao 8',
        },
      };
      Object.assign(video, overrides);
      return clone;
    }

    it('aceita aprovação com timestamp exato comprovado', () => {
      const manifest = manifestWithRemadaProvenance({
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
      const res = validateMediaManifest(manifest);
      expect(res.valid).toBe(true);
    });

    it('aceita aprovação comprovada sem timestamp exato (precisão unknown, sem approvedAt)', () => {
      const manifest = manifestWithRemadaProvenance();
      const res = validateMediaManifest(manifest);
      expect(res.valid).toBe(true);
      expect(res.approvedVideoCount).toBe(2);
    });

    it('rejeita approved sem evidência rastreável', () => {
      const noEvidence = manifestWithRemadaProvenance({
        provenance: {
          provider: 'grok',
          approval: {
            approvedBy: 'rafaelfaria49-png',
            approvedAtPrecision: 'unknown',
          },
        },
      });
      expect(validateMediaManifest(noEvidence).valid).toBe(false);
      expect(validateMediaManifest(noEvidence).errors.some((e) => e.includes('approvalEvidenceRef'))).toBe(true);

      const noApprover = manifestWithRemadaProvenance({
        provenance: {
          provider: 'grok',
          approval: {
            approvedBy: '  ',
            approvedAtPrecision: 'unknown',
            approvalEvidenceRef: 'GYMFLOW_VIDEO_SKILL (1).md, secao 8',
          },
        },
      });
      expect(validateMediaManifest(noApprover).valid).toBe(false);
      expect(validateMediaManifest(noApprover).errors.some((e) => e.includes('approvedBy'))).toBe(true);

      const noApproval = manifestWithRemadaProvenance({
        provenance: { provider: 'grok' },
      });
      expect(validateMediaManifest(noApproval).valid).toBe(false);
    });

    it('rejeita approved com metadado contraditório', () => {
      // unknown + approvedAt presente (ex.: mtime reaproveitado) = contradição
      const mtimeReuse = manifestWithRemadaProvenance({
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
      const resMtime = validateMediaManifest(mtimeReuse);
      expect(resMtime.valid).toBe(false);
      expect(resMtime.errors.some((e) => e.includes('contraditório'))).toBe(true);

      // exact sem approvedAt = contradição
      const exactWithoutAt = manifestWithRemadaProvenance({
        provenance: {
          provider: 'grok',
          approval: {
            approvedBy: 'rafaelfaria49-png',
            approvedAtPrecision: 'exact',
            approvalEvidenceRef: 'human-review-log 2026-09-10',
          },
        },
      });
      expect(validateMediaManifest(exactWithoutAt).valid).toBe(false);

      // approvedAt malformado = inválido
      const malformed = manifestWithRemadaProvenance({
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
      const resMalformed = validateMediaManifest(malformed);
      expect(resMalformed.valid).toBe(false);
      expect(resMalformed.errors.some((e) => e.includes('formato inválido'))).toBe(true);
    });

    it('rejeita afirmação comercial não comprovada em vídeo approved', () => {
      const commercial = manifestWithRemadaProvenance({
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
      const res = validateMediaManifest(commercial);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('comercial não comprovada'))).toBe(true);
    });
  });
});
