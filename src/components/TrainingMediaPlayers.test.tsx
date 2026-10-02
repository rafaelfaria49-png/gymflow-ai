import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExerciseMediaUnifiedPlayer } from './ExerciseMediaUnifiedPlayer';
import { TechniqueSequencePlayer } from './TechniqueSequencePlayer';
import { getTechniqueVideoIdForExerciseId } from '../lib/exerciseTechniqueMap';
import type { Exercise, TechniqueFrame } from '../types';
import type { ExerciseMedia } from '../domain/media/types';
import manifest from '../domain/media/manifest.json';

vi.mock('../domain/media/manifest', async () => ({
  ...await vi.importActual<typeof import('../domain/media/manifest')>('../domain/media/manifest'),
  getExerciseMedia: () => null,
}));
vi.mock('../domain/media/telemetry', () => ({ recordMediaTelemetryEvent: vi.fn() }));
const renderers: TestRenderer.ReactTestRenderer[] = [];
beforeEach(() => vi.stubGlobal('window', new EventTarget()));
afterEach(() => {
  for (const renderer of renderers.splice(0)) act(() => renderer.unmount());
  vi.unstubAllGlobals();
});
function text(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return text((node as { children?: unknown }).children);
}
const frames: TechniqueFrame[] = [1,2].map(i => ({ image: '/own-' + i + '.jpg', label: 'Etapa ' + i, cue: 'Controle o movimento.', order: i }));
function exercise(id: string, techniqueFrames = frames): Exercise {
  return { id, name: id, techniqueFrames, muscleGroup: 'back', equipment: 'Halteres', thumbnail: '', level: 'beginner',
    executionSteps: [], postureTips: [], breathing: '', commonErrors: [], errorCorrections: [], variations: [], substitutions: [], safetyWarnings: [] };
}
function mount(node: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(node); });
  renderers.push(renderer);
  return renderer;
}

describe('players e mapa GOAL-119', () => {
  it('exercício sem mapeamento não abre supino', () => {
    expect(getTechniqueVideoIdForExerciseId('back_remada_baixa')).toBeNull();
    expect(getTechniqueVideoIdForExerciseId('chest_supino_reto')).toBe('vid_supino_1');
  });
  it('player unificado reseta índice quando exercício muda e quando frame falha', () => {
    const renderer = mount(<ExerciseMediaUnifiedPlayer exercise={exercise('first')} autoplay={false} />);
    act(() => renderer.root.findByProps({ 'aria-label': 'Próxima etapa' }).props.onClick());
    expect(text(renderer.toJSON())).toContain('2/2');
    act(() => renderer.root.findByType('img').props.onError());
    expect(text(renderer.toJSON())).toContain('1/1');
    expect(renderer.root.findByType('img').props.src).toBe('/own-1.jpg');
    act(() => renderer.update(<ExerciseMediaUnifiedPlayer exercise={exercise('second', [{...frames[0],image:'/second.jpg'}])} autoplay={false} />));
    expect(text(renderer.toJSON())).toContain('1/1');
    expect(renderer.root.findByType('img').props.src).toBe('/second.jpg');
    act(() => renderer.root.findByType('img').props.onError());
    expect(text(renderer.toJSON())).not.toMatch(/\d\/0|2\/1/);
    expect(text(renderer.toJSON())).toContain('Vídeo técnico ainda não disponível');
  });
  it('usa somente imagens próprias existentes se não houver frames nem vídeo', () => {
    const renderer = mount(<ExerciseMediaUnifiedPlayer exercise={{...exercise('images', []), images: ['/self.jpg']}} autoplay={false} />);
    expect(renderer.root.findByType('img').props.src).toBe('/self.jpg');
  });
  it('descarta mídia direta de outro exercício e mantém o fallback do selecionado', () => {
    const renderer = mount(<ExerciseMediaUnifiedPlayer exercise={exercise('chest_supino_reto')} media={manifest.assets.back_remada_baixa as ExerciseMedia} autoplay={false} />);
    expect(renderer.root.findAllByType('video')).toHaveLength(0);
    expect(renderer.root.findByType('img').props.src).toBe('/own-1.jpg');
  });
  it('não renderiza thumbnail nem vídeo de um registro histórico recebido diretamente', () => {
    const renderer = mount(<ExerciseMediaUnifiedPlayer media={manifest.historicalAssets.back_puxada_atras as ExerciseMedia} autoplay={false} />);
    expect(renderer.root.findAllByType('video')).toHaveLength(0);
    expect(renderer.root.findAllByType('img')).toHaveLength(0);
    expect(text(renderer.toJSON())).toContain('Vídeo técnico ainda não disponível');
  });
  it('player de sequência remove frames quebrados e não conta imagens inexistentes', () => {
    const renderer = mount(<TechniqueSequencePlayer frames={frames} autoplay={false} />);
    act(() => renderer.root.findByProps({ 'aria-label': 'Próxima etapa' }).props.onClick());
    expect(text(renderer.toJSON())).toContain('2/2');
    act(() => renderer.root.findByType('img').props.onError());
    expect(text(renderer.toJSON())).toContain('1/1');
    act(() => renderer.update(<TechniqueSequencePlayer frames={[]} autoplay={false} />));
    expect(text(renderer.toJSON())).not.toMatch(/\d\/0/);
    expect(renderer.root.findAllByType('img')).toHaveLength(0);
  });
});
