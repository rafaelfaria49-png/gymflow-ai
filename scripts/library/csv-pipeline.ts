import { Exercise } from '../../src/types';

/**
 * Utilitário de serialização e desserialização CSV↔JSON para a biblioteca de exercícios (GOAL-33).
 * Suporta listas separadas por ponto-e-vírgula dentro das colunas.
 */

const CSV_COLUMNS = [
  'id',
  'name',
  'muscleGroup',
  'primaryMuscleGroupId',
  'secondaryMuscleGroupIds',
  'movementPatternIds',
  'equipment',
  'equipmentIds',
  'mechanics',
  'laterality',
  'bodyPosition',
  'level',
  'executionSteps',
  'postureTips',
  'breathing',
  'commonErrors',
  'errorCorrections',
  'variations',
  'substitutions',
  'safetyWarnings',
  'restrictions',
  'substitutionsHint',
  'searchTerms'
] as const;

function escapeCsvField(value: unknown): string {
  if (value === undefined || value === null) return '""';
  if (Array.isArray(value)) {
    const joined = value.map((v) => String(v).replace(/;/g, ',')).join('; ');
    return `"${joined.replace(/"/g, '""')}"`;
  }
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export function exportLibraryToCsv(exercises: Exercise[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = exercises.map((ex) => {
    return CSV_COLUMNS.map((col) => {
      const val = (ex as unknown as Record<string, unknown>)[col];
      return escapeCsvField(val);
    }).join(',');
  });
  return [header, ...rows].join('\n');
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
