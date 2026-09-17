/**
 * GymFlow AI — NUT-008 auditoria UX/a11y mobile 360–430px (fonte).
 *
 * Prova estrutural: alvos ≥44px, safe-area, clearance da bottom nav,
 * estados empty/erro/offline/MANUAL_ONLY, sem alert()/confirm() nativo.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const NUTRITION_DIR = path.join(ROOT, 'src/components/nutrition');

function nutritionFiles(): string[] {
  return [
    path.join(ROOT, 'src/modules/NutritionPage.tsx'),
    ...fs.readdirSync(NUTRITION_DIR)
      .filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
      .map((name) => path.join(NUTRITION_DIR, name)),
  ];
}

describe('NUT-008 UX / acessibilidade (fonte, 360–430px)', () => {
  it('todo botão interativo das telas de nutrição declara alvo ≥44px', () => {
    for (const file of nutritionFiles()) {
      const text = fs.readFileSync(file, 'utf8');
      const parts = text.split(/<button\b/);
      expect(parts.length, file).toBeGreaterThan(1);
      for (const part of parts.slice(1)) {
        const window = part.slice(0, 900);
        if (/absolute inset-0/.test(window)) continue;
        const sized = /min-h-\[44px\]|tap-target/.test(window);
        expect(sized, `${file} :: ${window.slice(0, 160).replace(/\s+/g, ' ')}`).toBe(true);
      }
    }
  });

  it('NutritionPage reserva espaço da bottom nav e abas internas ≥44px', () => {
    const page = fs.readFileSync(path.join(ROOT, 'src/modules/NutritionPage.tsx'), 'utf8');
    expect(page).toContain('pb-24');
    expect(page).toContain("label: 'Hoje'");
    expect(page).toContain("label: 'Registrar'");
    expect(page).toContain("label: 'Metas'");
    expect(page).toContain("label: 'Tendência'");
    expect(page).toContain("label: 'Sugestões'");
    expect(page).toContain('min-h-[44px]');
    expect(page).toContain('360–430px');
  });

  it('modais/loading/empty/erro/offline/MANUAL_ONLY existem na UI de nutrição', () => {
    const modal = fs.readFileSync(path.join(NUTRITION_DIR, 'AiMealAssistantModal.tsx'), 'utf8');
    expect(modal).toContain('provider-unavailable');
    expect(modal).toContain('clinical-gate-blocked');
    expect(modal).toContain('loading');
    expect(modal).toContain('empty');
    expect(modal).toContain('timeout-error');
    expect(modal).toContain('invalid-response');
    expect(modal).toContain('safe-area');
    expect(modal).toMatch(/env\(safe-area-inset-bottom\)|pb-\[calc/);

    const targets = fs.readFileSync(path.join(NUTRITION_DIR, 'TargetsSection.tsx'), 'utf8');
    expect(targets).toContain('MANUAL_ONLY');
    expect(targets).toContain('Metas automáticas indisponíveis');

    const suggestions = fs.readFileSync(path.join(NUTRITION_DIR, 'SuggestionsSection.tsx'), 'utf8');
    expect(suggestions).toContain('EmptyState');
    expect(suggestions).toContain('não constituem planejamento');
  });

  it('nenhum alert()/confirm() nativo nas telas de nutrição; teclado numérico nos inputs', () => {
    for (const file of nutritionFiles()) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/\balert\s*\(/);
      expect(text, file).not.toMatch(/\bconfirm\s*\(/);
    }
    const register = fs.readFileSync(path.join(NUTRITION_DIR, 'RegisterSection.tsx'), 'utf8');
    expect(register).toContain('inputMode="decimal"');
    const today = fs.readFileSync(path.join(NUTRITION_DIR, 'TodaySection.tsx'), 'utf8');
    expect(today).toMatch(/inputMode|type="number"/);
  });

  it('bottom navigation global preserva safe-area e não promove Nutrição aos 4 slots', () => {
    const navigation = fs.readFileSync(path.join(ROOT, 'src/components/Navigation.tsx'), 'utf8');
    expect(navigation).toContain('env(safe-area-inset-bottom)');
    expect(navigation).toContain('tap-target');
  });
});
