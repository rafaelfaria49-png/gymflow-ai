import type {
  EquipmentId,
  EquipmentResolution,
  TaxonomyValidationIssue,
  TaxonomyValidationReport,
} from '../types/training-taxonomy';
import {
  EQUIPMENT_REGISTRY,
  findEquipmentMatch,
  getEquipmentDefinition,
} from './equipment-registry';
import { normalizeTaxonomyText } from './training-taxonomy';

export interface LegacyEquipmentMapEntry {
  equipmentIds: readonly EquipmentId[];
  generic?: boolean;
  warnings?: readonly string[];
}

function mapped(
  equipmentIds: readonly EquipmentId[],
  options: Omit<LegacyEquipmentMapEntry, 'equipmentIds'> = {},
): LegacyEquipmentMapEntry {
  return Object.freeze({
    equipmentIds: Object.freeze([...equipmentIds]),
    generic: options.generic,
    warnings: options.warnings ? Object.freeze([...options.warnings]) : undefined,
  });
}

const ALTERNATIVE_WARNING = 'O texto legado expressa alternativas; o GOAL-33A deve decidir o equipamento usado por exercício.';
const GENERIC_BENCH_WARNING = 'O valor legado não informa o tipo de banco; mantido como banco genérico até o GOAL-33A.';

/** Mapa explícito e não-fuzzy dos 72 valores presentes no catálogo do GOAL-18A. */
export const LEGACY_EQUIPMENT_MAP: Readonly<Record<string, LegacyEquipmentMapEntry>> = Object.freeze({
  'Aparelho Extensora': mapped(['leg_extension_machine']),
  'Aparelho Leg Press': mapped(['leg_press_machine'], { generic: true, warnings: ['Ângulo e mecanismo não informados no catálogo legado.'] }),
  'Aparelho Leg Press 45°': mapped(['leg_press_45']),
  'Aparelho Mesa Flexora': mapped(['lying_leg_curl_machine']),
  'Banco (Peso Corporal)': mapped(['flat_bench', 'bodyweight']),
  'Banco Declinado': mapped(['decline_bench']),
  'Banco e Barra W': mapped(['weight_bench', 'ez_bar'], { generic: true, warnings: [GENERIC_BENCH_WARNING] }),
  'Banco Reto': mapped(['flat_bench']),
  'Banco Romano': mapped(['roman_chair']),
  'Banco Scott e Barra W': mapped(['scott_bench', 'ez_bar']),
  'Banco, Barra e Estofamento': mapped(['weight_bench', 'barbell'], { generic: true, warnings: [GENERIC_BENCH_WARNING, '“Estofamento” não identifica um equipamento canônico adicional.'] }),
  'Barra Baixa / Smith': mapped(['barbell', 'smith_machine'], { generic: true, warnings: [ALTERNATIVE_WARNING] }),
  'Barra e Anilhas': mapped(['barbell', 'weight_plates']),
  'Barra e Banco': mapped(['barbell', 'weight_bench'], { generic: true, warnings: [GENERIC_BENCH_WARNING] }),
  'Barra e Banco com Encosto': mapped(['barbell', 'upright_bench']),
  'Barra e Banco Declinado': mapped(['barbell', 'decline_bench']),
  'Barra e Banco Inclinado': mapped(['barbell', 'incline_bench']),
  'Barra e Suporte': mapped(['barbell', 'power_rack']),
  'Barra Fixa': mapped(['pull_up_bar']),
  'Barra ou Barra W': mapped(['barbell', 'ez_bar'], { generic: true, warnings: [ALTERNATIVE_WARNING] }),
  'Barra T e Anilhas': mapped(['t_bar', 'weight_plates']),
  'Barra W (EZ)': mapped(['ez_bar']),
  'Barra W e Anilhas': mapped(['ez_bar', 'weight_plates']),
  'Barra, Anilhas e Gaiola': mapped(['barbell', 'weight_plates', 'power_rack']),
  'Barras Paralelas': mapped(['parallel_bars']),
  'Bicicleta Ergométrica': mapped(['stationary_bike']),
  'Corda': mapped(['jump_rope']),
  'Corda Naval': mapped(['battle_rope']),
  'Elíptico': mapped(['elliptical']),
  'Esteira': mapped(['treadmill']),
  'Haltere': mapped(['dumbbells']),
  'Haltere e Banco': mapped(['dumbbells', 'weight_bench'], { generic: true, warnings: [GENERIC_BENCH_WARNING] }),
  'Haltere e Step/Anilha': mapped(['dumbbells', 'step_platform', 'weight_plates'], { generic: true, warnings: [ALTERNATIVE_WARNING] }),
  'Haltere ou Kettlebell': mapped(['dumbbells', 'kettlebells'], { generic: true, warnings: [ALTERNATIVE_WARNING] }),
  'Halteres': mapped(['dumbbells']),
  'Halteres e Banco': mapped(['dumbbells', 'weight_bench'], { generic: true, warnings: [GENERIC_BENCH_WARNING] }),
  'Halteres e Banco Inclinado': mapped(['dumbbells', 'incline_bench']),
  'Halteres e Banco/Caixa': mapped(['dumbbells', 'weight_bench', 'plyo_box'], { generic: true, warnings: [ALTERNATIVE_WARNING, GENERIC_BENCH_WARNING] }),
  'Halteres ou Kettlebells': mapped(['dumbbells', 'kettlebells'], { generic: true, warnings: [ALTERNATIVE_WARNING] }),
  'Kettlebell': mapped(['kettlebells']),
  'Máquina Abdutora': mapped(['hip_abductor_machine']),
  'Máquina Adutora': mapped(['hip_adductor_machine']),
  'Máquina de Abdominal': mapped(['abdominal_machine']),
  'Máquina de Desenvolvimento': mapped(['shoulder_press_machine']),
  'Máquina de Panturrilha': mapped(['calf_raise_machine'], { generic: true, warnings: ['Posição e mecanismo não informados no catálogo legado.'] }),
  'Máquina de Panturrilha Sentado': mapped(['seated_calf_raise_machine']),
  'Máquina de Remada': mapped(['seated_row_machine']),
  'Máquina de Supino': mapped(['chest_press_machine'], { generic: true, warnings: ['Ângulo e mecanismo não informados no catálogo legado.'] }),
  'Máquina de Tríceps': mapped(['triceps_extension_machine']),
  'Máquina Donkey / Anilha': mapped(['donkey_calf_machine', 'weight_plates'], { generic: true, warnings: [ALTERNATIVE_WARNING] }),
  'Máquina Flexora Sentada': mapped(['seated_leg_curl_machine']),
  'Máquina Hack': mapped(['hack_squat_machine']),
  'Máquina Peck Deck (Invertida)': mapped(['reverse_pec_deck_machine']),
  'Máquina Scott': mapped(['scott_curl_machine']),
  'Máquina Smith': mapped(['smith_machine']),
  'Máquina Voador': mapped(['pec_deck_machine']),
  'Peso Corporal': mapped(['bodyweight']),
  'Peso Corporal / Anilha': mapped(['bodyweight', 'weight_plates'], { generic: true, warnings: [ALTERNATIVE_WARNING] }),
  'Peso Corporal / Caneleira': mapped(['bodyweight', 'ankle_weights'], { generic: true, warnings: [ALTERNATIVE_WARNING] }),
  'Polia (Crossover)': mapped(['cable_crossover']),
  'Polia / Crossover': mapped(['cable_crossover']),
  'Polia Alta': mapped(['high_cable_station']),
  'Polia Alta (Pulley)': mapped(['high_cable_station']),
  'Polia Alta e Barra Reta': mapped(['high_cable_station', 'straight_bar_attachment']),
  'Polia Alta e Barra V': mapped(['high_cable_station', 'v_bar_attachment']),
  'Polia Alta e Corda': mapped(['high_cable_station', 'rope_attachment']),
  'Polia Baixa': mapped(['low_cable_station']),
  'Polia Baixa e Caneleira': mapped(['low_cable_station', 'ankle_weights']),
  'Polia Baixa e Corda': mapped(['low_cable_station', 'rope_attachment']),
  'Polia Baixa e Triângulo': mapped(['low_cable_station', 'triangle_handle']),
  'Remo Ergômetro': mapped(['rowing_ergometer']),
  'Simulador de Escada': mapped(['stair_climber']),
});

/** Colisão de normalização legítima e aprovada: duas grafias raw equivalentes. */
export const LEGACY_NORMALIZATION_EQUIVALENCES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'polia crossover': Object.freeze(['Polia (Crossover)', 'Polia / Crossover']),
});

const normalizedLegacyLookup = new Map<string, LegacyEquipmentMapEntry>();
for (const [raw, entry] of Object.entries(LEGACY_EQUIPMENT_MAP)) {
  const normalized = normalizeTaxonomyText(raw);
  const existing = normalizedLegacyLookup.get(normalized);
  if (!existing) normalizedLegacyLookup.set(normalized, entry);
}

export function resolveLegacyEquipment(raw: string): EquipmentResolution {
  const normalized = normalizeTaxonomyText(raw);
  const legacy = normalizedLegacyLookup.get(normalized);
  if (legacy) {
    return {
      raw,
      normalized,
      equipmentIds: legacy.equipmentIds,
      resolution: legacy.generic ? 'generic' : 'legacy-map',
      warnings: legacy.warnings,
    };
  }

  const match = findEquipmentMatch(raw);
  if (match) {
    return {
      raw,
      normalized,
      equipmentIds: [match.definition.id],
      resolution: match.resolution,
    };
  }

  return {
    raw,
    normalized,
    equipmentIds: [],
    resolution: 'unresolved',
    warnings: normalized ? ['Nenhum ID ou alias explícito corresponde ao valor informado.'] : ['Valor de equipamento vazio.'],
  };
}

function sameIds(left: readonly EquipmentId[], right: readonly EquipmentId[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function validateLegacyEquipmentMap(
  rawValues: readonly string[] = Object.keys(LEGACY_EQUIPMENT_MAP),
): TaxonomyValidationReport {
  const errors: TaxonomyValidationIssue[] = [];
  const warnings: TaxonomyValidationIssue[] = [];
  const collisions: string[] = [];
  const registryIds = new Set(EQUIPMENT_REGISTRY.map((definition) => definition.id));
  const normalizedOwners = new Map<string, { raw: string; entry: LegacyEquipmentMapEntry }>();

  for (const [raw, entry] of Object.entries(LEGACY_EQUIPMENT_MAP)) {
    if (entry.equipmentIds.length === 0) errors.push({ code: 'empty-equipment-reference', message: `Mapeamento sem IDs: ${raw}` });
    for (const id of entry.equipmentIds) {
      if (!registryIds.has(id) || !getEquipmentDefinition(id)) errors.push({ code: 'unknown-equipment-id', message: `${raw} referencia ID inexistente: ${id}` });
    }

    const normalized = normalizeTaxonomyText(raw);
    const owner = normalizedOwners.get(normalized);
    if (owner && owner.raw !== raw) {
      const approved = LEGACY_NORMALIZATION_EQUIVALENCES[normalized]?.includes(owner.raw)
        && LEGACY_NORMALIZATION_EQUIVALENCES[normalized]?.includes(raw)
        && sameIds(owner.entry.equipmentIds, entry.equipmentIds);
      if (!approved) collisions.push(`${normalized}: ${owner.raw} <> ${raw}`);
      else warnings.push({ code: 'approved-normalization-equivalence', message: `${owner.raw} e ${raw} são grafias equivalentes aprovadas.` });
    } else {
      normalizedOwners.set(normalized, { raw, entry });
    }
  }

  for (const raw of new Set(rawValues)) {
    const resolution = resolveLegacyEquipment(raw);
    if (resolution.resolution === 'unresolved') errors.push({ code: 'unresolved-legacy-value', message: `Valor legado sem resolução: ${raw}` });
  }

  for (const collision of collisions) errors.push({ code: 'legacy-normalization-collision', message: collision });
  return { valid: errors.length === 0, errors, warnings, collisions };
}

export interface LegacyEquipmentAudit {
  rawValues: number;
  resolved: number;
  unresolved: readonly string[];
  generic: readonly EquipmentResolution[];
}

export function auditLegacyEquipment(rawValues: readonly string[]): LegacyEquipmentAudit {
  const distinct = [...new Set(rawValues)];
  const resolutions = distinct.map(resolveLegacyEquipment);
  return {
    rawValues: distinct.length,
    resolved: resolutions.filter((item) => item.resolution !== 'unresolved').length,
    unresolved: resolutions.filter((item) => item.resolution === 'unresolved').map((item) => item.raw),
    generic: resolutions.filter((item) => item.resolution === 'generic'),
  };
}
