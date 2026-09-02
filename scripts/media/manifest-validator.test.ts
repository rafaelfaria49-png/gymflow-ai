import { describe, it, expect } from 'vitest';
import manifestJson from '../../src/domain/media/manifest.json';
import { validateManifestFile } from './manifest-validator';
import { MediaManifest } from '../../src/domain/media/types';

describe('Validador de Manifest de Mídia (GOAL-34 & LIBRARY §2–5)', () => {
  it('valida que o manifest inicial do repo cumpre 100% dos requisitos de LIBRARY §2–5', () => {
    const report = validateManifestFile(manifestJson as MediaManifest);

    if (!report.valid) {
      console.error('Erros no manifest:', report.errors);
    }

    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.approvedVideosCount).toBeGreaterThanOrEqual(20);
    expect(report.draftVideosCount).toBeGreaterThanOrEqual(1); // Garante que há draft para teste de QA gate
  });

  it('falha na validação se a licença comercial (D13) for removida de um vídeo', () => {
    const corrupted = JSON.parse(JSON.stringify(manifestJson)) as MediaManifest;
    const firstKey = Object.keys(corrupted.assets)[0];
    if (corrupted.assets[firstKey]?.video) {
      corrupted.assets[firstKey].video!.license = '';
    }

    const report = validateManifestFile(corrupted);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes('D13 violada'))).toBe(true);
  });

  it('falha na validação se houver menos de 20 vídeos aprovados', () => {
    const reduced = JSON.parse(JSON.stringify(manifestJson)) as MediaManifest;
    let count = 0;
    for (const key of Object.keys(reduced.assets)) {
      if (reduced.assets[key].video && reduced.assets[key].video!.status === 'approved') {
        if (count >= 10) {
          reduced.assets[key].video!.status = 'draft';
        }
        count++;
      }
    }

    const report = validateManifestFile(reduced);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes('LIBRARY §5 violado'))).toBe(true);
  });
});
