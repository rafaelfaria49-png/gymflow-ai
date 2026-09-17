# Dossiê Jurídico / Regulatório — Nutrição V1 (D-NUT-09)

**Documento:** `GYMFLOW_NUTRITION_LEGAL_DOSSIER_D_NUT_09`  
**GOAL:** GYMFLOW-NUT008-INTEGRATED-QA-BETA-READINESS-ENDTOEND-111  
**Público:** revisão jurídica de termos, responsabilidade civil e posicionamento  
**Status deste dossiê:** pronto para revisão humana  
**D_NUT_09_EXTERNAL_APPROVAL = PENDING**

Este dossiê **não é parecer jurídico**, **não declara conformidade legal final** e **não autoriza comercialização, cobrança ou beta público** da Nutrição. A decisão canônica D-NUT-09 permanece: validação jurídica é gate antes de cobrança comercial ou campanha publicitária voltada à nutrição.

Código e UI de referência:

- `src/lib/nutrition/ai-assistant.ts` / `ai-assistant-types.ts` / `ai-assistant-client.ts` / `ai-assistant-gateway.ts` / `ai-assistant-provider.ts`
- `src/app/api/nutrition/assistant/route.ts`
- `src/components/nutrition/AiMealAssistantModal.tsx`
- `src/components/nutrition/SuggestionsSection.tsx`
- `src/components/nutrition/TargetsSection.tsx`
- `docs/nutrition/GYMFLOW_NUTRITION_DECISIONS_001.md` (D-NUT-01, D-NUT-08, D-NUT-09)

---

## 1. Posicionamento do produto (texto-alvo canônico)

D-NUT-09 exige o posicionamento:

> Ferramenta de autogestão e monitoramento de hábitos de treino e estilo de vida saudável, não constituindo prescrição dietética individualizada.

O GymFlow AI é um aplicativo local-first de treino. O módulo de Nutrição V1 oferece:

- diário de consumo (ledger) preenchido pelo usuário;
- metas estimadas por motor determinístico versionado, com status científico provisório;
- catálogo de alimentos com proveniência pública;
- assistente de IA **propositivo e read-only**, amarrado ao catálogo, com confirmação explícita.

O produto **não** se apresenta como consultório virtual, **não** emite plano alimentar clínico e **não** substitui nutricionista (CRN) ou médico.

---

## 2. Limites da IA (D-NUT-01)

Por construção de código:

| Garantia | Evidência |
| :--- | :--- |
| IA não calcula `DailyTargets` | `NutritionEngine.calculateDailyTargets` é a única autoridade |
| IA não grava o ledger | `AI_ASSISTANT_PERMISSIONS.canWriteLedger = false`; módulo não importa writers |
| IA não grava targets | `canWriteTargets = false` |
| Macros do modelo são descartados | grounding via `scaleFoodReferenceToGrams` / FoodDatabase |
| Inclusão no diário exige 2 etapas humanas | `AiMealAssistantModal` → `logFoodReference` |
| Gates clínicos / MANUAL_ONLY bloqueiam o modelo | gateway 403 / 409 **antes** da chamada ao provedor |

Casos canônicos (somente estes): completar proteína; substituir alimento; montar refeição com ingredientes; lanches no saldo; explicar variação de metas.

---

## 3. Disclaimers existentes na UI

Já visíveis ao usuário (não substituem Termos/Política revisados):

- Modal IA: *“não é prescrição dietética e não substitui um nutricionista clínico qualificado.”*
- Aba Sugestões (offline, sem rótulo de IA): *“não constituem planejamento alimentar individualizado nem prescrição dietética e não substituem um nutricionista clínico qualificado.”*
- Metas / orientação limitada: *“Não substitui acompanhamento profissional.”*
- Estados honestos: `AI_UNAVAILABLE`, `MANUAL_ONLY`, `CLINICAL_GATE_BLOCKED`, proposta vazia — sem números fabricados.

**Lacuna para o jurídico:** o texto canônico completo de D-NUT-09 ainda **não** está materializado como Termos de Serviço / Política de Privacidade versionados no app. Este GOAL não redige contrato comercial.

---

## 4. Dados enviados ao provedor de IA

O client **nunca** envia a chave. O browser/app chama o **gateway GymFlow** `POST /api/nutrition/assistant`. O servidor monta um prompt mínimo.

Enviado ao modelo (quando targets AUTOMATED e provedor configurado):

- caso de uso;
- allowlist de IDs/nomes/porções do catálogo (até 40);
- orçamento `remaining` e `targets` (kcal / P / C / G) — números já calculados pelo motor, não pelo modelo;
- `dietaryPattern` e `goal` como rótulos opcionais;
- no substituto: `foodReferenceId` + gramas;
- ingredientes em texto livre (tratados como dados);
- `userText` opcional ≤ 500 caracteres, isolado como DADOS, nunca como instrução de sistema.

**Não enviado:** nome, e-mail, identidade, histórico completo do ledger, hidratação, flags de saúde, biometria (peso/altura/idade), timestamps de refeição, IDs de dia.

Negativos (MANUAL_ONLY, gate clínico, payload inválido, teto de bytes) **não chamam o provedor**.

---

## 5. OpenRouter / gateway GymFlow

- Runtime de produção homologado no GOAL-110: gateway GymFlow em `https://gymflow-beige-gamma.vercel.app/api/nutrition/assistant`.
- Adapter OpenAI-compatible **server-only** (`GYMFLOW_AI_BASE_URL` + `GYMFLOW_AI_API_KEY` + `GYMFLOW_AI_MODEL`).
- O client **não** chama `openrouter.ai` nem `chat/completions`.
- Mobile Capacitor usa origem pública `NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL` (URL, não segredo) concatenada a `/api/nutrition/assistant`.
- Sem provedor: 503 `PROVIDER_UNAVAILABLE` honesto; sugestões determinísticas offline permanecem.

NUT-008 reexecuta smoke controlado dos 5 casos **somente** via gateway, sem carga no provedor pago.

---

## 6. Consentimento e ação humana

1. O usuário abre o assistente (“Perguntar à IA”).
2. Escolhe um dos 5 casos.
3. Vê proposta com números **recalculados localmente**.
4. “Adicionar ao Diário” pede refeição + **Confirmar inclusão**.
5. Sem confirmação, o ledger não muda.

Não há write automático, não há opt-in implícito por abrir o modal, não há persistência da conversa no ledger.

---

## 7. Privacidade e retenção conhecida

| Camada | O que fica | Onde |
| :--- | :--- | :--- |
| Perfil nutricional / ledger / favoritos | dados do usuário | dispositivo (IndexedDB + fallback); backup schema 2 exportado pelo usuário |
| Gateway GymFlow | request/response transitórios do assistente | servidor da rota; sem banco de nutrição neste GOAL |
| Provedor (OpenRouter / modelo) | prompt mínimo acima | retenção do provedor **não auditada neste GOAL** — ponto para o jurídico/DPA |
| Segredos | `GYMFLOW_AI_API_KEY` | ambiente server-only; `API_KEY_EXPOSURE = NO` |

Retenção executável de gerações de storage (delete físico) continua bloqueada por GOALs de storage anteriores — não é delete automático de nutrição.

Backup schema 2 inclui `payload` (espelhos + `nutritionProfile`) e `nutritionLedger`. Fence/locks **não** entram no backup.

---

## 8. Gates clínicos e risco de população vulnerável

Menores, gestantes, lactantes e DRC: bloqueio de metas automáticas. Transtorno alimentar, diabetes descompensado, condição CV grave: encaminhamento. Tracking manual de alimentos continua disponível (o usuário ainda pode registrar o que comeu). A IA **não** é chamada nesses estados.

Isso mitiga, mas **não elimina**, risco de o diário ser usado por população não suportada. O jurídico deve avaliar avisos, idade mínima da loja e copy de bloqueio.

---

## 9. Limitações comerciais

- Não há pagamento real de nutrição neste repositório (regra permanente do projeto).
- D-NUT-09: sem validação jurídica, **não** ativar cobrança nem campanha de nutrição.
- D-NUT-08: sem revisão CRN, **não** beta público.
- Open Food Facts / barcode adiados (D-NUT-05) por risco ODbL share-alike.
- Catálogo V1: `CANONICAL_BR` + contrato USDA_FDC + `USER_CONFIRMED`; sem TBCA/USP incorporada.

---

## 10. Pedido à revisão jurídica

1. Adequação do posicionamento e dos disclaimers atuais vs. Lei 8.234/1991 e normas CFN/CRN
2. Termos, Política de Privacidade, bases LGPD, DPA com gateway/provedor
3. Idade mínima, populações bloqueadas vs. diário manual ainda permitido
4. Uso de OpenRouter/gateway e transferência internacional de prompt mínimo
5. Condições para eventual comercialização futura (fora deste GOAL)

**D_NUT_09_EXTERNAL_APPROVAL = PENDING**  
**READY_FOR_LEGAL_REVIEW = YES**  
**READY_FOR_PUBLIC_BETA = NO**
