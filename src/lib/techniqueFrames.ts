import { Exercise, TechniqueFrame } from '../types';

type TechniqueFrameSource = Partial<
  Pick<
    Exercise,
    | 'name'
    | 'images'
    | 'techniqueFrames'
    | 'executionSteps'
    | 'postureTips'
    | 'commonErrors'
    | 'errorCorrections'
    | 'breathing'
  >
> & {
  instruction?: string[];
  instructions?: string[];
  tips?: string[];
  commonMistakes?: string[];
  corrections?: string[];
};

const FALLBACK_CUE =
  'Use como referência visual provisória e priorize controle, postura neutra e carga adequada ao seu nível.';

const EMPTY_IMAGE_CUE =
  'Sequência visual provisória indisponível para este exercício. Demonstração 3D em breve; use as instruções como referência técnica.';

const TWO_FRAME_LABELS = ['Posição inicial', 'Execução / posição final'];

const DEFAULT_FRAME_LABELS = [
  'Posição inicial',
  'Início do movimento',
  'Meio da execução',
  'Contração / posição final',
  'Retorno controlado'
];

const sanitizeList = (items?: readonly string[]) =>
  (items ?? []).map((item) => item.trim()).filter(Boolean);

const firstText = (...items: Array<string | undefined>) =>
  items.find((item) => item && item.trim().length > 0)?.trim();

const byOrder = (a: TechniqueFrame, b: TechniqueFrame) => a.order - b.order;

const safeCue = (cue?: string) => firstText(cue) ?? FALLBACK_CUE;

const getProvidedFrames = (frames?: TechniqueFrame[]): TechniqueFrame[] | null => {
  const normalized = (frames ?? [])
    .map((frame, index) => ({
      image: frame.image?.trim() ?? '',
      label: firstText(frame.label) ?? DEFAULT_FRAME_LABELS[index] ?? `Etapa ${index + 1}`,
      cue: safeCue(frame.cue),
      order: Number.isFinite(frame.order) ? frame.order : index + 1
    }))
    .sort(byOrder)
    .map((frame, index) => ({ ...frame, order: index + 1 }));

  return normalized.length >= 3 ? normalized : null;
};

const cueFromTechnique = (exercise: TechniqueFrameSource, frameIndex: number, totalFrames: number) => {
  const instructions = [
    ...sanitizeList(exercise.instruction),
    ...sanitizeList(exercise.instructions),
    ...sanitizeList(exercise.executionSteps)
  ];
  const tips = [...sanitizeList(exercise.tips), ...sanitizeList(exercise.postureTips)];
  const corrections = [...sanitizeList(exercise.corrections), ...sanitizeList(exercise.errorCorrections)];
  const mistakes = [...sanitizeList(exercise.commonMistakes), ...sanitizeList(exercise.commonErrors)];

  if (totalFrames === 2) {
    return safeCue(
      frameIndex === 0
        ? firstText(instructions[0], tips[0])
        : firstText(instructions[1], instructions[instructions.length - 1], corrections[0], exercise.breathing)
    );
  }

  const correctionCue = corrections[0]
    ? `Correção técnica: ${corrections[0]}`
    : mistakes[0]
    ? `Evite: ${mistakes[0]}`
    : undefined;

  const cues = [
    firstText(instructions[0], tips[0]),
    firstText(instructions[1], tips[1], exercise.breathing),
    firstText(instructions[2], tips[0]),
    firstText(instructions[3], instructions[instructions.length - 1], exercise.breathing, correctionCue),
    firstText(instructions[4], correctionCue, tips[1])
  ];

  return safeCue(cues[frameIndex]);
};

const labelForImageFrame = (index: number, totalFrames: number) => {
  if (totalFrames === 2) return TWO_FRAME_LABELS[index];
  return DEFAULT_FRAME_LABELS[index] ?? `Etapa ${index + 1}`;
};

export function getTechniqueFrames(exercise?: TechniqueFrameSource | null): TechniqueFrame[] {
  const provided = getProvidedFrames(exercise?.techniqueFrames);
  if (provided) return provided;

  const images = sanitizeList(exercise?.images);
  if (images.length === 0) {
    return [
      {
        image: '',
        label: 'Referência técnica',
        cue: EMPTY_IMAGE_CUE,
        order: 1
      }
    ];
  }

  return images.map((image, index) => ({
    image,
    label: labelForImageFrame(index, images.length),
    cue: cueFromTechnique(exercise ?? {}, index, images.length),
    order: index + 1
  }));
}
