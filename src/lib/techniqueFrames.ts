import { Exercise, TechniqueFrame } from '../types';

type TechniqueFrameSource = Partial<
  Pick<
    Exercise,
    | 'id'
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

export const TECHNIQUE_BATCH_001_EXERCISE_IDS = [
  'chest_supino_reto',
  'chest_supino_inclinado_haltere',
  'back_puxada_pulley',
  'back_remada_baixa',
  'biceps_rosca_direta',
  'triceps_polia_corda',
  'legs_agachamento_barra',
  'legs_legpress_45',
  'shoulder_desenvolvimento_haltere',
  'shoulder_elevecao_lateral'
] as const;

type TechniqueBatch001ExerciseId = (typeof TECHNIQUE_BATCH_001_EXERCISE_IDS)[number];

const TECHNIQUE_BATCH_001_CUES: Record<TechniqueBatch001ExerciseId, readonly [string, string, string, string, string]> = {
  chest_supino_reto: [
    'Pés firmes, escápulas retraídas e barra alinhada ao meio do peito antes de iniciar.',
    'Desça a barra com controle, mantendo punhos neutros e cotovelos em ângulo seguro.',
    'Mantenha antebraços quase verticais e a barra na trajetória do peito médio.',
    'Toque o peito sem rebote; corpo firme no banco e ombros protegidos.',
    'Empurre na mesma linha, expirando sem perder a retração das escápulas.'
  ],
  chest_supino_inclinado_haltere: [
    'Banco entre 30 e 45 graus, pés firmes e halteres alinhados ao peito superior.',
    'Inicie a subida com punhos retos e cotovelos sob os halteres.',
    'No meio do movimento, mantenha antebraços verticais e ombros estáveis.',
    'Pare no topo sem bater os halteres e sem travar agressivamente os cotovelos.',
    'Desça com controle até alongar o peitoral sem perder a postura do banco.'
  ],
  back_puxada_pulley: [
    'Sente-se firme, prenda as coxas e comece com braços estendidos e peito aberto.',
    'Inicie baixando as escápulas antes de dobrar os cotovelos.',
    'Puxe com cotovelos apontando para baixo, sem balançar o tronco.',
    'Leve a barra ao peito superior pela frente, nunca atrás da nuca.',
    'Retorne devagar até alongar as dorsais sem soltar o peso.'
  ],
  back_remada_baixa: [
    'Coluna alta, joelhos semiflexionados e braços estendidos com o cabo tensionado.',
    'Comece retraindo as escápulas, mantendo ombros longe das orelhas.',
    'Puxe o triângulo ao umbigo inferior com tronco quase parado.',
    'Contraia no final com cotovelos para trás e peito aberto.',
    'Estenda os braços à frente sem arredondar a lombar.'
  ],
  biceps_rosca_direta: [
    'Fique alto, cotovelos colados ao tronco e punhos neutros na barra W.',
    'Suba a barra sem jogar o quadril para frente.',
    'No meio da subida, mantenha ombros imóveis e cotovelos fixos.',
    'Contraia no topo sem deixar os cotovelos avançarem demais.',
    'Desça lentamente até quase estender os braços, preservando tensão.'
  ],
  triceps_polia_corda: [
    'Dê um pequeno passo para trás, incline levemente o tronco e fixe os cotovelos.',
    'Empurre a corda para baixo movendo apenas os antebraços.',
    'Mantenha ombros relaxados e cotovelos junto às costelas no meio da descida.',
    'Estenda os braços e abra a corda no final sem usar o peso do corpo.',
    'Retorne devagar até pouco acima de 90 graus, sem deixar a polia puxar bruscamente.'
  ],
  legs_agachamento_barra: [
    'Barra apoiada no trapézio, core firme, pés na largura dos ombros e olhar à frente.',
    'Comece levando quadril para trás e joelhos na direção da ponta dos pés.',
    'Controle o meio da descida com calcanhares apoiados e coluna neutra.',
    'Desça até uma profundidade segura sem perder alinhamento dos joelhos.',
    'Suba com peito e quadril juntos, mantendo o core ativo.'
  ],
  legs_legpress_45: [
    'Costas e quadril apoiados, pés firmes na plataforma e joelhos levemente flexionados.',
    'Desça a plataforma com joelhos acompanhando a linha dos pés.',
    'No meio da descida, mantenha o quadril colado ao encosto.',
    'Pare antes de a lombar arredondar ou o quadril descolar do banco.',
    'Empurre sem travar os joelhos de forma brusca no final.'
  ],
  shoulder_desenvolvimento_haltere: [
    'Sente-se com costas apoiadas, halteres na altura dos ombros e punhos retos.',
    'Inicie a subida com antebraços verticais e core firme.',
    'Passe pelo meio mantendo os halteres controlados e sem arquear a lombar.',
    'Finalize acima da cabeça sem bater os halteres nem travar agressivamente.',
    'Desça até a linha das orelhas com controle e ombros estáveis.'
  ],
  shoulder_elevecao_lateral: [
    'Fique em pé com leve inclinação do tronco, halteres ao lado e core firme.',
    'Comece a elevar pelos cotovelos, sem impulso do quadril.',
    'No meio da subida, mantenha cotovelos levemente flexionados e punhos neutros.',
    'Pare na altura dos ombros, sem encolher o trapézio.',
    'Desça devagar até os halteres voltarem ao lado do corpo.'
  ]
};

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

const isTechniqueBatch001ExerciseId = (exerciseId?: string): exerciseId is TechniqueBatch001ExerciseId =>
  Boolean(exerciseId && (TECHNIQUE_BATCH_001_EXERCISE_IDS as readonly string[]).includes(exerciseId));

const techniqueSequencePath = (exerciseId: TechniqueBatch001ExerciseId, frameIndex: number) =>
  `/assets/exercises/${exerciseId}/sequence/step-${String(frameIndex + 1).padStart(2, '0')}.jpg`;

export const getTechniqueBatch001Frames = (exerciseId?: string): TechniqueFrame[] | null => {
  if (!isTechniqueBatch001ExerciseId(exerciseId)) return null;

  return TECHNIQUE_BATCH_001_CUES[exerciseId].map((cue, index) => ({
    image: techniqueSequencePath(exerciseId, index),
    label: DEFAULT_FRAME_LABELS[index] ?? `Etapa ${index + 1}`,
    cue,
    order: index + 1
  }));
};

export function getTechniqueFrames(exercise?: TechniqueFrameSource | null): TechniqueFrame[] {
  const provided = getProvidedFrames(exercise?.techniqueFrames);
  if (provided) return provided;

  const batch001Frames = getTechniqueBatch001Frames(exercise?.id);
  if (batch001Frames) return batch001Frames;

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
