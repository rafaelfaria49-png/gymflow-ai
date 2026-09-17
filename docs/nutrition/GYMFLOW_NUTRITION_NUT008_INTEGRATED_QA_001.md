# NUT-008 — QA integrada e prontidão de engenharia da Nutrição V1

**GOAL:** `GYMFLOW-NUT008-INTEGRATED-QA-BETA-READINESS-ENDTOEND-111`  
**Documento:** `GYMFLOW_NUTRITION_NUT008_INTEGRATED_QA_001`  
**Data:** 2026-09-17

Este é o relatório final único do NUT-008. Aprovações humanas (nutricionista/jurídico) permanecem **PENDING**. Beta público **não** liberado.

---

## Identidade

| Campo | Valor |
| :--- | :--- |
| BASE_SHA | `a4fbf15d267c4fa9efcafe5756c8deb4d394c541` |
| BRANCH | `cursor/gymflow-nut008-integrated-qa-f19a` |
| COMMITS | `51b9a11` feat QA; `b57aec1` tsc harness; `ee80cb0` fake locks reset/restore; `db2d662` D111-002; + este fechamento docs |
| PR_NUMBER | `#50` |
| MERGE_SHA | (preenchido após merge commit) |
| ORIGIN_MASTER_AFTER | (preenchido após merge commit) |

---

## Resultados por frente

### INTEGRATED_FLOW_RESULT = PASS

`src/lib/nutrition/nut008-integrated-flow.test.ts` cobre em um único sistema:

perfil → clinical gates → NutritionEngine → DailyTargets → FoodDatabase → NutritionLedger → hidratação → favoritos/recentes → rollover civil → tendência 7/30 → IA grounded + confirmação explícita → backup schema 2 → restore canônico → reset vazio (sem ressurreição).

Aceites internos:

| Gate | Status |
| :--- | :--- |
| NUT001_007_INTEGRATION | PASS |
| PROFILE_TO_LEDGER_FLOW | PASS |
| FOOD_TO_LEDGER_FLOW | PASS |
| AI_TO_CONFIRMATION_FLOW | PASS |
| ROLLOVER | PASS |
| BACKUP_RESTORE | PASS |
| RECOVERY | PASS |
| CROSS_TAB | PASS (revalidado nos testes IDB/lock existentes + harness admin) |
| OFFLINE_DEGRADATION | PASS |
| PRODUCTION_AI_RUNTIME | PASS |
| SECRET_EXPOSURE | NO |

### STRESS_RESULT = PASS (sem threshold novo; sem regressão material)

Harness sintético in-memory, não destrutivo (`nut008-stress-performance.test.ts`).

| N dias | build ms | list ms | actuals ms | trend7 ms | trend30 ms | serialize ms | digest ms | bytes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 30 | 6.42 | 0.31 | 0.19 | 0.76 | 0.27 | 1.02 | 3.49 | 47 415 |
| 180 | 5.16 | 1.62 | 0.24 | 0.98 | 0.85 | 5.54 | 3.38 | 284 311 |
| 730 (~2 anos) | 11.41 | 5.60 | 0.35 | 1.45 | 1.85 | 15.57 | 24.76 | 1 152 668 |

Restore canônico do JSON da section = identidade. Sem híbrido, sem perda.

### PERFORMANCE_RESULT = PASS

| Superfície | Observado | Contrato existente |
| :--- | :--- | :--- |
| FoodDatabase search (`arroz`, 200 iterações, pós-aquecimento) | **0.022 ms** média | < 15 ms |
| Trend 7/30 + actuals (30 dias) | 0.27 ms | n/a (sem threshold novo) |
| Backup serialize 730 dias | 15.6 ms | n/a |
| Digest SHA-256 730 dias | 24.8 ms | n/a |

Busca permanece duas ordens de grandeza abaixo de 15 ms. Sem regressão material.

### WEB_QA_RESULT = PASS (harness + fonte)

Cinco abas, alvos ≥44px, estados empty/erro/offline/MANUAL_ONLY/clinical-blocked, disclaimer, modal IA com safe-area. Sem `alert()`/`confirm()` nativo nas telas de nutrição. Bottom nav inalterada (D-NUT-06).

### MOBILE_QA_RESULT / REAL_DEVICE_QA

| Item | Status |
| :--- | :--- |
| `npm run build:mobile` | **PASS** (Next.js 16.2.6 export; `/api/nutrition/assistant` dinâmica; `out/api` ausente) |
| `npm run ios:validate` | **PASS** 1 arquivo / 17 testes |
| Android/ADB / Galaxy S22 | **REAL_DEVICE_QA = NOT_AVAILABLE** (sem `adb` neste ambiente; sem fabricar PASS) |

Smoke mobile = o mesmo POST do gateway de produção (caminho nativo Capacitor: origem pública + `/api/nutrition/assistant`).

### AI_RUNTIME_RESULT = PASS

Smoke controlado **somente** via gateway GymFlow Production  
`https://gymflow-beige-gamma.vercel.app/api/nutrition/assistant`  
(5 POSTs de sucesso + 2 negativos; sem carga).

| Caso | HTTP | ms | Grounding |
| :--- | ---: | ---: | :--- |
| complete_protein | 200 | 1848 | `br-peito-frango-grelhado` · 190.8 kcal / 38.4 P (local) |
| substitute_food | 200 | 1750 | `br-queijo-cottage` (catálogo) |
| build_meal_from_ingredients | 200 | 1847 | asa / arroz / brócolis |
| snacks_within_balance | 200 | 1667 | iogurte, cottage, rúcula |
| explain_target_change | 200 | 1277 | facts 2500/160 ecoados; explanationLen=206 |
| NEG MANUAL_ONLY | 409 | — | modelo não chamado |
| NEG CLINICAL_GATE | 403 | — | modelo não chamado |

Confirmações: grounding FoodReference; macros locais; read-only; sem write de targets; sem write automático de ledger; confirmação explícita na UI.

P1 corrigido nesta execução: `facts.energyBalanceKcal` rejeitava déficit (< 0). O motor emite balanço assinado; o caso 5 quebrava para `fat_loss_*`. Produção ainda valida `>= 0` até o deploy deste PR; smoke de produção usou maintenance (0), idêntico ao GOAL-110. Testes locais cobrem déficit negativo.

### D_NUT_01_10_MATRIX = PASS

Ver `docs/nutrition/GYMFLOW_NUTRITION_D_NUT_01_10_MATRIX_001.md`.  
D-NUT-08/09: **PASS de engenharia** (gate + dossiê) / **PENDING** aprovação humana.

### SCIENTIFIC_DOSSIER / LEGAL_DOSSIER

- `docs/nutrition/GYMFLOW_NUTRITION_SCIENTIFIC_DOSSIER_D_NUT_08.md`
- `docs/nutrition/GYMFLOW_NUTRITION_LEGAL_DOSSIER_D_NUT_09.md`

Nenhuma chancela profissional ou parecer jurídico neste GOAL.

### SECRET_EXPOSURE = NO / PRIVACY_REVIEW_RESULT = PASS

Auditoria automatizada (`nut008-secrets.test.ts` 3/3, reexecutada com artefatos presentes): fonte, docs e artefatos de build sem valor de chave, sem `NEXT_PUBLIC_*KEY/SECRET/TOKEN`, client sem `openrouter.ai` / `chat/completions`. Chave somente em `ai-assistant-provider.ts` (server-only).

Scan pós-`build:mobile` em `.next/static` e `out/`: 0 `GYMFLOW_AI_API_KEY`, 0 `openrouter.ai`, 0 `chat/completions`, 0 `sk-or-`, 0 `Bearer`, `out/api` ausente. `API_KEY_EXPOSURE = NO`. `DIRECT_OPENROUTER_CLIENT_CALL = NO`.

Dados ao provedor: prompt mínimo (saldo/metas numéricas, caso, allowlist, ingredientes/userText como dados). Sem nome, biometria, flags de saúde, IDs de ledger.

### Invariantes de storage

| Invariante | Status |
| :--- | :--- |
| NO_DATA_LOSS | YES |
| NO_LEDGER_RESURRECTION | YES |
| NO_HYBRID_CORE_LEDGER | YES |
| NO_XP_DUPLICATION | YES |

Correção de harness: `storage-nutrition-ledger-admin.test.ts` instala Web Locks fake (padrão dos demais testes admin). Em Node 22 sem `navigator.locks`, `PARTIAL_FAILURE_RECOVERABLE` falhava fechado — falso negativo do ambiente, não regressão de produto.

---

## Correções no escopo NUT-001..007

| Sev. | Item | Ação |
| :--- | :--- | :--- |
| P1 | `explain_target_change` rejeitava `energyBalanceKcal < 0` | `assertValidFacts` aceita número finito assinado |
| P1 (teste) | recovery admin sem Web Locks nativas no Node 22 | fake locks no harness GOAL-100 |
| P2 | modal IA sem safe-area inferior no sheet mobile | `pb-[calc(1rem+env(safe-area-inset-bottom))]` |

P0 = 0 após correções.

---

## Validação (preenchida na execução)

| Item | Resultado |
| :--- | :--- |
| FOCUSED_TESTS | 41 arquivos / 644 testes PASS (domínio Nutrition + D-NUT-06) |
| FULL_RUN_1 | **PASS** 157 arquivos / 3459 testes (`npm test`, 1ª execução planejada) |
| FULL_RUN_2 | **PASS** 157 arquivos / 3459 testes (`npm test`, 2ª execução planejada; sem retry-until-green) |
| TYPECHECK | **PASS** `npx tsc --noEmit` 0 erros |
| BUILD | **PASS** `npm run build` (rota `/api/nutrition/assistant` dinâmica) |
| MOBILE_BUILD | **PASS** `npm run build:mobile` |
| IOS_VALIDATE | **PASS** 17/17 `npm run ios:validate` |
| DIFF_CHECK | **PASS** `git diff --check` limpo |
| CI_STATUS | (preenchido após checks do PR #50) |
| POSTMERGE_STATUS | (preenchido após merge) |

---

## Defeitos

| Sev. | Qtd | Notas |
| :--- | ---: | :--- |
| P0 | 0 | |
| P1 | 0 | os dois P1 encontrados foram corrigidos e revalidados |
| P2 | 0 abertos neste GOAL | safe-area do modal corrigida |
| P3 | herdados | tags dietéticas no catálogo; clamp de hidratação não sinalizado; facts assinados no servidor — fora de V1 |

---

## Status final de engenharia

```
NUT008_STATUS = INTEGRATED
NUTRITION_V1_ENGINEERING_STATUS = COMPLETE
READY_FOR_EXTERNAL_REVIEW = YES
READY_FOR_NUTRITIONIST_REVIEW = YES
READY_FOR_LEGAL_REVIEW = YES
D_NUT_08_EXTERNAL_APPROVAL = PENDING
D_NUT_09_EXTERNAL_APPROVAL = PENDING
READY_FOR_PUBLIC_BETA = NO
```

Não iniciado: V1.5, OFF/barcode, pagamento, beta público.
