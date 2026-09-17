# Matriz formal D-NUT-01 … D-NUT-10 (NUT-008)

**Documento:** `GYMFLOW_NUTRITION_D_NUT_01_10_MATRIX_001`  
**GOAL:** GYMFLOW-NUT008-INTEGRATED-QA-BETA-READINESS-ENDTOEND-111  
**Regra:** nenhuma decisão recebe PASS só por documentação.  
**D_NUT_01_10_MATRIX = PASS** (implementação de engenharia). Aprovações humanas 08/09 = PENDING.

| ID | Decisão | Evidência no código | Teste correspondente | Status engenharia | Aprovação externa |
| :--- | :--- | :--- | :--- | :--- | :--- |
| D-NUT-01 | IA não calcula/grava targets | `AI_ASSISTANT_PERMISSIONS`; `ai-assistant.ts` sem writers; modal 2 etapas → `logFoodReference`; engine exclusivo | `ai-assistant.test.ts`; `AiMealAssistantModal.test.tsx`; `nut008-d-nut-matrix.test.ts`; `nut008-integrated-flow.test.ts` | **PASS** | n/a |
| D-NUT-02 | Sem default masculino para unspecified | `biologicalSexForCalcs`; gate `LIMITED_GUIDANCE`; piso 1200 ≠ 1500; BMR offset −78 | `profile-gates.test.ts`; `engine.test.ts`; matriz NUT-008 | **PASS** | n/a |
| D-NUT-03 | Parâmetros versionados | `engineVersion`/`formulaVersion`/`inputSnapshotHash`; `PROFESSIONAL_REVIEW_REQUIRED` | `engine.test.ts`; matriz NUT-008 | **PASS** | n/a (marcadores = revisão pendente) |
| D-NUT-04 | Proteína auto ≤ 2.2 g/kg | `ENGINE_HARD_SAFETY_LIMITS.MAX_PROTEIN_GRAMS_PER_KG = 2.2` | `engine.test.ts` §16–17/31/35; matriz NUT-008 | **PASS** | n/a |
| D-NUT-05 | OFF/barcode adiados V1.5 | sources só `CANONICAL_BR` \| `USDA_FDC` \| `USER_CONFIRMED`; zero scanner | `food-database.test.ts`; matriz NUT-008 | **PASS** (ausência) | n/a |
| D-NUT-06 | Bottom nav inalterada | 4 slots Hoje/Planejar/Exercícios/Evolução; Nutrição só em Mais | `Navigation.test.tsx` D-NUT-06; matriz NUT-008 | **PASS** | n/a |
| D-NUT-07 | XP idempotente, teto 60/dia | +20 alimento 1×/dia civil; +40 água 1×/dia; `lastMacroXpDate`/`lastWaterXpDate` | `GymFlowContext.nutrition.test.tsx`; matriz NUT-008 | **PASS** | n/a |
| D-NUT-08 | Revisão CRN antes do beta público | `scientificStatus` provisório; dossiê científico emitido | `engine.test.ts`; `nut008-d-nut-matrix.test.ts`; este dossiê | **PASS** (gate implementado, sem chancela) | **PENDING** |
| D-NUT-09 | Revisão jurídica antes de comercializar | disclaimers UI; dossiê jurídico emitido; sem pagamento real | modal/sugestões; `nut008-d-nut-matrix.test.ts` | **PASS** (gate implementado, sem parecer) | **PENDING** |
| D-NUT-10 | Sem alimento canônico sem proveniência; trava 15% | catálogo verificado; `USER_FOOD_ENERGY_TOLERANCE_RELATIVE = 0.15` | `food-database.test.ts`; matriz NUT-008 | **PASS** | n/a |

### Leitura honesta de D-NUT-08 e D-NUT-09

PASS de engenharia = o produto **não finge** revisão humana: status provisório, dossiês prontos, `READY_FOR_PUBLIC_BETA = NO`.  
**Não** significa aprovação CRN nem conformidade legal final.

`D_NUT_08_EXTERNAL_APPROVAL = PENDING`  
`D_NUT_09_EXTERNAL_APPROVAL = PENDING`
