# Checklist de revisão — Jurídico (D-NUT-09)

**Público:** revisão de termos, responsabilidade civil e posicionamento
**Objetivo:** validar explicitamente os limites do V1 antes de qualquer comercialização ou campanha de nutrição.
**Isto não é um parecer jurídico.** Marcar cada item; o juízo final vai no [formulário de retorno](./LEGAL_REVIEW_RETURN_FORM.md).

**Fonte:** [`GYMFLOW_NUTRITION_LEGAL_DOSSIER_D_NUT_09.md`](../GYMFLOW_NUTRITION_LEGAL_DOSSIER_D_NUT_09.md)
**Decisões:** D-NUT-01, D-NUT-05, D-NUT-08, D-NUT-09
**QA:** [`GYMFLOW_NUTRITION_NUT008_INTEGRATED_QA_001.md`](../GYMFLOW_NUTRITION_NUT008_INTEGRATED_QA_001.md)

Legenda: `[ ] Adequado` · `[ ] Com ressalva` · `[ ] Inadequado` · `[ ] Não avaliado`

Para ressalva ou inadequado, copiar o ID (`LEG-CHK-xx`) para o formulário.

---

## LEG-CHK-01 — Posicionamento do produto

**D-NUT-09.** Texto-alvo canônico:

> Ferramenta de autogestão e monitoramento de hábitos de treino e estilo de vida saudável, não constituindo prescrição dietética individualizada.

O V1 oferece: diário preenchido pelo usuário; metas estimadas com status científico provisório; catálogo com proveniência pública; IA propositiva read-only com confirmação explícita.

O produto **não** se apresenta como consultório virtual, **não** emite plano alimentar clínico e **não** substitui CRN/médico.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## LEG-CHK-02 — Limite bem-estar vs. prescrição

**D-NUT-09** (Lei 8.234/1991 e normas CFN/CRN — avaliação jurídica, não chancela CRN).
**D-NUT-08** permanece gate científico separado.

Pedir juízo sobre: se o posicionamento + disclaimers atuais são suficientes para o estágio pré-beta **interno**, e o que falta para loja/campanha.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## LEG-CHK-03 — Disclaimers

Dossiê jurídico §3. Já visíveis na UI:

| Superfície | Mensagem (síntese) |
| :--- | :--- |
| Modal IA | não é prescrição dietética; não substitui nutricionista clínico |
| Aba Sugestões (offline, sem rótulo de IA) | não são planejamento individualizado nem prescrição; não substituem nutricionista clínico |
| Metas / orientação limitada | não substitui acompanhamento profissional |

**Lacuna declarada:** o texto canônico completo de D-NUT-09 **ainda não** está materializado como Termos de Serviço / Política de Privacidade versionados no app. Este handoff **não** redige contrato.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## LEG-CHK-04 — IA e responsabilidade

**D-NUT-01.** Garantias de construção (código + testes):

| Garantia | Evidência |
| :--- | :--- |
| IA não calcula `DailyTargets` | só `NutritionEngine.calculateDailyTargets` |
| IA não grava ledger | `AI_ASSISTANT_PERMISSIONS.canWriteLedger = false` |
| IA não grava targets | `canWriteTargets = false` |
| Macros do modelo são descartados | grounding `scaleFoodReferenceToGrams` / FoodDatabase |
| Gates / MANUAL_ONLY bloqueiam o modelo | gateway 403 / 409 **antes** do provedor |

Cinco casos canônicos apenas: completar proteína; substituir alimento; montar refeição; lanches no saldo; explicar variação de metas.

Testes: `ai-assistant.test.ts`, `AiMealAssistantModal.test.tsx`, `nut008-integrated-flow.test.ts`, `nut008-d-nut-matrix.test.ts`. Smoke NUT-008: 5× HTTP 200 + MANUAL_ONLY 409 + CLINICAL_GATE 403.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## LEG-CHK-05 — Consentimento e ação explícita do usuário

Dossiê §6.

1. Usuário abre o assistente (“Perguntar à IA”).
2. Escolhe um dos 5 casos.
3. Vê proposta com números **recalculados localmente**.
4. “Adicionar ao Diário” pede refeição + **Confirmar inclusão**.
5. Sem confirmação, o ledger não muda.

Não há write automático, opt-in implícito por abrir o modal, nem persistência da conversa no ledger.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## LEG-CHK-06 — Dados enviados ao gateway / provedor

Dossiê §4. Browser chama só o gateway GymFlow `POST /api/nutrition/assistant`. O client **nunca** envia a chave.

Enviado (quando targets AUTOMATED e provedor configurado): caso de uso; allowlist de até 40 itens do catálogo; orçamento `remaining` e `targets` (números já do motor); rótulos `dietaryPattern` / `goal`; no substituto, `foodReferenceId` + gramas; ingredientes como dados; `userText` ≤ 500 caracteres isolado como DADOS.

**Não enviado:** nome, e-mail, identidade, histórico completo do ledger, hidratação, flags de saúde, biometria, timestamps de refeição, IDs de dia.

Negativos (MANUAL_ONLY, gate clínico, payload inválido, teto de bytes) **não** chamam o provedor.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## LEG-CHK-07 — OpenRouter / gateway GymFlow

Dossiê §5. QA NUT-008: `SECRET_EXPOSURE = NO`, `DIRECT_OPENROUTER_CLIENT_CALL = NO`.

- Produção homologada: `https://gymflow-beige-gamma.vercel.app/api/nutrition/assistant`.
- Adapter OpenAI-compatible **server-only** (`GYMFLOW_AI_BASE_URL` + `GYMFLOW_AI_API_KEY` + `GYMFLOW_AI_MODEL`).
- Client **não** chama `openrouter.ai` nem `chat/completions`.
- Mobile Capacitor: origem pública `NEXT_PUBLIC_GYMFLOW_AI_BACKEND_URL` (URL, não segredo) + `/api/nutrition/assistant`.
- Sem provedor: 503 `PROVIDER_UNAVAILABLE` honesto; sugestões determinísticas offline permanecem.

Ponto para DPA / transferência internacional: retenção do provedor **não auditada** neste GOAL.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## LEG-CHK-08 — Privacidade e retenção

Dossiê §7.

| Camada | O que fica | Onde |
| :--- | :--- | :--- |
| Perfil / ledger / favoritos | dados do usuário | dispositivo (IndexedDB + fallback); backup schema 2 exportado pelo usuário |
| Gateway GymFlow | request/response transitórios | rota de servidor; sem banco de nutrição neste GOAL |
| Provedor | prompt mínimo | retenção **não auditada** |
| Segredos | `GYMFLOW_AI_API_KEY` | server-only |

Backup schema 2 inclui `payload` (espelhos + `nutritionProfile`) e `nutritionLedger`. Fence/locks **não** entram no backup.

Delete físico de gerações de storage continua bloqueado por GOALs anteriores — não é delete automático de nutrição.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## LEG-CHK-09 — Menores e populações bloqueadas

Dossiê §8; gates D-NUT-02.

- Menores, gestantes, lactantes, DRC: bloqueio de **metas automáticas**.
- Transtorno alimentar, diabetes descompensado, condição CV grave: encaminhamento; automação bloqueada.
- A IA **não** é chamada nesses estados.
- O **diário manual** de alimentos continua disponível.

Mitiga, mas **não elimina**, uso do diário por população não suportada. Avaliar avisos, idade mínima de loja e copy de bloqueio.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

## LEG-CHK-10 — Comercialização e lojas de aplicativos

**D-NUT-09:** sem validação jurídica, **não** ativar cobrança nem campanha de nutrição.
**D-NUT-08:** sem revisão CRN, **não** beta público.
**D-NUT-05:** Open Food Facts / barcode adiados (risco ODbL share-alike).
Catálogo V1: `CANONICAL_BR` + contrato USDA_FDC + `USER_CONFIRMED`; sem TBCA/USP incorporada.

Não há pagamento real de nutrição neste repositório (regra permanente do projeto).

Avaliar condições futuras (fora deste GOAL): App Store / Google Play, idade mínima, copy de nutrição, termos versionados.

[ ] Adequado  [ ] Com ressalva  [ ] Inadequado  [ ] Não avaliado

Notas: _ _

---

**D_NUT_09_EXTERNAL_APPROVAL permanece PENDING até o formulário identificado ser devolvido.**
**READY_FOR_PUBLIC_BETA = NO**
