# Dossiê Científico — NutritionEngine V1 (D-NUT-08)

**Documento:** `GYMFLOW_NUTRITION_SCIENTIFIC_DOSSIER_D_NUT_08`  
**GOAL:** GYMFLOW-NUT008-INTEGRATED-QA-BETA-READINESS-ENDTOEND-111  
**Público:** nutricionista registrado (CRN) para revisão profissional  
**Status deste dossiê:** pronto para revisão humana  
**D_NUT_08_EXTERNAL_APPROVAL = PENDING**  
**PROFESSIONAL_REVIEW_REQUIRED = YES**

Este dossiê descreve o motor determinístico vigente no código. **Não declara aprovação profissional, chancela clínica, nem homologação pelo CRN.** Nenhum parâmetro provisório deixa de ser provisório por existir este texto.

Código de autoridade:

- `src/lib/nutrition/engine.ts`
- `src/lib/nutrition/engine-types.ts`
- `src/lib/nutrition/profile-gates.ts`
- `src/types/nutrition.ts`
- Testes: `src/lib/nutrition/engine.test.ts`, `src/lib/nutrition/profile-gates.test.ts`, `src/lib/nutrition/nut008-d-nut-matrix.test.ts`

---

## 1. Posicionamento científico do produto

O `NutritionEngine` gera **estimativas de metas diárias** (energia, macros, hidratação) para **adultos saudáveis** com perfil biométrico completo. Não é software de prescrição dietética, diagnóstico ou tratamento. Toda saída automática carrega:

```
scientificStatus: 'PROVISIONAL_PENDING_PROFESSIONAL_REVIEW'
```

Parâmetros sem consenso biológico universal estão marcados no código com `PROFESSIONAL_REVIEW_REQUIRED`.

---

## 2. Versões

| Campo | Valor vigente |
| :--- | :--- |
| `engineVersion` | `1.0.0` |
| `formulaVersion` | `mifflin-st-jeor-v1` |
| Proveniência | `inputSnapshotHash` SHA-256 canônico de todo `ResolvedCalculationConfig` efetivo |
| Identidade de evento | `DailyTargets.id` deriva de snapshot + `computedAt` + `computedReason` |
| `computedAt` | só com contexto explícito; senão `null` + `computedAtSource: 'absent'` |

---

## 3. População suportada e gates (D-NUT-02)

`evaluateNutritionGate(profile)` — precedência estrita:

1. **BLOCK_AUTOMATIC_TARGET** — idade < 18; flags `pregnancy`, `lactation`, `chronic_kidney_disease`, `underage`. Sem metas automáticas.
2. **PROFESSIONAL_REFERRAL** — `eating_disorder_history`, `type_1_diabetes`, `type_2_diabetes_uncontrolled`, `severe_cardiovascular_condition`. Encaminhamento; automação bloqueada.
3. **LIMITED_GUIDANCE** — `biologicalSexForCalcs === 'unspecified'` ou biometria incompleta/limítrofe. Sem default masculino. Pode emitir faixas estimadas (±15%) se biometria for completa.
4. **NORMAL_FLOW** — adulto ≥ 18, perfil completo, sem flags bloqueadoras.

Campo metabólico isolado: `biologicalSexForCalcs: 'female' | 'male' | 'unspecified'`. Independente de `user.gender`.

Limites biométricos de gate: idade adulta 18; altura 100–250 cm; peso 30–300 kg (`BIOMETRIC_LIMITS`).

---

## 4. Fórmulas

### 4.1 BMR — Mifflin-St Jeor (`mifflin-st-jeor-v1`)

```
base = 10 * weightKg + 6.25 * heightCm - 5 * age
male:         BMR = base + 5
female:       BMR = base - 161
unspecified:  BMR = base - 78   // ponto médio; PROFESSIONAL_REVIEW_REQUIRED
```

`unspecified` **nunca** recebe o offset masculino (+5).

### 4.2 TDEE

```
PAL = palFactors[nonExerciseActivity]
dailyTrainingMinutes = (trainingFrequencyDaysPerWeek * averageTrainingDurationMinutes) / 7
dailyTrainingKcal = round(dailyTrainingMinutes * trainingKcalPerMinute)
TDEE = round(BMR * PAL + dailyTrainingKcal)
```

PAL vigente (PROFESSIONAL_REVIEW_REQUIRED): sedentário 1.2; pouco ativo 1.375; moderado 1.55; muito ativo 1.725. Faixa dura 1.2–1.75.

`trainingKcalPerMinute = 6` (teto duro idêntico). PROFESSIONAL_REVIEW_REQUIRED.

### 4.3 Alvo calórico

Ajuste por objetivo (kcal/dia, PROFESSIONAL_REVIEW_REQUIRED):

| Objetivo | Ajuste |
| :--- | ---: |
| `fat_loss_aggressive` | −500 |
| `fat_loss_moderate` | −350 |
| `maintenance` | 0 |
| `hypertrophy_lean` | +200 |
| `hypertrophy_aggressive` | +400 |
| `strength_performance` | +150 |

Travas duras (`ENGINE_HARD_SAFETY_LIMITS`):

- Déficit absoluto ≤ 750 kcal/dia
- Superávit programado ≤ 400 kcal/dia
- Em déficit, alvo ≥ BMR × 0.90
- Piso female 1200 kcal; male 1500 kcal; unspecified 1200 kcal (nunca o piso masculino)

### 4.4 Proteína (D-NUT-04)

Automação estrita **1.6–2.2 g/kg/dia**. Teto duro `MAX_PROTEIN_GRAMS_PER_KG = 2.2`. Reaplicado após arredondamento inteiro. Taxas por objetivo (PROFESSIONAL_REVIEW_REQUIRED): 2.2 / 2.0 / 1.8 / 1.8 / 1.7 / 1.9 g/kg.

Valores > 2.2 g/kg **não são automatizados**. Ajuste manual do usuário ou supervisão profissional ficam fora do motor.

### 4.5 Lipídios e carboidratos

- Gordura: 0.7–1.0 g/kg/dia; default 0.85 g/kg (PROFESSIONAL_REVIEW_REQUIRED)
- Preferência de carboidrato não-cetogênico: 120 g (best-effort; cede ao lipídio essencial)
- Cetogênico: 30 g (PROFESSIONAL_REVIEW_REQUIRED; sem número canônico adicional)

Macros reconciliam ou declaram inviabilidade (`macroReconciliation`). Nenhuma regra clínica nova escolhe qual constraint sacrificar.

### 4.6 Hidratação

```
baseMl = weightKg * 35
trainingMl = (freq * durationMin) / (7 * 60) * 500
target = clamp(baseMl + trainingMl, 1500, 4500)  // depois arredonda
```

PROFESSIONAL_REVIEW_REQUIRED (35 ml/kg e +500 ml/h). Teto 4500 ml (prevenção de hiponatremia). O clamp hoje **não é sinalizado** no output (pendência P3 conhecida; não inventar honesta nova neste GOAL).

---

## 5. Limitações explícitas (para o revisor)

1. Equações populacionais, não individualizadas (sem DEXA, sem calorimetria, sem massa magra medida).
2. Mifflin-St Jeor escolhida como provisória; Harris-Benedict / Katch-McArdle não estão no V1.
3. Offset `unspecified = −78` é ponto médio aritmético, não evidência clínica própria.
4. Custo de treino 6 kcal/min é simplificação; não distingue modalidade nem intensidade real.
5. Sem teto biométrico superior canônico além dos limites de gate (peso absurdo ainda produz BMR absurdo por *dado*).
6. `ketogenicCarbsGrams` sem faixa canônica extra.
7. Sem aprovação CRN. `READY_FOR_PUBLIC_BETA = NO` até D-NUT-08 e D-NUT-09 externos.

---

## 6. Casos de teste relevantes

| Caso | Onde |
| :--- | :--- |
| Determinismo SHA-256 | `engine.test.ts` §1 |
| unspecified ≠ male (BMR, piso, ±15%) | `engine.test.ts` §6, §31, §36; `profile-gates.test.ts` D-NUT-02 |
| Proteína ≤ 2.2 g/kg, rejeição de config acima | `engine.test.ts` §16, §17, §31, §35 |
| Déficit ≤ 750, pisos 1200/1500 | `engine.test.ts` §31 e corretivos de safety |
| Gates BLOCK / REFERRAL / LIMITED / NORMAL | `profile-gates.test.ts` |
| Fluxo perfil → ledger | `nut008-integrated-flow.test.ts` |
| Matriz D-NUT | `nut008-d-nut-matrix.test.ts` |

---

## 7. Pedido à revisão profissional

Revisar, sem que o software declare o resultado:

1. Adequação de Mifflin-St Jeor V1 e do offset −78 para `unspecified`
2. PAL, custo de treino, ajustes por objetivo, pisos calóricos
3. Faixa proteica 1.6–2.2 g/kg e teto duro
4. Hidratação 35 ml/kg + 500 ml/h e teto 4500 ml
5. População incluída/excluída pelos gates
6. Textos de orientação limitada e encaminhamento

**D_NUT_08_EXTERNAL_APPROVAL = PENDING**  
**READY_FOR_NUTRITIONIST_REVIEW = YES**  
**READY_FOR_PUBLIC_BETA = NO**
