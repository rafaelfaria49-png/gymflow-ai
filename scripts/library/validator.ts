import { Exercise } from '../../src/types';
import { MUSCLE_GROUPS, MOVEMENT_PATTERNS, normalizeTaxonomyText, resolveLegacyMuscleGroup } from '../../src/lib/training-taxonomy';
import { EQUIPMENT_REGISTRY, getEquipmentDefinition } from '../../src/lib/equipment-registry';
import { resolveLegacyEquipment } from '../../src/lib/equipment-legacy-map';
import { matchesExerciseSearch, normalizeText } from '../../src/lib/exerciseSearch';

const validMuscleGroupIds = new Set(MUSCLE_GROUPS.map((g) => g.id));
const validMovementPatternIds = new Set(MOVEMENT_PATTERNS.map((p) => p.id));
const validEquipmentIds = new Set(EQUIPMENT_REGISTRY.map((e) => e.id));

const VALID_LEGACY_MUSCLE_GROUPS = new Set([
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'abs', 'calves', 'cardio', 'mobility', 'functional'
]);

const VALID_LEVELS = new Set(['beginner', 'intermediate', 'advanced', 'athlete']);
const VALID_MECHANICS = new Set(['compound', 'isolation', 'cardio', 'mobility', 'functional']);
const VALID_LATERALITY = new Set(['bilateral', 'unilateral', 'alternating', 'not_applicable']);
const VALID_BODY_POSITIONS = new Set(['standing', 'seated', 'lying', 'prone', 'kneeling', 'supported', 'hanging', 'dynamic']);

/** Kit básico disponível em praticamente qualquer academia brasileira (halteres, barras, banco, polias ou peso corporal) */
const COMMON_BR_EQUIPMENT_IDS = new Set([
  'bodyweight',
  'dumbbells',
  'barbell',
  'ez_bar',
  'flat_bench',
  'incline_bench',
  'weight_bench',
  'cable_crossover',
  'high_cable_station',
  'low_cable_station',
  'exercise_mat',
  'pull_up_bar',
  'parallel_bars',
  'weight_plates',
  'power_rack',
  'jump_rope',
]);

export interface LibraryValidationIssue {
  exerciseId: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface LibraryValidationReport {
  totalExercises: number;
  valid: boolean;
  errors: LibraryValidationIssue[];
  warnings: LibraryValidationIssue[];
}

export const MANDATORY_REFERENCE_ALIASES: Array<{
  query: string;
  expectedPattern?: RegExp;
  minMatches: number;
  description: string;
}> = [
  { query: 'triceps pulley', minMatches: 1, description: 'Tríceps no pulley / polia' },
  { query: 'triceps polia', minMatches: 1, description: 'Tríceps na polia' },
  { query: 'triceps corda', minMatches: 1, description: 'Tríceps corda' },
  { query: 'extensao de triceps na maquina', minMatches: 1, description: 'Extensão de tríceps na máquina' },
  { query: 'remada maquina', minMatches: 1, description: 'Remada na máquina' },
  { query: 'remada sentada', minMatches: 1, description: 'Remada sentada' },
  { query: 'remada articulada', minMatches: 1, description: 'Remada articulada' },
  { query: 'remada baixa', minMatches: 1, description: 'Remada baixa' },
  { query: 'puxada alta', minMatches: 1, description: 'Puxada alta pulley' },
  { query: 'pulldown', minMatches: 1, description: 'Lat pulldown / pulldown' },
  { query: 'leg 90', minMatches: 1, description: 'Leg Press 90°' },
  { query: 'leg 45', minMatches: 1, description: 'Leg Press 45°' },
  { query: 'hack', minMatches: 1, description: 'Agachamento Hack' },
  { query: 'pendulo', minMatches: 1, description: 'Agachamento Pêndulo' },
  { query: 'extensora', minMatches: 1, description: 'Cadeira Extensora' },
  { query: 'flexora', minMatches: 1, description: 'Cadeira ou Mesa Flexora' },
  { query: 'front squat', minMatches: 1, description: 'Agachamento frontal' },
  { query: 'supino reto', minMatches: 1, description: 'Supino reto' },
  { query: 'supino inclinado', minMatches: 1, description: 'Supino inclinado' },
  { query: 'elevacao pelvica', minMatches: 1, description: 'Elevação pélvica' },
];

/**
 * Valida integralmente uma lista de exercícios contra os critérios do GOAL-33 e LIBRARY §1/§5.
 */
export function validateExerciseLibrary(exercises: Exercise[]): LibraryValidationReport {
  const errors: LibraryValidationIssue[] = [];
  const warnings: LibraryValidationIssue[] = [];

  const exerciseMap = new Map<string, Exercise>();
  const idSet = new Set<string>();

  for (const ex of exercises) {
    if (idSet.has(ex.id)) {
      errors.push({ exerciseId: ex.id, field: 'id', message: `ID duplicado: "${ex.id}"`, severity: 'error' });
    }
    idSet.add(ex.id);
    exerciseMap.set(ex.id, ex);
  }

  // Critério de volume do GOAL-33: pelo menos 175 exercícios válidos
  if (exercises.length < 175) {
    errors.push({
      exerciseId: 'LIBRARY_TOTAL',
      field: 'length',
      message: `Biblioteca contém ${exercises.length} exercícios; mínimo exigido para aceite é 175.`,
      severity: 'error'
    });
  }

  for (const ex of exercises) {
    // 1. Identificação e nomes
    if (!ex.name || ex.name.trim().length < 4) {
      errors.push({ exerciseId: ex.id, field: 'name', message: 'Nome deve ter pelo menos 4 caracteres.', severity: 'error' });
    }
    if (!VALID_LEGACY_MUSCLE_GROUPS.has(ex.muscleGroup)) {
      errors.push({ exerciseId: ex.id, field: 'muscleGroup', message: `Grupo muscular inválido: "${ex.muscleGroup}"`, severity: 'error' });
    }
    if (!VALID_LEVELS.has(ex.level)) {
      errors.push({ exerciseId: ex.id, field: 'level', message: `Nível inválido: "${ex.level}"`, severity: 'error' });
    }

    // 2. Passos de execução (3 a 6 passos)
    if (!Array.isArray(ex.executionSteps) || ex.executionSteps.length < 3 || ex.executionSteps.length > 6) {
      errors.push({
        exerciseId: ex.id,
        field: 'executionSteps',
        message: `Passos de execução devem conter entre 3 e 6 itens (encontrados: ${ex.executionSteps?.length ?? 0}).`,
        severity: 'error'
      });
    }

    // 3. Dicas de postura (>= 1)
    if (!Array.isArray(ex.postureTips) || ex.postureTips.length < 1) {
      errors.push({ exerciseId: ex.id, field: 'postureTips', message: 'Dicas de postura devem conter pelo menos 1 item.', severity: 'error' });
    }

    // 4. Respiração
    if (!ex.breathing || ex.breathing.trim().length < 5) {
      errors.push({ exerciseId: ex.id, field: 'breathing', message: 'Instrução de respiração ausente ou muito curta.', severity: 'error' });
    }

    // 5. Erros comuns (2 a 4)
    if (!Array.isArray(ex.commonErrors) || ex.commonErrors.length < 2 || ex.commonErrors.length > 4) {
      errors.push({
        exerciseId: ex.id,
        field: 'commonErrors',
        message: `Erros comuns devem conter entre 2 e 4 itens (encontrados: ${ex.commonErrors?.length ?? 0}).`,
        severity: 'error'
      });
    }

    // 6. Correções de erros (>= 1)
    if (!Array.isArray(ex.errorCorrections) || ex.errorCorrections.length < 1) {
      errors.push({ exerciseId: ex.id, field: 'errorCorrections', message: 'Correções devem conter pelo menos 1 item.', severity: 'error' });
    }

    // 7. Avisos de segurança e restrições (GOAL-33)
    if (!Array.isArray(ex.safetyWarnings) || ex.safetyWarnings.length < 1) {
      errors.push({ exerciseId: ex.id, field: 'safetyWarnings', message: 'Avisos de segurança devem conter pelo menos 1 item.', severity: 'error' });
    }
    if (!Array.isArray(ex.restrictions) || ex.restrictions.length < 1) {
      errors.push({ exerciseId: ex.id, field: 'restrictions', message: 'Restrições articulares/clínicas devem conter pelo menos 1 item.', severity: 'error' });
    }

    // 8. Dica prática de substituição (GOAL-33)
    if (!ex.substitutionsHint || ex.substitutionsHint.trim().length < 10) {
      errors.push({ exerciseId: ex.id, field: 'substitutionsHint', message: 'Dica de substituição (substitutionsHint) deve ter pelo menos 10 caracteres.', severity: 'error' });
    }

    // 9. Taxonomia GOAL-18A estruturada / canônica ou resolvível
    const primaryId = ex.primaryMuscleGroupId ?? resolveLegacyMuscleGroup(ex.muscleGroup ?? '')?.id;
    if (!primaryId || !validMuscleGroupIds.has(primaryId)) {
      errors.push({ exerciseId: ex.id, field: 'primaryMuscleGroupId', message: `primaryMuscleGroupId inválido ou não resolvível: "${ex.primaryMuscleGroupId ?? ex.muscleGroup}"`, severity: 'error' });
    }
    if (ex.secondaryMuscleGroupIds) {
      for (const smg of ex.secondaryMuscleGroupIds) {
        if (!validMuscleGroupIds.has(smg)) {
          errors.push({ exerciseId: ex.id, field: 'secondaryMuscleGroupIds', message: `Grupo muscular secundário inválido: "${smg}"`, severity: 'error' });
        }
      }
    }
    if (ex.movementPatternIds) {
      for (const mp of ex.movementPatternIds) {
        if (!validMovementPatternIds.has(mp)) {
          errors.push({ exerciseId: ex.id, field: 'movementPatternIds', message: `Padrão de movimento inválido: "${mp}"`, severity: 'error' });
        }
      }
    }
    const resolvedEquipments = ex.equipmentIds && ex.equipmentIds.length > 0
      ? ex.equipmentIds
      : resolveLegacyEquipment(ex.equipment ?? '').equipmentIds;
    if (!resolvedEquipments || resolvedEquipments.length === 0) {
      errors.push({ exerciseId: ex.id, field: 'equipmentIds', message: `Equipamento não resolvível para taxonomia canônica: "${ex.equipment}"`, severity: 'error' });
    } else {
      for (const eq of resolvedEquipments) {
        if (!validEquipmentIds.has(eq)) {
          errors.push({ exerciseId: ex.id, field: 'equipmentIds', message: `Equipamento inválido: "${eq}"`, severity: 'error' });
        }
      }
    }
    if (!ex.mechanics || !VALID_MECHANICS.has(ex.mechanics)) {
      errors.push({ exerciseId: ex.id, field: 'mechanics', message: `Mecânica inválida: "${ex.mechanics}"`, severity: 'error' });
    }
    if (!ex.laterality || !VALID_LATERALITY.has(ex.laterality)) {
      errors.push({ exerciseId: ex.id, field: 'laterality', message: `Lateralidade inválida: "${ex.laterality}"`, severity: 'error' });
    }
    if (!ex.bodyPosition || !VALID_BODY_POSITIONS.has(ex.bodyPosition)) {
      errors.push({ exerciseId: ex.id, field: 'bodyPosition', message: `Posição corporal inválida: "${ex.bodyPosition}"`, severity: 'error' });
    }

    // 10. Substituições válidas e Kit BR Comum
    if (!Array.isArray(ex.substitutions) || ex.substitutions.length === 0) {
      errors.push({ exerciseId: ex.id, field: 'substitutions', message: 'Exercício sem substitutos cadastrados.', severity: 'error' });
    } else {
      let hasCommonBrSubstitute = false;

      for (const subId of ex.substitutions) {
        if (subId === ex.id) {
          errors.push({ exerciseId: ex.id, field: 'substitutions', message: `Exercício não pode ser substituto de si mesmo (${subId}).`, severity: 'error' });
          continue;
        }
        const subEx = exerciseMap.get(subId);
        if (!subEx) {
          errors.push({ exerciseId: ex.id, field: 'substitutions', message: `Substituto inexistente na biblioteca: "${subId}"`, severity: 'error' });
        } else {
          // Verifica se o substituto usa kit BR comum
          const subUsesCommonKit = subEx.equipmentIds?.some((eq) => COMMON_BR_EQUIPMENT_IDS.has(eq));
          if (subUsesCommonKit) {
            hasCommonBrSubstitute = true;
          }
        }
      }

      // Se o próprio exercício já usa kit BR comum, ele mesmo é executável no kit comum.
      // Se ele for de máquina específica (ex: Leg 90, Pêndulo, Pullover máquina), OBRIGATORIAMENTE
      // ao menos um substituto precisa ser realizável com kit BR comum.
      const selfUsesCommonKit = ex.equipmentIds?.some((eq) => COMMON_BR_EQUIPMENT_IDS.has(eq));
      if (!selfUsesCommonKit && !hasCommonBrSubstitute) {
        errors.push({
          exerciseId: ex.id,
          field: 'substitutions',
          message: `Exercício em máquina especializada (${ex.name}) deve ter pelo menos 1 substituto viável com kit BR comum (halteres, barra, banco ou cabo).`,
          severity: 'error'
        });
      }
    }
  }

  // 11. Validação dos aliases de referência obrigatórios (LIBRARY §1 e §5)
  for (const ref of MANDATORY_REFERENCE_ALIASES) {
    const matches = exercises.filter((ex) => matchesExerciseSearch(ex, ref.query));
    if (matches.length < ref.minMatches) {
      errors.push({
        exerciseId: 'SEARCH_ALIAS',
        field: ref.query,
        message: `Busca obrigatória "${ref.query}" (${ref.description}) retornou ${matches.length} resultados (mínimo esperado: ${ref.minMatches}).`,
        severity: 'error'
      });
    }
  }

  return {
    totalExercises: exercises.length,
    valid: errors.length === 0,
    errors,
    warnings
  };
}
