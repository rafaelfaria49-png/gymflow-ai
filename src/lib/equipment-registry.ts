import type {
  EquipmentCategory,
  EquipmentDefinition,
  EquipmentId,
  EquipmentLoadType,
  EquipmentStatus,
  TaxonomyValidationIssue,
  TaxonomyValidationReport,
} from '../types/training-taxonomy';
import { normalizeTaxonomyText } from './training-taxonomy';

const ID_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

interface EquipmentOptions {
  aliases?: readonly string[];
  searchTerms?: readonly string[];
  status?: EquipmentStatus;
  description?: string;
  unilateralSupported?: boolean;
  plateCalculatorCompatible?: boolean;
  typicalIncrementKg?: number;
}

function equipment(
  id: EquipmentId,
  label: string,
  category: EquipmentCategory,
  loadType: EquipmentLoadType,
  options: EquipmentOptions = {},
): EquipmentDefinition {
  return Object.freeze({
    id,
    label,
    category,
    aliases: Object.freeze([...(options.aliases ?? [])]),
    searchTerms: Object.freeze([...(options.searchTerms ?? [])]),
    status: options.status ?? 'active',
    loadType,
    description: options.description,
    unilateralSupported: options.unilateralSupported,
    plateCalculatorCompatible: options.plateCalculatorCompatible,
    typicalIncrementKg: options.typicalIncrementKg,
  });
}

export const EQUIPMENT_CATEGORIES: readonly EquipmentCategory[] = Object.freeze([
  'bodyweight',
  'free_weight',
  'cable',
  'selectorized_machine',
  'plate_loaded_machine',
  'articulated_machine',
  'cardio_machine',
  'support',
  'accessory',
  'resistance_band',
  'suspension',
  'floor',
  'other',
]);

export const EQUIPMENT_REGISTRY: readonly EquipmentDefinition[] = Object.freeze([
  equipment('bodyweight', 'Peso corporal', 'bodyweight', 'bodyweight', { aliases: ['calistenia'], searchTerms: ['sem equipamento'] }),
  equipment('exercise_mat', 'Colchonete', 'floor', 'not_applicable', { aliases: ['tapete de exercicio'], searchTerms: ['solo', 'chao'] }),
  equipment('weight_plates', 'Anilhas', 'accessory', 'free_weight', { aliases: ['anilha', 'discos de peso'], searchTerms: ['carga livre'] }),
  equipment('ankle_weights', 'Caneleiras', 'accessory', 'fixed', { aliases: ['caneleira com peso'], searchTerms: ['peso de tornozelo'] }),
  equipment('step_platform', 'Step', 'support', 'not_applicable', { aliases: ['plataforma de step'], searchTerms: ['degrau'] }),
  equipment('plyo_box', 'Caixa pliométrica', 'support', 'not_applicable', { aliases: ['caixa de salto'], searchTerms: ['box'] }),
  equipment('resistance_band', 'Faixa elástica', 'resistance_band', 'resistance', { aliases: ['elastico de resistencia'], searchTerms: ['miniband', 'super band'], status: 'planned' }),
  equipment('suspension_trainer', 'Fita de suspensão', 'suspension', 'bodyweight', { aliases: ['treinador de suspensao'], searchTerms: ['trx'], status: 'planned' }),
  equipment('jump_rope', 'Corda de pular', 'accessory', 'not_applicable', { aliases: ['corda'], searchTerms: ['pular corda'] }),
  equipment('battle_rope', 'Corda naval', 'accessory', 'not_applicable', { aliases: ['corda de batalha'], searchTerms: ['battle rope'] }),

  equipment('barbell', 'Barra olímpica', 'free_weight', 'free_weight', { aliases: ['barra reta', 'barra livre'], searchTerms: ['barbell'], plateCalculatorCompatible: true }),
  equipment('ez_bar', 'Barra W (EZ)', 'free_weight', 'free_weight', { aliases: ['barra w', 'barra ez'], searchTerms: ['ez curl bar'], plateCalculatorCompatible: true }),
  equipment('t_bar', 'Barra T', 'free_weight', 'free_weight', { aliases: ['landmine barra t'], searchTerms: ['t bar'], plateCalculatorCompatible: true }),
  equipment('pull_up_bar', 'Barra fixa', 'support', 'bodyweight', { aliases: ['barra de puxada'], searchTerms: ['pull up bar'] }),
  equipment('parallel_bars', 'Barras paralelas', 'support', 'bodyweight', { aliases: ['paralelas'], searchTerms: ['dip station'] }),
  equipment('smith_machine', 'Máquina Smith', 'plate_loaded_machine', 'plate_loaded', { aliases: ['smith'], searchTerms: ['barra guiada'], plateCalculatorCompatible: true }),
  equipment('power_rack', 'Gaiola de agachamento', 'support', 'not_applicable', { aliases: ['power rack', 'gaiola'], searchTerms: ['suporte para barra'] }),
  equipment('bench_press_rack', 'Rack de supino', 'support', 'not_applicable', { aliases: ['suporte de supino'], searchTerms: ['rack para barra'] }),
  equipment('weight_bench', 'Banco de musculação', 'support', 'not_applicable', { aliases: ['banco generico'], searchTerms: ['banco ajustavel'], status: 'legacy', description: 'Banco sem inclinação informada no valor legado.' }),
  equipment('flat_bench', 'Banco reto', 'support', 'not_applicable', { aliases: ['banco plano'], searchTerms: ['flat bench'] }),
  equipment('incline_bench', 'Banco inclinado', 'support', 'not_applicable', { aliases: ['banco com inclinacao'], searchTerms: ['incline bench'] }),
  equipment('decline_bench', 'Banco declinado', 'support', 'not_applicable', { aliases: ['banco com declinacao'], searchTerms: ['decline bench'] }),
  equipment('upright_bench', 'Banco com encosto', 'support', 'not_applicable', { aliases: ['banco vertical'], searchTerms: ['banco sentado'] }),
  equipment('scott_bench', 'Banco Scott', 'support', 'not_applicable', { aliases: ['banco preacher'], searchTerms: ['scott banco'] }),
  equipment('roman_chair', 'Banco romano', 'support', 'bodyweight', { aliases: ['cadeira romana'], searchTerms: ['hiperextensao lombar'] }),
  equipment('hip_thrust_setup', 'Estação para elevação pélvica', 'support', 'not_applicable', { aliases: ['elevacao pelvica'], searchTerms: ['hip thrust com banco'] }),
  equipment('dumbbells', 'Halteres', 'free_weight', 'free_weight', { aliases: ['haltere'], searchTerms: ['dumbbell'] }),
  equipment('kettlebells', 'Kettlebells', 'free_weight', 'free_weight', { aliases: ['kettlebell'], searchTerms: ['peso russo'] }),

  equipment('cable_crossover', 'Crossover', 'cable', 'selectorized', { aliases: ['polia crossover'], searchTerms: ['cabos cruzados'] }),
  equipment('high_cable_station', 'Polia alta', 'cable', 'selectorized', { aliases: ['pulley alto', 'puxada alta pulley', 'triceps pulley', 'triceps polia'], searchTerms: ['cabo alto', 'puxada alta'] }),
  equipment('low_cable_station', 'Polia baixa', 'cable', 'selectorized', { aliases: ['pulley baixo', 'remada baixa cabo'], searchTerms: ['cabo baixo', 'remada baixa'] }),
  equipment('straight_bar_attachment', 'Barra reta para polia', 'accessory', 'not_applicable', { aliases: ['pegador barra reta'], searchTerms: ['acessorio de polia'] }),
  equipment('v_bar_attachment', 'Barra V para polia', 'accessory', 'not_applicable', { aliases: ['pegador v'], searchTerms: ['puxador v'] }),
  equipment('rope_attachment', 'Corda para polia', 'accessory', 'not_applicable', { aliases: ['pegador corda'], searchTerms: ['corda de triceps'] }),
  equipment('triangle_handle', 'Triângulo para polia', 'accessory', 'not_applicable', { aliases: ['pegador triangulo'], searchTerms: ['remada triangulo'] }),

  equipment('leg_press_machine', 'Leg press (modelo não especificado)', 'other', 'not_applicable', { aliases: ['aparelho leg press', 'leg press generico'], searchTerms: ['leg press'], status: 'legacy', description: 'Mantém honestamente valores antigos que não informam ângulo ou mecanismo.' }),
  equipment('leg_press_45', 'Leg Press 45°', 'plate_loaded_machine', 'plate_loaded', { aliases: ['leg 45', 'aparelho leg press 45'], searchTerms: ['leg press inclinado'], unilateralSupported: true, plateCalculatorCompatible: true }),
  equipment('leg_press_90', 'Leg Press 90°', 'selectorized_machine', 'selectorized', { aliases: ['leg 90', 'leg press 90'], searchTerms: ['leg press horizontal'], unilateralSupported: true }),
  equipment('squat_machine', 'Máquina de agachamento', 'other', 'not_applicable', { aliases: ['agachamento na maquina'], searchTerms: ['squat machine'] }),
  equipment('hack_squat_machine', 'Máquina Hack', 'plate_loaded_machine', 'plate_loaded', { aliases: ['hack', 'hack machine', 'agachamento hack'], searchTerms: ['hack squat'], plateCalculatorCompatible: true }),
  equipment('seated_hack_squat_machine', 'Hack sentado', 'plate_loaded_machine', 'plate_loaded', { aliases: ['hack squat sentado'], searchTerms: ['seated hack'], plateCalculatorCompatible: true }),
  equipment('pendulum_squat_machine', 'Agachamento pêndulo', 'plate_loaded_machine', 'plate_loaded', { aliases: ['pendulo', 'pendulum squat'], searchTerms: ['maquina pendular'], plateCalculatorCompatible: true }),
  equipment('front_squat_machine', 'Máquina Front Squat', 'plate_loaded_machine', 'plate_loaded', { aliases: ['front squat'], searchTerms: ['agachamento frontal maquina'], plateCalculatorCompatible: true }),
  equipment('leg_extension_machine', 'Cadeira extensora', 'selectorized_machine', 'selectorized', { aliases: ['aparelho extensora'], searchTerms: ['extensora de pernas'], unilateralSupported: true }),
  equipment('seated_leg_curl_machine', 'Cadeira flexora', 'selectorized_machine', 'selectorized', { aliases: ['maquina flexora sentada'], searchTerms: ['flexora sentado'], unilateralSupported: true }),
  equipment('lying_leg_curl_machine', 'Mesa flexora', 'selectorized_machine', 'selectorized', { aliases: ['aparelho mesa flexora'], searchTerms: ['flexora deitada'] }),
  equipment('articulated_leg_curl_machine', 'Flexora articulada', 'articulated_machine', 'plate_loaded', { aliases: ['maquina flexora articulada'], searchTerms: ['leg curl articulado'], unilateralSupported: true, plateCalculatorCompatible: true }),
  equipment('standing_leg_curl_machine', 'Flexora em pé', 'selectorized_machine', 'selectorized', { aliases: ['flexora de pe'], searchTerms: ['standing leg curl'], unilateralSupported: true }),
  equipment('sumo_squat_machine', 'Máquina sumô', 'plate_loaded_machine', 'plate_loaded', { aliases: ['maquina de agachamento sumo'], searchTerms: ['sumo machine'], plateCalculatorCompatible: true }),
  equipment('glute_kickback_machine', 'Máquina de glúteo', 'selectorized_machine', 'selectorized', { aliases: ['gluteo maquina', 'maquina gluteo'], searchTerms: ['glute kickback'], unilateralSupported: true }),
  equipment('hip_thrust_machine', 'Elevação pélvica na máquina', 'plate_loaded_machine', 'plate_loaded', { aliases: ['maquina de elevacao pelvica'], searchTerms: ['hip thrust machine'], plateCalculatorCompatible: true }),
  equipment('hip_abductor_machine', 'Máquina abdutora', 'selectorized_machine', 'selectorized', { aliases: ['cadeira abdutora'], searchTerms: ['abdutora de quadril'] }),
  equipment('hip_adductor_machine', 'Máquina adutora', 'selectorized_machine', 'selectorized', { aliases: ['cadeira adutora'], searchTerms: ['adutora de quadril'] }),
  equipment('calf_raise_machine', 'Máquina de panturrilha (modelo não especificado)', 'other', 'not_applicable', { aliases: ['maquina panturrilha generica'], searchTerms: ['panturrilha em aparelho'], status: 'legacy', description: 'Preserva valores antigos sem posição ou mecanismo informados.' }),
  equipment('standing_calf_raise_machine', 'Máquina de panturrilha em pé', 'selectorized_machine', 'selectorized', { aliases: ['panturrilha em pe na maquina'], searchTerms: ['panturrilha maquina em pe'] }),
  equipment('seated_calf_raise_machine', 'Panturrilha sentado', 'plate_loaded_machine', 'plate_loaded', { aliases: ['maquina de panturrilha sentado'], searchTerms: ['seated calf raise'], plateCalculatorCompatible: true }),
  equipment('donkey_calf_machine', 'Máquina donkey', 'plate_loaded_machine', 'plate_loaded', { aliases: ['donkey calf machine'], searchTerms: ['panturrilha donkey'], plateCalculatorCompatible: true }),
  equipment('abdominal_machine', 'Máquina de abdominal', 'selectorized_machine', 'selectorized', { aliases: ['abdominal na maquina'], searchTerms: ['abdominal machine'] }),

  equipment('chest_press_machine', 'Máquina de supino', 'selectorized_machine', 'selectorized', { aliases: ['supino maquina', 'supino na maquina'], searchTerms: ['chest press'] }),
  equipment('articulated_chest_press_machine', 'Supino articulado (modelo não especificado)', 'articulated_machine', 'plate_loaded', { aliases: ['supino articulado'], searchTerms: ['chest press articulado'], plateCalculatorCompatible: true }),
  equipment('vertical_chest_press_machine', 'Supino vertical articulado', 'articulated_machine', 'plate_loaded', { aliases: ['supino articulado vertical'], searchTerms: ['vertical chest press'], plateCalculatorCompatible: true }),
  equipment('incline_chest_press_machine', 'Supino inclinado articulado', 'articulated_machine', 'plate_loaded', { aliases: ['supino articulado inclinado'], searchTerms: ['incline chest press'], plateCalculatorCompatible: true }),
  equipment('flat_chest_press_machine', 'Supino reto articulado', 'articulated_machine', 'plate_loaded', { aliases: ['supino articulado reto'], searchTerms: ['flat chest press'], plateCalculatorCompatible: true }),
  equipment('decline_chest_press_machine', 'Supino declinado articulado', 'articulated_machine', 'plate_loaded', { aliases: ['supino articulado declinado'], searchTerms: ['decline chest press'], plateCalculatorCompatible: true }),
  equipment('incline_fly_machine', 'Crucifixo inclinado na máquina', 'articulated_machine', 'plate_loaded', { aliases: ['crucifixo inclinado maquina'], searchTerms: ['incline fly machine'], plateCalculatorCompatible: true }),
  equipment('pec_deck_machine', 'Peck deck / crucifixo máquina', 'selectorized_machine', 'selectorized', { aliases: ['peck deck', 'maquina voador', 'crucifixo maquina'], searchTerms: ['voador peitoral'] }),
  equipment('reverse_pec_deck_machine', 'Peck deck invertido', 'selectorized_machine', 'selectorized', { aliases: ['maquina peck deck invertida'], searchTerms: ['voador inverso'] }),

  equipment('pullover_machine', 'Pullover na máquina', 'articulated_machine', 'plate_loaded', { aliases: ['pullover maquina', 'pull over maquina'], searchTerms: ['machine pullover'], plateCalculatorCompatible: true }),
  equipment('seated_row_machine', 'Remada na máquina', 'selectorized_machine', 'selectorized', { aliases: ['remada maquina', 'remada sentada'], searchTerms: ['seated row machine'] }),
  equipment('articulated_row_machine', 'Remada articulada', 'articulated_machine', 'plate_loaded', { aliases: ['remada maquina articulada'], searchTerms: ['plate loaded row'], unilateralSupported: true, plateCalculatorCompatible: true }),
  equipment('inverted_row_machine', 'Remada invertida na máquina', 'articulated_machine', 'plate_loaded', { aliases: ['remada invertida maquina'], searchTerms: ['inverted row machine'], plateCalculatorCompatible: true }),
  equipment('articulated_lat_pulldown_machine', 'Puxador articulado', 'articulated_machine', 'plate_loaded', { aliases: ['puxada articulada'], searchTerms: ['articulated lat pulldown'], unilateralSupported: true, plateCalculatorCompatible: true }),
  equipment('reverse_grip_pulldown_machine', 'Puxador invertido', 'articulated_machine', 'plate_loaded', { aliases: ['puxada invertida'], searchTerms: ['reverse grip pulldown'], plateCalculatorCompatible: true }),
  equipment('scott_curl_machine', 'Rosca Scott na máquina', 'selectorized_machine', 'selectorized', { aliases: ['scott maquina', 'maquina scott', 'rosca scott maquina'], searchTerms: ['preacher curl machine'] }),
  equipment('triceps_extension_machine', 'Extensão de tríceps na máquina', 'selectorized_machine', 'selectorized', { aliases: ['triceps na maquina', 'maquina de triceps'], searchTerms: ['triceps extension machine'] }),
  equipment('shoulder_press_machine', 'Desenvolvimento na máquina', 'selectorized_machine', 'selectorized', { aliases: ['desenvolvimento maquina', 'maquina de desenvolvimento'], searchTerms: ['shoulder press machine'] }),
  equipment('articulated_shoulder_press_machine', 'Desenvolvimento articulado', 'articulated_machine', 'plate_loaded', { aliases: ['desenvolvimento maquina articulada'], searchTerms: ['articulated shoulder press'], plateCalculatorCompatible: true }),

  equipment('stationary_bike', 'Bicicleta ergométrica', 'cardio_machine', 'fixed', { aliases: ['bike ergometrica'], searchTerms: ['bicicleta indoor'] }),
  equipment('elliptical', 'Elíptico', 'cardio_machine', 'fixed', { aliases: ['transport'], searchTerms: ['cross trainer'] }),
  equipment('treadmill', 'Esteira', 'cardio_machine', 'fixed', { aliases: ['esteira ergometrica'], searchTerms: ['treadmill'] }),
  equipment('rowing_ergometer', 'Remo ergômetro', 'cardio_machine', 'fixed', { aliases: ['remo indoor'], searchTerms: ['rowing machine'] }),
  equipment('stair_climber', 'Simulador de escada', 'cardio_machine', 'fixed', { aliases: ['escada ergometrica'], searchTerms: ['stair climber'] }),
]);

const equipmentById = new Map<EquipmentId, EquipmentDefinition>(EQUIPMENT_REGISTRY.map((definition) => [definition.id, definition]));
const exactEquipmentLookup = new Map<string, EquipmentDefinition>();
const aliasEquipmentLookup = new Map<string, EquipmentDefinition>();

for (const definition of EQUIPMENT_REGISTRY) {
  exactEquipmentLookup.set(normalizeTaxonomyText(definition.id), definition);
  exactEquipmentLookup.set(normalizeTaxonomyText(definition.label), definition);
  for (const alias of definition.aliases) aliasEquipmentLookup.set(normalizeTaxonomyText(alias), definition);
}

export function getEquipmentDefinition(id: EquipmentId): EquipmentDefinition | undefined {
  return equipmentById.get(id);
}

export function findEquipmentByAlias(value: string): EquipmentDefinition | undefined {
  const normalized = normalizeTaxonomyText(value);
  return exactEquipmentLookup.get(normalized) ?? aliasEquipmentLookup.get(normalized);
}

export function findEquipmentMatch(value: string): { definition: EquipmentDefinition; resolution: 'exact' | 'alias' } | undefined {
  const normalized = normalizeTaxonomyText(value);
  const exact = exactEquipmentLookup.get(normalized);
  if (exact) return { definition: exact, resolution: 'exact' };
  const alias = aliasEquipmentLookup.get(normalized);
  return alias ? { definition: alias, resolution: 'alias' } : undefined;
}

export function searchEquipment(query: string): EquipmentDefinition[] {
  const tokens = normalizeTaxonomyText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];

  return EQUIPMENT_REGISTRY.filter((definition) => {
    const searchable = normalizeTaxonomyText([
      definition.id,
      definition.label,
      ...definition.aliases,
      ...definition.searchTerms,
    ].join(' '));
    return tokens.every((token) => searchable.includes(token));
  });
}

const LOAD_TYPES = new Set<EquipmentLoadType>(['bodyweight', 'fixed', 'selectorized', 'plate_loaded', 'free_weight', 'resistance', 'not_applicable']);
const STATUSES = new Set<EquipmentStatus>(['active', 'legacy', 'planned']);

export function validateEquipmentRegistry(
  registry: readonly EquipmentDefinition[] = EQUIPMENT_REGISTRY,
): TaxonomyValidationReport {
  const errors: TaxonomyValidationIssue[] = [];
  const warnings: TaxonomyValidationIssue[] = [];
  const collisions: string[] = [];
  const categories = new Set<EquipmentCategory>(EQUIPMENT_CATEGORIES);
  const ids = new Set<string>();
  const terms = new Map<string, string>();

  for (const [index, definition] of registry.entries()) {
    const path = `equipment[${index}]`;
    if (ids.has(definition.id)) errors.push({ code: 'duplicate-id', message: `ID duplicado: ${definition.id}`, path });
    ids.add(definition.id);
    if (!ID_PATTERN.test(definition.id)) errors.push({ code: 'invalid-id', message: `ID inválido: ${definition.id}`, path });
    if (!definition.label.trim()) errors.push({ code: 'empty-label', message: 'Label PT-BR ausente.', path });
    if (!categories.has(definition.category)) errors.push({ code: 'invalid-category', message: `Categoria inexistente: ${definition.category}`, path });
    if (!LOAD_TYPES.has(definition.loadType)) errors.push({ code: 'invalid-load-type', message: `Tipo de carga inválido: ${definition.loadType}`, path });
    if (!STATUSES.has(definition.status)) errors.push({ code: 'invalid-status', message: `Status inválido: ${definition.status}`, path });
    if (definition.typicalIncrementKg !== undefined && definition.typicalIncrementKg <= 0) {
      errors.push({ code: 'invalid-increment', message: 'Incremento típico deve ser positivo.', path });
    }

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

    for (const searchTerm of definition.searchTerms) {
      if (!normalizeTaxonomyText(searchTerm)) errors.push({ code: 'empty-search-term', message: 'Termo de busca vazio.', path });
    }
  }

  for (const collision of collisions) errors.push({ code: 'alias-collision', message: collision });
  return { valid: errors.length === 0, errors, warnings, collisions };
}
