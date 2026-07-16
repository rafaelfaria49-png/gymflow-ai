import { describe, expect, it } from 'vitest';
import { MOCK_EXERCISES } from '../mock/exercises';
import { MOCK_PROGRAMS } from '../mock/programs';
import type { EquipmentId } from '../types/training-taxonomy';
import {
  LEGACY_EQUIPMENT_MAP,
  auditLegacyEquipment,
  resolveLegacyEquipment,
  validateLegacyEquipmentMap,
} from './equipment-legacy-map';
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_REGISTRY,
  findEquipmentByAlias,
  getEquipmentDefinition,
  searchEquipment,
  validateEquipmentRegistry,
} from './equipment-registry';

describe('registry canônico de equipamentos', () => {
  it('tem IDs únicos, labels e referências estruturais válidas', () => {
    expect(new Set(EQUIPMENT_REGISTRY.map((item) => item.id)).size).toBe(EQUIPMENT_REGISTRY.length);
    expect(EQUIPMENT_REGISTRY.every((item) => item.label.trim() && item.aliases && item.searchTerms)).toBe(true);
    expect(EQUIPMENT_CATEGORIES).toContain('free_weight');
    expect(EQUIPMENT_CATEGORIES).toContain('support');

    const report = validateEquipmentRegistry();
    expect(report.valid, JSON.stringify(report.errors)).toBe(true);
    expect(report.collisions).toEqual([]);
  });

  it('não trata banco, rack, barra, halter ou kettlebell como categoria', () => {
    expect(EQUIPMENT_CATEGORIES).not.toContain('bench');
    expect(EQUIPMENT_CATEGORIES).not.toContain('rack');
    expect(EQUIPMENT_CATEGORIES).not.toContain('bar');
    expect(EQUIPMENT_CATEGORIES).not.toContain('dumbbell');
    expect(getEquipmentDefinition('flat_bench')?.category).toBe('support');
    expect(getEquipmentDefinition('dumbbells')?.category).toBe('free_weight');
  });

  it('busca parcialmente sem acento, mas lookup exato não usa fuzzy matching', () => {
    expect(searchEquipment('gluteo maquina').some((item) => item.id === 'glute_kickback_machine')).toBe(true);
    expect(searchEquipment('supino articulado').length).toBeGreaterThan(1);
    expect(findEquipmentByAlias('MÁQUINA GLÚTEO')?.id).toBe('glute_kickback_machine');
    expect(findEquipmentByAlias('leg pre 90')).toBeUndefined();
  });

  const founderCases: Array<[string, EquipmentId]> = [
    ['Leg Press 90°', 'leg_press_90'],
    ['Leg Press 45°', 'leg_press_45'],
    ['Agachamento na máquina', 'squat_machine'],
    ['Hack Machine', 'hack_squat_machine'],
    ['Hack sentado', 'seated_hack_squat_machine'],
    ['Agachamento pêndulo', 'pendulum_squat_machine'],
    ['Front squat', 'front_squat_machine'],
    ['Cadeira extensora', 'leg_extension_machine'],
    ['Cadeira flexora', 'seated_leg_curl_machine'],
    ['Mesa flexora', 'lying_leg_curl_machine'],
    ['Flexora articulada', 'articulated_leg_curl_machine'],
    ['Flexora em pé', 'standing_leg_curl_machine'],
    ['Máquina sumô', 'sumo_squat_machine'],
    ['Máquina de glúteo', 'glute_kickback_machine'],
    ['Elevação pélvica', 'hip_thrust_setup'],
    ['Elevação pélvica na máquina', 'hip_thrust_machine'],
    ['Panturrilha sentado', 'seated_calf_raise_machine'],
    ['Banco romano', 'roman_chair'],
    ['Supino vertical articulado', 'vertical_chest_press_machine'],
    ['Supino inclinado articulado', 'incline_chest_press_machine'],
    ['Supino reto articulado', 'flat_chest_press_machine'],
    ['Supino declinado articulado', 'decline_chest_press_machine'],
    ['Crucifixo inclinado máquina', 'incline_fly_machine'],
    ['Supino máquina', 'chest_press_machine'],
    ['Peck deck', 'pec_deck_machine'],
    ['Pullover máquina', 'pullover_machine'],
    ['Remada máquina', 'seated_row_machine'],
    ['Remada sentada', 'seated_row_machine'],
    ['Remada invertida máquina', 'inverted_row_machine'],
    ['Remada articulada', 'articulated_row_machine'],
    ['Puxador articulado', 'articulated_lat_pulldown_machine'],
    ['Puxada invertida', 'reverse_grip_pulldown_machine'],
    ['Puxada alta/pulley', 'high_cable_station'],
    ['Remada baixa/cabo', 'low_cable_station'],
    ['Rosca Scott máquina', 'scott_curl_machine'],
    ['Banco Scott', 'scott_bench'],
    ['Tríceps pulley', 'high_cable_station'],
    ['Extensão de tríceps na máquina', 'triceps_extension_machine'],
    ['Tríceps na máquina', 'triceps_extension_machine'],
    ['Polia alta', 'high_cable_station'],
    ['Polia baixa', 'low_cable_station'],
    ['Desenvolvimento articulado', 'articulated_shoulder_press_machine'],
    ['Desenvolvimento máquina', 'shoulder_press_machine'],
  ];

  it.each(founderCases)('resolve o aparelho/alias real %s', (term, expectedId) => {
    expect(findEquipmentByAlias(term)?.id).toBe(expectedId);
  });
});

describe('mapa explícito do catálogo legado', () => {
  const rawValues = [...new Set(MOCK_EXERCISES.map((exercise) => exercise.equipment))];

  it('produz a saída de auditoria reproduzível do GOAL-18A', () => {
    const audit = auditLegacyEquipment(rawValues);
    const registryReport = validateEquipmentRegistry();
    const output = {
      exercises: MOCK_EXERCISES.length,
      rawEquipmentValues: rawValues.length,
      canonicalEquipment: EQUIPMENT_REGISTRY.length,
      aliases: EQUIPMENT_REGISTRY.reduce((total, item) => total + item.aliases.length, 0),
      legacyResolved: audit.resolved,
      unresolved: audit.unresolved.length,
      genericCases: audit.generic.map((item) => item.raw),
      collisions: registryReport.collisions,
      approvedLegacyEquivalences: validateLegacyEquipmentMap(rawValues).warnings
        .filter((warning) => warning.code === 'approved-normalization-equivalence')
        .map((warning) => warning.message),
    };

    if (process.env.GYMFLOW_TAXONOMY_AUDIT === '1') {
      console.info('[GOAL-18A AUDIT]', JSON.stringify(output, null, 2));
    }

    expect(output).toMatchObject({ exercises: 126, rawEquipmentValues: 72, legacyResolved: 72, unresolved: 0 });
    expect(output.collisions).toEqual([]);
  });

  it('preserva 126 exercícios e cobre os 72 valores raw', () => {
    expect(MOCK_EXERCISES).toHaveLength(126);
    expect(rawValues).toHaveLength(72);
    expect(Object.keys(LEGACY_EQUIPMENT_MAP)).toHaveLength(72);

    const resolutions = rawValues.map(resolveLegacyEquipment);
    expect(resolutions.filter((item) => item.resolution === 'unresolved')).toEqual([]);
    for (const resolution of resolutions) {
      expect(resolution.raw).toBeTruthy();
      expect(resolution.equipmentIds.length).toBeGreaterThan(0);
      expect(resolution.equipmentIds.every((id) => getEquipmentDefinition(id))).toBe(true);
    }
  });

  it('audita 72 resolvidos, zero unresolved e mantém ambiguidades explícitas', () => {
    const audit = auditLegacyEquipment(rawValues);
    expect(audit.rawValues).toBe(72);
    expect(audit.resolved).toBe(72);
    expect(audit.unresolved).toEqual([]);
    expect(audit.generic.length).toBeGreaterThan(0);
    expect(audit.generic.every((item) => item.warnings && item.warnings.length > 0)).toBe(true);
  });

  it('valida referências e a equivalência explícita das duas grafias de crossover', () => {
    const report = validateLegacyEquipmentMap(rawValues);
    expect(report.valid, JSON.stringify(report.errors)).toBe(true);
    expect(report.collisions).toEqual([]);
    expect(report.warnings.some((warning) => warning.code === 'approved-normalization-equivalence')).toBe(true);
  });

  it('retorna unresolved para valor desconhecido sem adivinhação', () => {
    expect(resolveLegacyEquipment('Máquina futurista parecida com hack')).toMatchObject({
      equipmentIds: [],
      resolution: 'unresolved',
    });
    expect(resolveLegacyEquipment('')).toMatchObject({ equipmentIds: [], resolution: 'unresolved' });
  });

  it('mantém substituições e referências de programas íntegras', () => {
    const exerciseIds = new Set(MOCK_EXERCISES.map((exercise) => exercise.id));
    const substitutions = MOCK_EXERCISES.flatMap((exercise) => exercise.substitutions);
    const programReferences = MOCK_PROGRAMS.flatMap((program) => [
      ...program.exercises.map((exercise) => exercise.exerciseId),
      ...program.weeks.flatMap((week) => week.days.flatMap((day) => day.slots.map((slot) => slot.exerciseId))),
    ]);

    expect(substitutions.filter((id) => !exerciseIds.has(id))).toEqual([]);
    expect(programReferences.filter((id) => !exerciseIds.has(id))).toEqual([]);
  });
});
