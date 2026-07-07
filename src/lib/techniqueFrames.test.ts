import { describe, expect, it } from 'vitest';
import { getTechniqueFrames } from './techniqueFrames';

describe('getTechniqueFrames', () => {
  it('usa techniqueFrames quando há 3 ou mais etapas', () => {
    const frames = getTechniqueFrames({
      images: ['/fallback/0.jpg', '/fallback/1.jpg'],
      techniqueFrames: [
        { image: '/seq/03.jpg', label: 'Meio', cue: 'Controle a fase central.', order: 3 },
        { image: '/seq/01.jpg', label: 'Base', cue: 'Monte a posição inicial.', order: 1 },
        { image: '/seq/02.jpg', label: 'Saída', cue: 'Inicie sem impulso.', order: 2 }
      ]
    });

    expect(frames).toHaveLength(3);
    expect(frames.map((frame) => frame.image)).toEqual(['/seq/01.jpg', '/seq/02.jpg', '/seq/03.jpg']);
    expect(frames[0].label).toBe('Base');
  });

  it('gera 2 frames honestos quando o exercício tem 2 imagens', () => {
    const frames = getTechniqueFrames({
      images: ['/assets/exercises/chest_supino_reto/0.jpg', '/assets/exercises/chest_supino_reto/1.jpg'],
      executionSteps: ['Deite-se no banco com os pés firmes.', 'Desça a barra com controle.']
    });

    expect(frames).toHaveLength(2);
    expect(frames[0].label).toBe('Posição inicial');
    expect(frames[1].label).toBe('Execução / posição final');
    expect(frames[0].cue).toContain('banco');
  });

  it('gera labels corretos quando o exercício tem 5 imagens', () => {
    const frames = getTechniqueFrames({
      images: ['/0.jpg', '/1.jpg', '/2.jpg', '/3.jpg', '/4.jpg'],
      executionSteps: ['Ajuste a base.', 'Inicie o movimento.', 'Passe pelo meio.', 'Contraia no final.', 'Retorne controlando.']
    });

    expect(frames.map((frame) => frame.label)).toEqual([
      'Posição inicial',
      'Início do movimento',
      'Meio da execução',
      'Contração / posição final',
      'Retorno controlado'
    ]);
  });

  it('retorna fallback seguro quando não há imagens', () => {
    const frames = getTechniqueFrames({ name: 'Exercício criado no Admin' });

    expect(frames).toHaveLength(1);
    expect(frames[0].image).toBe('');
    expect(frames[0].label).toBe('Referência técnica');
    expect(frames[0].cue).toMatch(/Demonstração 3D em breve/i);
  });

  it('não crasha com dados incompletos', () => {
    expect(() => getTechniqueFrames(null)).not.toThrow();
    expect(getTechniqueFrames({ images: ['', '  '] })).toHaveLength(1);
  });
});
