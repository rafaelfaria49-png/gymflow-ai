# Handoff — Revisões humanas obrigatórias da Nutrição V1

**GOAL:** `GYMFLOW-NUTRITION-EXTERNAL-REVIEW-HANDOFF-112`
**Pacote:** `docs/nutrition/external-review/`
**Data do handoff:** 2026-09-17
**Base git:** `origin/master` = `7f9a300c79086f27902a7c0679e41aacd2085b5f`

Este índice é o ponto único de envio para as duas revisões externas.
**Não é parecer científico. Não é parecer jurídico. Não declara aprovação.**

```
SCIENTIFIC_HANDOFF = READY
LEGAL_HANDOFF = READY
ENGINEERING_CODE_CHANGED = NO
EXTERNAL_APPROVAL_FABRICATED = NO
READY_FOR_PUBLIC_BETA = NO

NUT008_STATUS = INTEGRATED
NUTRITION_V1_ENGINEERING_STATUS = COMPLETE
READY_FOR_NUTRITIONIST_REVIEW = YES
READY_FOR_LEGAL_REVIEW = YES
D_NUT_08_EXTERNAL_APPROVAL = PENDING
D_NUT_09_EXTERNAL_APPROVAL = PENDING
```

---

## 1. Estado técnico atual

A engenharia da Nutrição V1 está **completa e integrada** (NUT-001 … NUT-008). O motor determinístico, gates clínicos, ledger, catálogo, UX mobile e assistente de IA read-only estão no código de `master`.

O que o produto **é**:

- ferramenta local-first de autogestão de hábitos de treino e alimentação;
- metas diárias **estimadas** pelo `NutritionEngine` (`engineVersion` `1.0.0`, `formulaVersion` `mifflin-st-jeor-v1`);
- toda saída automática com `scientificStatus: 'PROVISIONAL_PENDING_PROFESSIONAL_REVIEW'`;
- IA propositiva, grounded no catálogo, **sem** calcular ou gravar metas.

O que o produto **não é**:

- software de prescrição dietética, diagnóstico ou tratamento;
- consultório virtual;
- substituto de nutricionista (CRN) ou médico;
- beta público, cobrança comercial ou campanha de nutrição.

Fora deste pacote (não iniciar): V1.5, Open Food Facts / barcode (D-NUT-05), pagamento real.

---

## 2. O que já foi validado internamente

Fonte: [`GYMFLOW_NUTRITION_NUT008_INTEGRATED_QA_001.md`](../GYMFLOW_NUTRITION_NUT008_INTEGRATED_QA_001.md) e [`GYMFLOW_NUTRITION_D_NUT_01_10_MATRIX_001.md`](../GYMFLOW_NUTRITION_D_NUT_01_10_MATRIX_001.md).

| Frente | Resultado de engenharia |
| :--- | :--- |
| Fluxo perfil → gates → engine → ledger → IA → backup | PASS |
| Matriz D-NUT-01 … D-NUT-10 (implementação) | PASS |
| Stress / performance / web QA | PASS |
| Runtime de IA via gateway GymFlow (5 casos + 2 negativos) | PASS |
| Exposição de segredo / chamada direta OpenRouter no client | NO / NO |
| Build, typecheck, testes focados e suíte completa (NUT-008) | PASS |
| QA em dispositivo Android físico | NOT_AVAILABLE (não fabricado) |

D-NUT-01 a D-NUT-07 e D-NUT-10: **PASS de engenharia** (código + teste).
D-NUT-08 e D-NUT-09: **PASS de engenharia do gate** (status provisório, dossiês emitidos, beta bloqueado) — **não** equivalem a homologação humana.

Pendências P3 conhecidas (não bloqueiam este handoff; não inventar correção aqui): clamp de hidratação não sinalizado; `ketogenicCarbsGrams` sem faixa canônica extra; teto biométrico superior por dado; `minProteinGramsPerKg` só valida. Ver `docs/PENDENCIAS.md` (NUT-003).

---

## 3. O que NÃO foi aprovado externamente

| Gate | Valor vigente | Significado |
| :--- | :--- | :--- |
| D-NUT-08 (CRN) | `PENDING` | Sem chancela profissional dos parâmetros do motor |
| D-NUT-09 (jurídico) | `PENDING` | Sem parecer de termos, responsabilidade ou comercialização |
| Beta público | `NO` | Condicionado a D-NUT-08 **e** D-NUT-09 externos |
| Cobrança / campanha de nutrição | não autorizada | Condicionada a D-NUT-09 (decisão canônica) |

Nenhum campo de formulário neste pacote vem preenchido com aprovação.

---

## 4. O que cada revisor deve ler

### Nutricionista (D-NUT-08) — ordem sugerida

1. **Este índice** (contexto e limites do pedido)
2. Checklist: [`NUTRITIONIST_REVIEW_CHECKLIST_D_NUT_08.md`](./NUTRITIONIST_REVIEW_CHECKLIST_D_NUT_08.md)
3. Dossiê científico: [`GYMFLOW_NUTRITION_SCIENTIFIC_DOSSIER_D_NUT_08.md`](../GYMFLOW_NUTRITION_SCIENTIFIC_DOSSIER_D_NUT_08.md)
4. Decisões: [`GYMFLOW_NUTRITION_DECISIONS_001.md`](../GYMFLOW_NUTRITION_DECISIONS_001.md) — sobretudo D-NUT-02, D-NUT-03, D-NUT-04, D-NUT-08
5. Evidência de testes (referência, não reexecução): dossiê §6 + QA NUT-008
6. Resposta: [`NUTRITIONIST_REVIEW_RETURN_FORM.md`](./NUTRITIONIST_REVIEW_RETURN_FORM.md)

Aprofundamento opcional: Masterplan §5 (população/gates), §7.2 (fórmulas), §8 (macros) em [`GYMFLOW_NUTRITION_MASTERPLAN_001.md`](../GYMFLOW_NUTRITION_MASTERPLAN_001.md).
Autoridade de código (consulta, não alteração neste GOAL): `src/lib/nutrition/engine.ts`, `engine-types.ts`, `profile-gates.ts`.

### Jurídico (D-NUT-09) — ordem sugerida

1. **Este índice**
2. Checklist: [`LEGAL_REVIEW_CHECKLIST_D_NUT_09.md`](./LEGAL_REVIEW_CHECKLIST_D_NUT_09.md)
3. Dossiê jurídico: [`GYMFLOW_NUTRITION_LEGAL_DOSSIER_D_NUT_09.md`](../GYMFLOW_NUTRITION_LEGAL_DOSSIER_D_NUT_09.md)
4. Decisões: D-NUT-01, D-NUT-05, D-NUT-08, D-NUT-09
5. QA NUT-008 (privacidade, runtime de IA, disclaimers de UI)
6. Resposta: [`LEGAL_REVIEW_RETURN_FORM.md`](./LEGAL_REVIEW_RETURN_FORM.md)

Aprofundamento opcional: UI `AiMealAssistantModal.tsx`, `SuggestionsSection.tsx`, `TargetsSection.tsx`; gateway `src/app/api/nutrition/assistant/route.ts`.

Os dossiês são a fonte de detalhe. Este pacote **não** os copia.

---

## 5. Decisões que precisam de validação explícita

O revisor deve marcar cada item no checklist correspondente (adequado / ressalva / inadequado). Não basta um “ok” genérico.

**Nutricionista — D-NUT-08**

| Tema | Decisão / âncora |
| :--- | :--- |
| População incluída/excluída e gates | D-NUT-02, Masterplan §5, dossiê científico §3 |
| Mifflin-St Jeor V1 e offset `unspecified` −78 | D-NUT-02, D-NUT-03 |
| BMR / TDEE, PAL, 6 kcal/min | D-NUT-03 |
| Déficit / superávit e pisos 1200/1500/1200 | D-NUT-03; travas duras do motor |
| Proteína auto ≤ 2.2 g/kg e taxas por objetivo | D-NUT-04 |
| Hidratação 35 ml/kg + 500 ml/h, teto 4500 ml | D-NUT-03 |
| Todo parâmetro `PROFESSIONAL_REVIEW_REQUIRED` | D-NUT-03 |
| Linguagem das sugestões e orientação limitada | D-NUT-08 (escopo ético da saída) |

**Jurídico — D-NUT-09**

| Tema | Decisão / âncora |
| :--- | :--- |
| Posicionamento canônico (autogestão, não prescrição) | D-NUT-09 |
| IA não calcula/grava metas; ação humana em 2 etapas | D-NUT-01 |
| Disclaimers de UI vs. ausência de Termos/Política versionados no app | D-NUT-09; lacuna declarada no dossiê §3 |
| Dados ao gateway/provedor e OpenRouter | D-NUT-01; dossiê jurídico §4–5 |
| Privacidade, retenção, backup schema 2 | dossiê §7; GOALs de storage |
| Menores e populações bloqueadas vs. diário manual ainda permitido | D-NUT-02 / gates; dossiê §8 |
| OFF/barcode adiados (ODbL) | D-NUT-05 |
| Comercialização, lojas, beta público | D-NUT-08 + D-NUT-09 |

---

## 6. Como registrar ressalva, reprovação ou aprovação

1. Preencher o **formulário de retorno** da sua revisão (não o do outro revisor).
2. Escolher **um** `STATUS`:
   - `APPROVED` — homologa o V1 vigente sem condição bloqueante.
   - `APPROVED_WITH_CONDITIONS` — aceita o V1 com condições escritas; o produto **não** interpreta isso como beta público até as condições serem tratadas por GOAL futuro.
   - `CHANGES_REQUIRED` — não homologa; listar mudanças obrigatórias. Engenharia **não** inicia correção neste GOAL de handoff.
3. Identificar-se (`REVIEWER`, credencial/registro, data). Sem identificação, o retorno não fecha o gate.
4. Em `FINDINGS`, referir o item do checklist (ex.: `NUT-CHK-07`) e, se útil, a decisão D-NUT.
5. Devolver o markdown preenchido à engenharia (PR de docs ou anexo ao processo interno). **Não** editar o dossiê para simular aprovação.
6. Somente após **ambos** os retornos com status que a governança aceitar como fechamento, um GOAL **posterior** poderá reavaliar `READY_FOR_PUBLIC_BETA`. Até lá permanece `NO`.

Ressalva não bloqueante vai em `NON_BLOCKING_RECOMMENDATIONS`.
Condição bloqueante vai em `REQUIRED_CHANGES` e impede `APPROVED` simples.

---

## 7. Inventário deste pacote

| Arquivo | Função |
| :--- | :--- |
| [README.md](./README.md) | Este índice |
| [NUTRITIONIST_REVIEW_CHECKLIST_D_NUT_08.md](./NUTRITIONIST_REVIEW_CHECKLIST_D_NUT_08.md) | Checklist científico (não é parecer) |
| [LEGAL_REVIEW_CHECKLIST_D_NUT_09.md](./LEGAL_REVIEW_CHECKLIST_D_NUT_09.md) | Checklist jurídico (não é parecer) |
| [NUTRITIONIST_REVIEW_RETURN_FORM.md](./NUTRITIONIST_REVIEW_RETURN_FORM.md) | Modelo de resposta D-NUT-08 (vazio) |
| [LEGAL_REVIEW_RETURN_FORM.md](./LEGAL_REVIEW_RETURN_FORM.md) | Modelo de resposta D-NUT-09 (vazio) |

Ponto de parada: pacotes prontos para envio humano. Sem correção técnica, sem V1.5, sem OFF/barcode, sem beta público.
