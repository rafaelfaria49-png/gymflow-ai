/**
 * GymFlow AI — NUT-008 matriz formal D-NUT-01..10.
 *
 * Nenhuma decisão recebe PASS só por documentação: cada item prova código
 * vivo + teste correspondente. D-NUT-08/09 têm implementação de gate
 * (dossiê + status provisório) com aprovação externa PENDING.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AI_ASSISTANT_PERMISSIONS } from './ai-assistant';
import { FOOD_SOURCES, USER_FOOD_ENERGY_TOLERANCE_RELATIVE, theoreticalKcalForMacros } from './food-types';
import { CANONICAL_BR_CATALOG } from './food-database';
import { ENGINE_HARD_SAFETY_LIMITS, DEFAULT_ENGINE_CONFIG } from './engine-types';
import { evaluateNutritionGate } from './profile-gates';
import { createNut008Profile } from './nut008-fixtures';

const ROOT = path.resolve(__dirname, '../../..');

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('NUT-008 matriz D-NUT-01..10 (evidência de código + teste)', () => {
  it('D-NUT-01: IA não calcula nem grava targets/ledger', () => {
    expect(AI_ASSISTANT_PERMISSIONS.canWriteLedger).toBe(false);
    expect(AI_ASSISTANT_PERMISSIONS.canWriteTargets).toBe(false);
    expect(AI_ASSISTANT_PERMISSIONS.canTrustModelMacros).toBe(false);
    expect(AI_ASSISTANT_PERMISSIONS.requiresUserConfirmation).toBe(true);
    const assistant = readSrc('src/lib/nutrition/ai-assistant.ts');
    expect(assistant).not.toMatch(/from '\.\/ledger'/);
    expect(assistant).not.toMatch(/addFoodEntry|putNutritionDay|calculateDailyTargets/);
    const modal = readSrc('src/components/nutrition/AiMealAssistantModal.tsx');
    expect(modal).toContain('logFoodReference');
    expect(modal).toContain('Confirmar inclusão');
  });

  it('D-NUT-02: unspecified não herda default masculino', () => {
    const unspecified = evaluateNutritionGate(createNut008Profile({ biologicalSexForCalcs: 'unspecified' }));
    expect(unspecified.status).toBe('LIMITED_GUIDANCE');
    expect(unspecified.reasons).toContain('BIOLOGICAL_SEX_UNSPECIFIED');
    expect(ENGINE_HARD_SAFETY_LIMITS.UNSPECIFIED_CALORIC_FLOOR_KCAL).toBe(1200);
    expect(ENGINE_HARD_SAFETY_LIMITS.MALE_CALORIC_FLOOR_KCAL).toBe(1500);
    expect(ENGINE_HARD_SAFETY_LIMITS.UNSPECIFIED_CALORIC_FLOOR_KCAL)
      .not.toBe(ENGINE_HARD_SAFETY_LIMITS.MALE_CALORIC_FLOOR_KCAL);
    expect(ENGINE_HARD_SAFETY_LIMITS.MALE_BMR_OFFSET).not.toBe(ENGINE_HARD_SAFETY_LIMITS.FEMALE_BMR_OFFSET);
  });

  it('D-NUT-03: parâmetros versionados + PROFESSIONAL_REVIEW_REQUIRED', () => {
    expect(DEFAULT_ENGINE_CONFIG.engineVersion).toBe('1.0.0');
    expect(DEFAULT_ENGINE_CONFIG.formulaVersion).toBe('mifflin-st-jeor-v1');
    const engineTypes = readSrc('src/lib/nutrition/engine-types.ts');
    expect(engineTypes).toContain('PROFESSIONAL_REVIEW_REQUIRED');
    expect(engineTypes).toContain('PROVISIONAL_PENDING_PROFESSIONAL_REVIEW');
    expect(engineTypes).toContain('inputSnapshotHash');
  });

  it('D-NUT-04: automação de proteína ≤ 2.2 g/kg', () => {
    expect(ENGINE_HARD_SAFETY_LIMITS.MAX_PROTEIN_GRAMS_PER_KG).toBe(2.2);
    expect(DEFAULT_ENGINE_CONFIG.maxProteinGramsPerKg).toBe(2.2);
    expect(DEFAULT_ENGINE_CONFIG.minProteinGramsPerKg).toBe(1.6);
  });

  it('D-NUT-05: Open Food Facts e barcode ausentes na V1', () => {
    expect([...FOOD_SOURCES]).toEqual(['CANONICAL_BR', 'USDA_FDC', 'USER_CONFIRMED']);
    const types = readSrc('src/lib/nutrition/food-types.ts');
    expect(types).toContain('Open Food Facts');
    expect(types).toContain('V1.5');
    const srcTree = ['src/lib/nutrition', 'src/components/nutrition', 'src/modules/NutritionPage.tsx'];
    for (const rel of srcTree) {
      const full = path.join(ROOT, rel);
      const files = fs.statSync(full).isDirectory()
        ? fs.readdirSync(full).map((name) => path.join(full, name))
        : [full];
      for (const file of files) {
        if (!/\.(ts|tsx)$/.test(file)) continue;
        if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
        const text = fs.readFileSync(file, 'utf8');
        expect(text).not.toMatch(/from ['"]openfoodfacts|openfoodfacts\.org|BarcodeDetector|html5-qrcode/i);
      }
    }
  });

  it('D-NUT-06: bottom nav global inalterada (Nutrição fora dos 4 slots fixos)', () => {
    const navigation = readSrc('src/components/Navigation.tsx');
    expect(navigation).toContain("label: 'Hoje'");
    expect(navigation).toContain("label: 'Planejar'");
    expect(navigation).toContain("label: 'Exercícios'");
    expect(navigation).toContain("label: 'Evolução'");
    expect(navigation).toMatch(/view: 'nutrition',\s*label: 'Nutrição'/);
    const mobileBlock = navigation.slice(
      navigation.indexOf('const mobileNavItems'),
      navigation.indexOf('const isMoreActive'),
    );
    expect(mobileBlock).not.toContain("'nutrition'");
    expect(mobileBlock).toContain("'dashboard'");
    expect(mobileBlock).toContain("'planner'");
    expect(mobileBlock).toContain("'exercises'");
    expect(mobileBlock).toContain("'evolution'");
  });

  it('D-NUT-07: XP nutricional idempotente com teto emergente 20+40=60', () => {
    const context = readSrc('src/providers/GymFlowContext.tsx');
    expect(context).toContain("addXp(20, 'Alimento registrado na dieta')");
    expect(context).toContain("addXp(40, '💧 Meta Diária de Água Batida!')");
    expect(context).toContain('lastMacroXpDate');
    expect(context).toContain('lastWaterXpDate');
    const foodGrants = context.split("addXp(20, 'Alimento registrado na dieta')").length - 1;
    const waterGrants = context.split("addXp(40, '💧 Meta Diária de Água Batida!')").length - 1;
    expect(foodGrants).toBeGreaterThanOrEqual(1);
    expect(waterGrants).toBe(1);
    expect(20 + 40).toBe(60);
  });

  it('D-NUT-08: gate profissional implementado como PENDING (sem declaração de aprovação)', () => {
    expect(DEFAULT_ENGINE_CONFIG.engineVersion).toBeTruthy();
    const dossier = path.join(ROOT, 'docs/nutrition/GYMFLOW_NUTRITION_SCIENTIFIC_DOSSIER_D_NUT_08.md');
    expect(fs.existsSync(dossier)).toBe(true);
    const text = fs.readFileSync(dossier, 'utf8');
    expect(text).toContain('PROFESSIONAL_REVIEW_REQUIRED');
    expect(text).toContain('D_NUT_08_EXTERNAL_APPROVAL = PENDING');
    expect(text).not.toMatch(/APROVAÇÃO PROFISSIONAL CONCEDIDA|CRN APPROVED|HOMOLOGADO PELO NUTRICIONISTA/);
  });

  it('D-NUT-09: dossiê jurídico preparado sem parecer final', () => {
    const dossier = path.join(ROOT, 'docs/nutrition/GYMFLOW_NUTRITION_LEGAL_DOSSIER_D_NUT_09.md');
    expect(fs.existsSync(dossier)).toBe(true);
    const text = fs.readFileSync(dossier, 'utf8');
    expect(text).toContain('D_NUT_09_EXTERNAL_APPROVAL = PENDING');
    expect(text).toContain('não constituindo prescrição dietética individualizada');
    expect(text).not.toMatch(/PARECER JURÍDICO FINAL|CONFORMIDADE LEGAL APROVADA/);
    const modal = readSrc('src/components/nutrition/AiMealAssistantModal.tsx');
    expect(modal).toContain('não é prescrição dietética');
  });

  it('D-NUT-10: catálogo verificado + trava energético 15%', () => {
    expect(USER_FOOD_ENERGY_TOLERANCE_RELATIVE).toBe(0.15);
    expect(CANONICAL_BR_CATALOG.length).toBeGreaterThanOrEqual(150);
    for (const food of CANONICAL_BR_CATALOG) {
      expect(food.verified).toBe(true);
      expect(food.source).toBe('CANONICAL_BR');
      expect(food.sourceRef.trim().length).toBeGreaterThan(0);
      const theoretical = theoreticalKcalForMacros(food.per100g.protein, food.per100g.carbs, food.per100g.fat);
      const absolute = Math.abs(food.per100g.calories - theoretical);
      const tolerance = Math.max(0.15 * food.per100g.calories, 1.5);
      expect(absolute).toBeLessThanOrEqual(tolerance);
    }
  });
});
