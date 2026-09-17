# Checklist de revisão — Nutricionista (D-NUT-08)

**Público:** nutricionista registrado (CRN)
**Objetivo:** validar explicitamente população, fórmulas, parâmetros, gates e linguagem do V1.
**Isto não é um parecer.** Marcar cada item; o juízo final vai no [formulário de retorno](./NUTRITIONIST_REVIEW_RETURN_FORM.md).

**Fonte de números:** [`GYMFLOW_NUTRITION_SCIENTIFIC_DOSSIER_D_NUT_08.md`](../GYMFLOW_NUTRITION_SCIENTIFIC_DOSSIER_D_NUT_08.md)
**Código:** `src/lib/nutrition/engine.ts`, `engine-types.ts`, `profile-gates.ts`
**Marcador:** todo parâmetro sem consenso universal está com `PROFESSIONAL_REVIEW_REQUIRED` (D-NUT-03).

Legenda: `[ ] Adequado` · `[ ] Com ressalva` · `[ ] Inadequado` · `[ ] Não avaliado`

Para ressalva ou inadequado, copiar o ID (`NUT-CHK-xx`) para `FINDINGS` / `REQUIRED_CHANGES` no formulário.

---

## NUT-CHK-01 — População suportada

**D-NUT-02**, dossiê §3, Masterplan §5.

- Automação de metas: adultos ≥ 18 anos, perfil biométrico completo, sem flags bloqueadoras.
- Limites de gate: altura 100–250 cm; peso 30–300 kg (`BIOMETRIC_LIMITS`).
- Campo metabólico isolado: `biologicalSexForCalcs` (`female` | `male` | `unspecified`), independente de `user.gender`.
- Tracking manual de alimentos permanece disponível mesmo quando a automação está bloqueada.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## NUT-CHK-02 — Mifflin-St Jeor e parâmetros da fórmula

**D-NUT-03**, dossiê §4.1. `formulaVersion` = `mifflin-st-jeor-v1`.

```
base = 10 * weightKg + 6.25 * heightCm - 5 * age
male:        BMR = base + 5
female:      BMR = base - 161
unspecified: BMR = base - 78   // ponto médio aritmético; PROFESSIONAL_REVIEW_REQUIRED
```

- `unspecified` **nunca** usa o offset masculino (+5) — D-NUT-02.
- Harris-Benedict e Katch-McArdle **não** estão no V1 (limitação explícita).

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## NUT-CHK-03 — BMR e TDEE

**D-NUT-03**, dossiê §4.2.

```
TDEE = round(BMR * PAL + dailyTrainingKcal)
dailyTrainingKcal = round(((freq * durationMin) / 7) * trainingKcalPerMinute)
```

PAL vigente (`PROFESSIONAL_REVIEW_REQUIRED`; faixa dura 1.2–1.75):

| Nível | PAL |
| :--- | ---: |
| sedentário | 1.2 |
| pouco ativo | 1.375 |
| moderado | 1.55 |
| muito ativo | 1.725 |

`trainingKcalPerMinute = 6` (valor e teto duro; `PROFESSIONAL_REVIEW_REQUIRED`). Não distingue modalidade nem intensidade real.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## NUT-CHK-04 — Déficit e superávit

**D-NUT-03**, dossiê §4.3. Ajustes por objetivo (`PROFESSIONAL_REVIEW_REQUIRED`):

| Objetivo | kcal/dia |
| :--- | ---: |
| `fat_loss_aggressive` | −500 |
| `fat_loss_moderate` | −350 |
| `maintenance` | 0 |
| `hypertrophy_lean` | +200 |
| `hypertrophy_aggressive` | +400 |
| `strength_performance` | +150 |

Travas duras (`ENGINE_HARD_SAFETY_LIMITS`):

- déficit absoluto ≤ 750 kcal/dia;
- superávit programado ≤ 400 kcal/dia;
- em déficit, alvo ≥ BMR × 0.90 (`PROFESSIONAL_REVIEW_REQUIRED`);
- piso female 1200 kcal; male 1500 kcal; unspecified 1200 kcal (nunca o piso masculino).

Pisos são invariantes, não configuráveis.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## NUT-CHK-05 — Proteína e teto 2.2 g/kg

**D-NUT-04**, dossiê §4.4.

- Automação estrita **1.6–2.2 g/kg/dia**.
- Teto duro `MAX_PROTEIN_GRAMS_PER_KG = 2.2`, reaplicado após arredondamento inteiro.
- Taxas por objetivo (`PROFESSIONAL_REVIEW_REQUIRED`): 2.2 / 2.0 / 1.8 / 1.8 / 1.7 / 1.9 g/kg (agressivo → performance, na ordem do dossiê).
- Valores > 2.2 g/kg **não** são automatizados (ajuste manual / supervisão ficam fora do motor).

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## NUT-CHK-06 — Hidratação

**D-NUT-03**, dossiê §4.6.

```
baseMl = weightKg * 35
trainingMl = (freq * durationMin) / (7 * 60) * 500
target = clamp(baseMl + trainingMl, 1500, 4500)  // depois arredonda
```

- 35 ml/kg e +500 ml/h: `PROFESSIONAL_REVIEW_REQUIRED`.
- Teto 4500 ml (prevenção de hiponatremia); piso 1500 ml.
- **P3 conhecido:** o clamp **não é sinalizado** no output. Avaliar se o silêncio é aceitável no V1.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## NUT-CHK-07 — Gates clínicos

**D-NUT-02**, dossiê §3. Precedência estrita de `evaluateNutritionGate`:

1. **BLOCK_AUTOMATIC_TARGET** — idade < 18; `pregnancy`; `lactation`; `chronic_kidney_disease`; `underage`. Sem metas automáticas.
2. **PROFESSIONAL_REFERRAL** — `eating_disorder_history`; `type_1_diabetes`; `type_2_diabetes_uncontrolled`; `severe_cardiovascular_condition`. Encaminhamento; automação bloqueada.
3. **LIMITED_GUIDANCE** — `biologicalSexForCalcs === 'unspecified'` ou biometria incompleta/limítrofe. Sem default masculino. Pode emitir faixas ±15% se biometria completa.
4. **NORMAL_FLOW** — adulto ≥ 18, perfil completo, sem flags bloqueadoras.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## NUT-CHK-08 — Parâmetros `PROFESSIONAL_REVIEW_REQUIRED`

**D-NUT-03.** Lista operacional (valores vigentes no dossiê / `DEFAULT_CALCULATION_CONFIG`):

| Parâmetro | Valor V1 |
| :--- | :--- |
| Offset BMR unspecified | −78 |
| PAL (4 níveis) | 1.2 / 1.375 / 1.55 / 1.725 |
| kcal/min treino | 6 |
| Ajustes por objetivo | −500 / −350 / 0 / +200 / +400 / +150 |
| Déficit máx. absoluto | 750 kcal |
| Multiplicador BMR em déficit | 0.90 |
| Pisos kcal | 1200 / 1500 / 1200 |
| Proteína por objetivo | 2.2–1.7 g/kg (tabela CHK-05) |
| Lipídios | 0.7–1.0 g/kg; default 0.85 |
| Preferência CHO não-cetogênico | 120 g (best-effort) |
| CHO cetogênico | 30 g (**sem** faixa canônica extra — P3) |
| Hidratação | 35 ml/kg; +500 ml/h; min 1500; max 4500 |

Macros: se constraints não cabem, o motor declara inviabilidade (`macroReconciliation`); **não** escolhe qual constraint sacrificar com regra clínica nova.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## NUT-CHK-09 — Linguagem e limites das sugestões

**D-NUT-08** (escopo ético da saída). Toda meta automática: `scientificStatus` provisório.

Textos já na UI (dossiê jurídico §3 — avaliar adequação clínica da mensagem, não o contrato):

- Metas / orientação limitada: *“Não substitui acompanhamento profissional.”*
- Sugestões offline: não são planejamento alimentar individualizado nem prescrição; não substituem nutricionista clínico.
- IA: não é prescrição; não substitui nutricionista clínico.

Estados honestos sem números fabricados: `AI_UNAVAILABLE`, `MANUAL_ONLY`, `CLINICAL_GATE_BLOCKED`, proposta vazia.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## NUT-CHK-10 — Casos de teste relevantes (evidência, não reexecução)

Dossiê científico §6; QA NUT-008; `nut008-d-nut-matrix.test.ts`.

| Caso | Onde |
| :--- | :--- |
| Determinismo SHA-256 | `engine.test.ts` §1 |
| unspecified ≠ male (BMR, piso, ±15%) | `engine.test.ts` §6, §31, §36; `profile-gates.test.ts` |
| Proteína ≤ 2.2 g/kg; rejeição acima | `engine.test.ts` §16, §17, §31, §35 |
| Déficit ≤ 750; pisos 1200/1500 | `engine.test.ts` §31 e corretivos de safety |
| Gates BLOCK / REFERRAL / LIMITED / NORMAL | `profile-gates.test.ts` |
| Fluxo perfil → ledger | `nut008-integrated-flow.test.ts` |
| Matriz D-NUT | `nut008-d-nut-matrix.test.ts` |

Confirmar se a cobertura é suficiente para homologar o V1, **sem** exigir neste GOAL nova suíte.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## Limitações já declaradas (não omitir na leitura)

Dossiê científico §5: equações populacionais; Mifflin provisória; offset −78 sem evidência clínica própria; 6 kcal/min simplificado; peso absurdo ainda gera BMR absurdo por *dado*; CHO cetogênico sem faixa extra; **sem aprovação CRN até este retorno**.

P3 para juízo explícito: teto biométrico superior; sinalização do clamp hídrico; faixa de `ketogenicCarbsGrams`; papel de `minProteinGramsPerKg` (hoje só validação).

---

**D_NUT_08_EXTERNAL_APPROVAL permanece PENDING até o formulário identificado ser devolvido.**
**READY_FOR_PUBLIC_BETA = NO**
