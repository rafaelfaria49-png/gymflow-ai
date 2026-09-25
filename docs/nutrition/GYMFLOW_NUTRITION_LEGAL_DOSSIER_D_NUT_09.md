# Dossiê Jurídico / Regulatório — Nutrição V1 (D-NUT-09)

**Documento:** `GYMFLOW_NUTRITION_LEGAL_DOSSIER_D_NUT_09`  
**GOAL:** GYMFLOW-NUT008-INTEGRATED-QA-BETA-READINESS-ENDTOEND-111  
**Público:** revisão jurídica de termos, responsabilidade civil e posicionamento  
**Status deste dossiê:** pronto para revisão humana  
**D_NUT_09_EXTERNAL_APPROVAL = PENDING**

**Pacote de envio humano:** `docs/nutrition/external-review/` (GOAL-112). Este dossiê não é parecer jurídico.

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
- na explicação de metas (`explain_target_change`): fatos do motor — metas kcal/P/C/G, BMR, TDEE, balanço energético e objetivo (valores **derivados** de peso/altura/idade/sexo; os brutos não vão);
- `userText` opcional ≤ 500 caracteres, isolado como DADOS, nunca como instrução de sistema (o modal atual não expõe esse campo).

**Não enviado:** nome, e-mail, identidade, histórico completo do ledger, hidratação, flags de saúde, biometria bruta (peso/altura/idade/sexo), timestamps de refeição, IDs de dia.

Origem das chamadas: web (same-origin) e, desde o GOAL-118, também o app nativo Android/iOS (§5).

Negativos (MANUAL_ONLY, gate clínico, payload inválido, teto de bytes, origem não autorizada) **não chamam o provedor**. Exceção de contrato: `explain_target_change` não carrega `availability` e o gateway não o re-gateia (os fatos vêm do client); quem o bloqueia em MANUAL_ONLY/gate clínico é o app — o modal só o envia com metas AUTOMATED e gate liberado.

---

## 5. OpenRouter / gateway GymFlow

- Runtime de produção homologado no GOAL-110: gateway GymFlow em `https://gymflow-beige-gamma.vercel.app/api/nutrition/assistant`.
- Adapter OpenAI-compatible **server-only** (`GYMFLOW_AI_BASE_URL` + `GYMFLOW_AI_API_KEY` + `GYMFLOW_AI_MODEL`).
- O client **não** chama `openrouter.ai` nem `chat/completions`.
- Mobile Capacitor usa origem pública `NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL` (URL, não segredo) concatenada a `/api/nutrition/assistant`.
- Sem provedor: 503 `PROVIDER_UNAVAILABLE` honesto; sugestões determinísticas offline permanecem.
- **GOAL-118 (2026-09-25) — app nativo ligado ao gateway.** Até o GOAL-117 o app nativo não tinha backend (IA "indisponível"). Agora o bundle Android/iOS embute a origem Production e o gateway aceita, via CORS com allowlist exata, somente os WebViews nativos (`https://localhost`, `capacitor://localhost`) além da web same-origin; qualquer outra origem recebe 403 antes de o provedor ser chamado. Consequência factual: **o contexto do §4 passa a sair também do aparelho do usuário nativo** (app → gateway GymFlow na Vercel — edge São Paulo, função nos EUA → OpenRouter → modelo), só quando ele pede uma proposta. O IP da conexão chega à hospedagem do gateway; o OpenRouter recebe a chamada do servidor. Inventário de Data Safety (Android) e App Privacy (iOS) atualizado como proposta factual em `docs/mobile/MOBILE_CROSS_PLATFORM_005.md` §9 e `MOBILE_CROSS_PLATFORM_006.md` §3.3 — pendente de decisão jurídica.

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
| Gateway GymFlow | request/response transitórios do assistente (web e, desde o GOAL-118, app nativo) | função Vercel (região iad1, EUA; edge São Paulo); sem banco de nutrição; logs da plataforma com metadados de requisição (IP, caminho, status) não auditados |
| Provedor (OpenRouter / modelo) | prompt mínimo acima | retenção do provedor **não auditada neste GOAL** — ponto para o jurídico/DPA |
| Segredos | `GYMFLOW_AI_API_KEY` | ambiente server-only; `API_KEY_EXPOSURE = NO` |

Retenção executável de gerações de storage (delete físico) continua bloqueada por GOALs de storage anteriores — não é delete automático de nutrição.

Backup schema 2 inclui `payload` (espelhos + `nutritionProfile`) e `nutritionLedger`. Fence/locks **não** entram no backup.

---

## 8. Gates clínicos e risco de população vulnerável

Menores, gestantes, lactantes e DRC: bloqueio de metas automáticas. Transtorno alimentar, diabetes descompensado, condição CV grave: encaminhamento. Tracking manual de alimentos continua disponível (o usuário ainda pode registrar o que comeu). O app **não** chama a IA nesses estados (gate local no modal; nos casos com saldo o gateway também recusa — ver exceção do `explain_target_change` no §4).

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
