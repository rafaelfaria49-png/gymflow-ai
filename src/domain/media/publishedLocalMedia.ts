/** GOAL-128: only the 12 human-authorized local sequences; no video/CDN approval. */
export interface PublishedLocalMedia {
  readonly cues: readonly [string, string] | readonly [string, string, string];
  readonly humanDecision: 'ACCEPTED' | 'ACCEPTED_WITH_CAVEAT' | 'TWO_FRAME_EXCEPTION_01_03';
  readonly caveat: string | null;
  readonly displayCaveat?: string;
}

export const PUBLISHED_LOCAL_MEDIA = {
  triceps_frances_unilateral_cabo: {
    cues: [
      'De costas para a polia baixa, segure a manopla atrás da cabeça e mantenha o cotovelo próximo à orelha.',
      'Estenda o cotovelo com controle, mantendo o braço superior e o tronco estáveis.',
      'Finalize a extensão acima da cabeça sem travar bruscamente o cotovelo; depois retorne com controle.',
    ],
    humanDecision: 'ACCEPTED_WITH_CAVEAT',
    caveat: 'Pequeno drift do cotovelo/braço superior em 03_final; execução continua compreensível e utilizável.',
    displayCaveat: 'Há um pequeno deslocamento do cotovelo e do braço superior na posição final. Mantenha o cotovelo estável durante a execução.',
  },
  triceps_testa_cabo: {
    cues: [
      'Deite-se com a cabeça voltada para a polia baixa, corda atrás da cabeça e cotovelos apontados para o teto.',
      'Estenda os cotovelos puxando a corda para cima, sem deslocar os braços superiores.',
      'Complete a extensão e abra as pontas da corda na contração; retorne sem mover os cotovelos.',
    ],
    humanDecision: 'ACCEPTED',
    caveat: null,
  },
  triceps_maquina: {
    cues: [
      'Ajuste o assento, alinhe os cotovelos ao eixo da máquina e mantenha tronco e braços apoiados.',
      'Estenda os cotovelos até quase a extensão total, mantendo os apoios; depois retorne sem bater os pesos.',
    ],
    humanDecision: 'TWO_FRAME_EXCEPTION_01_03',
    caveat: null,
  },
  legs_leg_press_90: {
    cues: [
      'Apoie costas e lombar no encosto, segure as manoplas e comece com pernas quase estendidas, sem travar os joelhos.',
      'Flexione joelhos e quadris com controle, mantendo pés, sacro e lombar apoiados.',
      'Finalize a descida em amplitude segura, com joelhos seguindo os pés e lombar apoiada; empurre para retornar.',
    ],
    humanDecision: 'ACCEPTED',
    caveat: null,
  },
  legs_agachamento_pendulo: {
    cues: [
      'Mantenha pés firmes na plataforma, ombros e coluna nas almofadas e joelhos destravados.',
      'Desça pelo arco da máquina, flexionando joelhos e quadris sem perder os apoios.',
      'Alcance a profundidade segura sem levantar calcanhares ou afastar a coluna das almofadas; retorne com controle.',
    ],
    humanDecision: 'ACCEPTED_WITH_CAVEAT',
    caveat: 'Pequena deriva de geometria/apoios da máquina.',
    displayCaveat: 'As imagens apresentam pequenas diferenças na geometria e nos apoios da máquina.',
  },
  legs_afundo_smith: {
    cues: [
      'Apoie a barra nos trapézios, mantenha o pé dianteiro inteiro no chão e o traseiro na ponta.',
      'Flexione ambos os joelhos, descendo com controle e mantendo os pés na mesma base.',
      'Finalize a descida sem encostar o joelho traseiro no chão; empurre pelo pé dianteiro para retornar.',
    ],
    humanDecision: 'ACCEPTED',
    caveat: null,
  },
  legs_agachamento_bulgaro_smith: {
    cues: [
      'Com a barra nos trapézios, firme o pé dianteiro no chão e apoie o peito do pé traseiro no banco.',
      'Flexione o joelho dianteiro enquanto o quadril desce, mantendo o apoio traseiro no banco.',
      'Finalize a descida com ambos os apoios estáveis e leve inclinação do tronco; retorne pela perna dianteira.',
    ],
    humanDecision: 'ACCEPTED',
    caveat: null,
  },
  legs_flexora_em_pe_maquina: {
    cues: [
      'Apoie tronco e quadril, alinhe o joelho ativo ao eixo e posicione o rolo atrás do tornozelo.',
      'Flexione o joelho ativo com controle, mantendo coxa, quadril e perna de apoio estáveis.',
      'Aproxime o calcanhar do glúteo sem mover o quadril; depois estenda a perna lentamente.',
    ],
    humanDecision: 'ACCEPTED',
    caveat: null,
  },
  legs_flexora_articulada: {
    cues: [
      'Deite-se de bruços, apoie a pelve, alinhe os joelhos ao eixo e ajuste os rolos atrás dos calcanhares.',
      'Flexione os joelhos mantendo coxas e quadril firmes no estofado.',
      'Aproxime os calcanhares dos glúteos sem levantar a pelve; retorne lentamente sem bater os pesos.',
    ],
    humanDecision: 'ACCEPTED_WITH_CAVEAT',
    caveat: 'Pequenas diferenças de pivô/transmissão entre fases.',
    displayCaveat: 'As imagens apresentam pequenas diferenças no pivô e na transmissão da máquina.',
  },
  legs_stiff_smith: {
    cues: [
      'Comece em pé, com barra junto às coxas, pés firmes e joelhos levemente flexionados.',
      'Leve o quadril para trás e incline o tronco, mantendo a barra rente às pernas e a coluna neutra.',
      'Finalize a descida na amplitude que preserve a lombar neutra; estenda o quadril para retornar.',
    ],
    humanDecision: 'ACCEPTED_WITH_CAVEAT',
    caveat: 'Deriva residual de pés/base entre frames, mas hip hinge e progressão visual são suficientemente claros.',
    displayCaveat: 'As imagens apresentam pequenas variações na posição dos pés; mantenha sua base fixa durante a execução.',
  },
  legs_aducao_cabo: {
    cues: [
      'Com a tornozeleira na perna próxima da polia, comece com essa perna aberta e o cabo tensionado.',
      'Traga a perna ativa para baixo do quadril, mantendo tronco e perna de apoio estáveis.',
      'Cruze a perna ativa ligeiramente à frente da perna de apoio, sem inclinar o tronco; retorne com controle.',
    ],
    humanDecision: 'ACCEPTED',
    caveat: null,
  },
  legs_agachamento_sumo_smith: {
    cues: [
      'Apoie a barra nos trapézios, abra a base e aponte os pés para fora, com joelhos destravados.',
      'Desça quadril e barra com controle, mantendo joelhos na direção dos pés e calcanhares apoiados.',
      'Finalize a descida em amplitude segura, com coxas próximas da horizontal; suba sem perder o alinhamento.',
    ],
    humanDecision: 'ACCEPTED',
    caveat: null,
  },
} as const satisfies Readonly<Record<string, PublishedLocalMedia>>;

export const PUBLISHED_LOCAL_MEDIA_EXERCISE_IDS = Object.keys(PUBLISHED_LOCAL_MEDIA);

export function getPublishedLocalMedia(exerciseId?: string): PublishedLocalMedia | null {
  return exerciseId && Object.hasOwn(PUBLISHED_LOCAL_MEDIA, exerciseId)
    ? PUBLISHED_LOCAL_MEDIA[exerciseId as keyof typeof PUBLISHED_LOCAL_MEDIA]
    : null;
}

export function getPublishedLocalMediaPaths(exerciseId?: string): string[] | null {
  const media = getPublishedLocalMedia(exerciseId);
  return media?.cues.map((_, index) => `/assets/exercises/${exerciseId}/${index}.jpg`) ?? null;
}

export function isPublishedLocalMediaPath(path: string): boolean {
  const exerciseId = /^\/assets\/exercises\/([^/]+)\/\d+\.jpg$/.exec(path)?.[1];
  return getPublishedLocalMediaPaths(exerciseId)?.includes(path) ?? false;
}
