import type {
  MovementPatternCategory,
  MovementPatternDefinition,
  MovementPatternId,
  MuscleGroupCategory,
  MuscleGroupDefinition,
  MuscleGroupId,
  TaxonomyValidationIssue,
  TaxonomyValidationReport,
} from '../types/training-taxonomy';

const ID_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/** Normalização canônica para lookup exato, aliases e busca por taxonomia. */
export function normalizeTaxonomyText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[°º]/g, '')
    .replace(/&/g, ' e ')
    .replace(/[-–—_/\\]+/g, ' ')
    .replace(/[()[\]{}.,;:!?"'`´~^+*=|<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const MUSCLE_GROUPS: readonly MuscleGroupDefinition[] = Object.freeze([
  { id: 'chest', label: 'Peito', aliases: ['peitoral', 'peitorais'], order: 10, category: 'upper_body' },
  { id: 'back', label: 'Costas', aliases: ['dorsal', 'dorsais'], order: 20, category: 'upper_body' },
  { id: 'shoulders', label: 'Ombros', aliases: ['ombro', 'deltoides'], order: 30, category: 'upper_body' },
  { id: 'biceps', label: 'Bíceps', aliases: ['biceps braquial'], order: 40, category: 'upper_body' },
  { id: 'triceps', label: 'Tríceps', aliases: ['triceps braquial'], order: 50, category: 'upper_body' },
  { id: 'forearms', label: 'Antebraços', aliases: ['antebraco', 'antebracos'], order: 60, category: 'upper_body', description: 'Grupo específico para futura curadoria de flexores e extensores do antebraço.' },
  { id: 'traps', label: 'Trapézios', aliases: ['trapezio', 'trapezios'], order: 70, category: 'upper_body', description: 'Grupo específico para movimentos com predominância do trapézio.' },
  { id: 'quadriceps', label: 'Quadríceps', aliases: ['quadriceps femoral', 'coxa anterior'], order: 80, category: 'lower_body' },
  { id: 'hamstrings', label: 'Posterior de coxa', aliases: ['posteriores de coxa', 'isquiotibiais'], order: 90, category: 'lower_body' },
  { id: 'glutes', label: 'Glúteos', aliases: ['gluteo', 'gluteos'], order: 100, category: 'lower_body' },
  { id: 'adductors', label: 'Adutores', aliases: ['adutor', 'adutores da coxa'], order: 110, category: 'lower_body', description: 'Grupo específico necessário para máquinas adutoras e curadoria futura.' },
  { id: 'abductors', label: 'Abdutores', aliases: ['abdutor', 'abdutores da coxa'], order: 120, category: 'lower_body', description: 'Grupo específico necessário para máquinas abdutoras e curadoria futura.' },
  { id: 'calves', label: 'Panturrilhas', aliases: ['panturrilha', 'gemeos'], order: 130, category: 'lower_body' },
  { id: 'legs_general', label: 'Pernas (legado)', aliases: ['legs', 'pernas', 'membros inferiores'], order: 140, category: 'lower_body', description: 'Grupo genérico preservado até a curadoria exercício a exercício do GOAL-33A.' },
  { id: 'core', label: 'Abdômen/Core', aliases: ['abs', 'abdominais', 'abdomen', 'core'], order: 150, category: 'trunk' },
  { id: 'lower_back', label: 'Lombar', aliases: ['lombar', 'eretores da coluna'], order: 160, category: 'trunk', description: 'Grupo específico para extensores lombares, sem substituir automaticamente o grupo costas.' },
  { id: 'full_body', label: 'Corpo inteiro', aliases: ['corpo todo', 'full body'], order: 170, category: 'whole_body' },
  { id: 'functional', label: 'Funcional', aliases: ['treino funcional'], order: 180, category: 'whole_body' },
  { id: 'cardio', label: 'Cardio', aliases: ['cardiovascular', 'aerobico'], order: 190, category: 'conditioning' },
  { id: 'mobility', label: 'Mobilidade', aliases: ['mobilidade articular', 'alongamento dinamico'], order: 200, category: 'mobility' },
]);

export const LEGACY_MUSCLE_GROUP_MAP = Object.freeze({
  chest: 'chest',
  back: 'back',
  shoulders: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  legs: 'legs_general',
  glutes: 'glutes',
  abs: 'core',
  cardio: 'cardio',
  calves: 'calves',
  functional: 'functional',
  mobility: 'mobility',
} satisfies Record<string, MuscleGroupId>);

export const MOVEMENT_PATTERNS: readonly MovementPatternDefinition[] = Object.freeze([
  { id: 'horizontal_push', label: 'Empurrar horizontal', description: 'Empurra uma resistência à frente do tronco.', category: 'upper_body', aliases: ['empurrao horizontal', 'press horizontal'] },
  { id: 'vertical_push', label: 'Empurrar vertical', description: 'Empurra uma resistência acima da cabeça.', category: 'upper_body', aliases: ['empurrao vertical', 'press acima da cabeca'] },
  { id: 'horizontal_pull', label: 'Puxar horizontal', description: 'Puxa uma resistência em direção ao tronco no plano horizontal.', category: 'upper_body', aliases: ['puxada horizontal', 'remada'] },
  { id: 'vertical_pull', label: 'Puxar vertical', description: 'Puxa uma resistência no plano vertical.', category: 'upper_body', aliases: ['puxada vertical', 'pulldown'] },
  { id: 'squat', label: 'Agachamento', description: 'Flexão coordenada de quadril, joelhos e tornozelos com retorno à extensão.', category: 'lower_body', aliases: ['padrao de agachamento'] },
  { id: 'hip_hinge', label: 'Dobradiça de quadril', description: 'Movimento predominante de flexão e extensão do quadril.', category: 'lower_body', aliases: ['hinge', 'dobradica'] },
  { id: 'knee_extension', label: 'Extensão de joelho', description: 'Estende o joelho contra resistência.', category: 'lower_body', aliases: ['extensao dos joelhos'] },
  { id: 'knee_flexion', label: 'Flexão de joelho', description: 'Flexiona o joelho contra resistência.', category: 'lower_body', aliases: ['flexao dos joelhos'] },
  { id: 'hip_extension', label: 'Extensão de quadril', description: 'Estende o quadril contra resistência.', category: 'lower_body', aliases: ['extensao dos quadris'] },
  { id: 'hip_abduction', label: 'Abdução de quadril', description: 'Afasta a coxa da linha média corporal.', category: 'lower_body', aliases: ['abducao dos quadris'] },
  { id: 'hip_adduction', label: 'Adução de quadril', description: 'Aproxima a coxa da linha média corporal.', category: 'lower_body', aliases: ['aducao dos quadris'] },
  { id: 'elbow_flexion', label: 'Flexão de cotovelo', description: 'Flexiona o cotovelo contra resistência.', category: 'upper_body', aliases: ['rosca', 'flexao dos cotovelos'] },
  { id: 'elbow_extension', label: 'Extensão de cotovelo', description: 'Estende o cotovelo contra resistência.', category: 'upper_body', aliases: ['extensao dos cotovelos'] },
  { id: 'shoulder_abduction', label: 'Abdução de ombro', description: 'Eleva o braço lateralmente em relação ao tronco.', category: 'upper_body', aliases: ['elevacao lateral'] },
  { id: 'shoulder_flexion', label: 'Flexão de ombro', description: 'Eleva o braço à frente do tronco.', category: 'upper_body', aliases: ['elevacao frontal'] },
  { id: 'shoulder_extension', label: 'Extensão de ombro', description: 'Move o braço para trás em relação ao tronco.', category: 'upper_body', aliases: ['extensao dos ombros'] },
  { id: 'calf_raise', label: 'Elevação de panturrilha', description: 'Realiza flexão plantar contra resistência.', category: 'lower_body', aliases: ['flexao plantar'] },
  { id: 'trunk_flexion', label: 'Flexão de tronco', description: 'Flexiona o tronco aproximando costelas e pelve.', category: 'trunk', aliases: ['flexao abdominal'] },
  { id: 'trunk_extension', label: 'Extensão de tronco', description: 'Estende o tronco contra a gravidade ou resistência.', category: 'trunk', aliases: ['extensao lombar'] },
  { id: 'trunk_rotation', label: 'Rotação de tronco', description: 'Gira o tronco em torno do eixo longitudinal.', category: 'trunk', aliases: ['rotacao abdominal'] },
  { id: 'anti_extension', label: 'Anti-extensão', description: 'Resiste à tendência de extensão do tronco.', category: 'trunk', aliases: ['estabilidade anti extensao'] },
  { id: 'anti_rotation', label: 'Anti-rotação', description: 'Resiste à tendência de rotação do tronco.', category: 'trunk', aliases: ['estabilidade anti rotacao'] },
  { id: 'locomotion', label: 'Locomoção', description: 'Desloca o corpo no espaço de forma cíclica ou carregada.', category: 'conditioning', aliases: ['deslocamento', 'caminhada corrida'] },
  { id: 'mobility', label: 'Mobilidade', description: 'Explora amplitude de movimento com controle.', category: 'mobility', aliases: ['mobilidade dinamica'] },
  { id: 'full_body_conditioning', label: 'Condicionamento de corpo inteiro', description: 'Combina múltiplas articulações com demanda sistêmica.', category: 'whole_body', aliases: ['condicionamento global', 'full body conditioning'] },
]);

function createLookup<T extends { id: string; label: string; aliases: readonly string[] }>(definitions: readonly T[]): ReadonlyMap<string, T> {
  const lookup = new Map<string, T>();
  for (const definition of definitions) {
    for (const term of [definition.id, definition.label, ...definition.aliases]) {
      lookup.set(normalizeTaxonomyText(term), definition);
    }
  }
  return lookup;
}

const muscleGroupLookup = createLookup(MUSCLE_GROUPS);
const movementPatternLookup = createLookup(MOVEMENT_PATTERNS);

export function getMuscleGroupDefinition(id: MuscleGroupId): MuscleGroupDefinition | undefined {
  return MUSCLE_GROUPS.find((definition) => definition.id === id);
}

export function resolveLegacyMuscleGroup(value: string): MuscleGroupDefinition | undefined {
  const normalized = normalizeTaxonomyText(value);
  const legacyId = LEGACY_MUSCLE_GROUP_MAP[normalized as keyof typeof LEGACY_MUSCLE_GROUP_MAP];
  return legacyId ? getMuscleGroupDefinition(legacyId) : muscleGroupLookup.get(normalized);
}

export function getMovementPatternDefinition(id: MovementPatternId): MovementPatternDefinition | undefined {
  return MOVEMENT_PATTERNS.find((definition) => definition.id === id);
}

export function findMovementPatternByAlias(value: string): MovementPatternDefinition | undefined {
  return movementPatternLookup.get(normalizeTaxonomyText(value));
}

const MUSCLE_CATEGORIES = new Set<MuscleGroupCategory>(['upper_body', 'lower_body', 'trunk', 'whole_body', 'conditioning', 'mobility']);
const MOVEMENT_CATEGORIES = new Set<MovementPatternCategory>(['upper_body', 'lower_body', 'trunk', 'whole_body', 'conditioning', 'mobility']);

function validateDefinitions<T extends { id: string; label: string; aliases: readonly string[]; category: string }>(
  kind: 'muscle-group' | 'movement-pattern',
  definitions: readonly T[],
  allowedCategories: ReadonlySet<string>,
): { errors: TaxonomyValidationIssue[]; collisions: string[] } {
  const errors: TaxonomyValidationIssue[] = [];
  const collisions: string[] = [];
  const ids = new Set<string>();
  const terms = new Map<string, string>();

  for (const [index, definition] of definitions.entries()) {
    const path = `${kind}[${index}]`;
    if (ids.has(definition.id)) errors.push({ code: 'duplicate-id', message: `ID duplicado: ${definition.id}`, path });
    ids.add(definition.id);
    if (!ID_PATTERN.test(definition.id)) errors.push({ code: 'invalid-id', message: `ID inválido: ${definition.id}`, path });
    if (!definition.label.trim()) errors.push({ code: 'empty-label', message: 'Label PT-BR ausente.', path });
    if (!allowedCategories.has(definition.category)) errors.push({ code: 'invalid-category', message: `Categoria inexistente: ${definition.category}`, path });

    for (const term of [definition.id, definition.label, ...definition.aliases]) {
      const normalized = normalizeTaxonomyText(term);
      if (!normalized) errors.push({ code: 'empty-alias', message: 'Termo vazio após normalização.', path });
      if (normalized !== normalizeTaxonomyText(term) || normalized !== normalizeTaxonomyText(normalized)) {
        errors.push({ code: 'non-deterministic-normalization', message: `Normalização instável: ${term}`, path });
      }
      const owner = terms.get(normalized);
      if (owner && owner !== definition.id) collisions.push(`${normalized}: ${owner} <> ${definition.id}`);
      else terms.set(normalized, definition.id);
    }
  }

  return { errors, collisions };
}

export function validateTrainingTaxonomy(
  muscleGroups: readonly MuscleGroupDefinition[] = MUSCLE_GROUPS,
  movementPatterns: readonly MovementPatternDefinition[] = MOVEMENT_PATTERNS,
): TaxonomyValidationReport {
  const muscleResult = validateDefinitions('muscle-group', muscleGroups, MUSCLE_CATEGORIES);
  const movementResult = validateDefinitions('movement-pattern', movementPatterns, MOVEMENT_CATEGORIES);
  const errors = [...muscleResult.errors, ...movementResult.errors];
  const collisions = [...muscleResult.collisions, ...movementResult.collisions];
  for (const collision of collisions) errors.push({ code: 'alias-collision', message: collision });

  return { valid: errors.length === 0, errors, warnings: [], collisions };
}
