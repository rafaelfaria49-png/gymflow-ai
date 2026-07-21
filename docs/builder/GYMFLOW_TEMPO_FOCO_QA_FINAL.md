# GymFlow — QA final e consolidação do lote Tempo–Foco (GOAL-TF-F)

> **Status:** Classe B — lote aprovado com ressalvas. Testes, TypeScript, build web
> e build mobile aprovados; lint global **VERMELHO** (exit 1) por dívida
> preexistente e neutra ao GOAL F. Zero P0/P1 introduzido pelo lote.
> A QA visual/interativa ao vivo e a inspeção do indicador "1 Issue" do Next
> DevTools **não puderam ser executadas** porque a extensão do Chrome não estava
> conectada neste ambiente; a matriz determinística está coberta por testes
> automatizados e inspeção estrutural. Nenhum código foi alterado neste GOAL.

Data: **2026-07-21** · Executor: integração/QA (Claude Code).

---

## 1. Escopo

GOAL documental e de QA que **consolida** o lote Tempo–Foco (GOALs A–E) já
integrados em `origin/master`. Não implementa feature nova. Objetivos:

1. Consolidar tecnicamente o lote A–E.
2. Executar todos os gates (testes, TypeScript, ESLint, build web, build mobile).
3. Executar/atribuir a matriz de QA (determinística por teste + o que for visual).
4. Investigar o indicador "1 Issue" do Next DevTools.
5. Consolidar decisões (ADRs TF) e pendências.
6. Produzir **um único commit documental**. Sem push.

Arquivos autorizados a mudar: `docs/GOALS_LOG.md`, `docs/DECISOES.md`,
`docs/PENDENCIAS.md` e este relatório. **Nenhum arquivo fora de `docs/**`.**

## 2. Base congelada

- `origin/master` = **`5199c734f4ddfad4fc87353662536b99f47f78e1`**
  (`fix(builder): separar nome de programa e nome de dia na entrada legada`).
- Branch: `feat/gymflow-tf-goalF-integra-qa`.
- Worktree: `C:\Projetos\gymflow-goal-tf-f` (criado direto de `origin/master`).
- HEAD inicial do worktree = base; HEAD^ = `17b5d331` (GOAL D).
- `master` local do repositório principal permanece em `17b5d331` (defasada em 1
  commit em relação a `origin/master`) — **não foi atualizada** nem usada como base.

## 3. Commits do lote A–E

Cadeia **linear, sem merge commits**, sobre a base pré-lote `06684ee`
(GOAL-19B.2A). Cada GOAL A/B/C tem commit principal + corretivo:

| GOAL | Commit(s) | Assunto |
|------|-----------|---------|
| A — tempo canônico | `dd5f9cc` + `b0ddfef` | tempo disponível canônico, perfil recomendado, time-fit |
| B — picker por foco | `28aad29` + `e52f60f` | picker por foco com chips e busca por aba; safe area |
| C — badges/agrupamento | `d9de0aa` + `1026c12` | badges e agrupamento por papel; aba Todos plana (CORRECTIVE-004) |
| D — sugestão preview | `17b5d33` | sugestão assistida determinística com preview |
| E — nomes | `5199c73` | separar nome de programa e nome de dia (= `origin/master`) |

Diff do lote inteiro (`06684ee..5199c734f4ddfad4fc87353662536b99f47f78e1`): **28
arquivos** (6 de documentação + 22 de código), 3554 inserções / 150 remoções,
**0 merge commits**.

## 4. Ambiente

- SO: Windows 11 · Node **v24.14.1**.
- Next.js **16.2.6** (Turbopack) · Vitest **4.1.9**.
- Dependências: cópia física (robocopy) do `node_modules` do repo principal para
  manter o worktree autocontido (padrão herdado dos GOALs anteriores do lote;
  junction foi descartado). Nenhuma dependência instalada ou alterada.
- Servidor de QA: `npm run dev -- --port 3017` (porta isolada).

### Browsers / viewports

- **Não executado ao vivo.** A extensão do Chrome (Claude-in-Chrome) **não estava
  conectada** neste ambiente — mesma limitação já registrada no
  `GOAL-TF-C-CORRECTIVE-004`. Sem ela, cliques/telas/leitura de console do
  navegador e a inspeção do overlay do Next DevTools não são possíveis.
- Verificação possível sem navegador: HTTP direto ao servidor dev (rotas e assets).

## 5. Gates

| Gate | Comando | Resultado |
|------|---------|-----------|
| Testes | `npx vitest run` | **30 arquivos, 600 testes, 0 falha, 0 skip** (exit 0) |
| TypeScript | `npx tsc --noEmit` | **exit 0** (limpo) |
| ESLint | `npm run lint` (`eslint`) | 18 problemas (**12 erros, 6 warnings**) — **todos pré-existentes**; 0 introduzidos pelo lote (ver §6) |
| Build web | `npm run build` | **Next 16.2.6, compilação + TypeScript + 6/6 rotas estáticas OK** (exit 0) |
| Build mobile | `npm run build:mobile` | **export estático `out/` OK** (exit 0); `cap sync`/Android **não** executados |

Após ambos os builds a working tree permaneceu **limpa**; `android/` **intocado**;
`tsconfig.tsbuildinfo` e `.next`/`out` são ignorados pelo git.

## 6. ESLint — reconciliação com a baseline

A baseline histórica citada nas entradas dos GOALs A–E é "**três warnings** no
`GymFlowContext.tsx`". Esses três continuam presentes e idênticos:

- `GymFlowContext.tsx` **859 / 870 / 908** — `react-hooks/exhaustive-deps` (warnings).

A diferença é de **escopo de execução**: os GOALs A–E rodaram ESLint **apenas nos
arquivos tocados**; `npm run lint` roda no **projeto inteiro** e expõe toda a
dívida legada já registrada em `PENDENCIAS.md` (set-state-in-effect,
no-unescaped-entities, no-explicit-any, refs-during-render, no-img-element).

**Prova de neutralidade do lote:** o diff `06684ee..5199c734` tocou 22 arquivos de
código; **nenhum** dos 8 arquivos que carregam os 12 erros do ESLint está nesse
conjunto — nem o nono arquivo, `EvolutionDashboard.tsx`, que possui somente warning
de `no-img-element`:

`GlobalVideoPlayer.tsx`, `TechniqueSequencePlayer.tsx`, `XPBadgeNotification.tsx`,
`AdminPanel.tsx`, `AiCoachChat.tsx`, `CommunityFeed.tsx`, `EvolutionDashboard.tsx`,
`ExerciseLibrary.tsx`, `LandingPage.tsx` — **todos intocados pelo lote**.

`GymFlowContext.tsx` foi tocado (9 linhas — call-site de `createProgramFromBase`
do GOAL E), mas os 3 warnings permanecem nas mesmas linhas e fora dos trechos
alterados. **Conclusão: o lote Tempo–Foco introduziu zero problema novo de lint.**

> Achado (P3): a dívida de lint de projeto inteiro (12 erros + 6 warnings) nunca
> foi enumerada de ponta a ponta no rastreamento dos GOALs A–E, que só reportavam
> os "3 warnings". Registrado em `PENDENCIAS.md`.

## 7. Matriz de rastreabilidade

Legenda de cobertura: **T** = teste automatizado · **E** = inspeção estrutural de
código · **M** = QA manual no navegador · **NE** = não executável neste ambiente.

| Dimensão | Cobertura | Evidência |
|----------|-----------|-----------|
| Focos 1/2/3 | **T + E** | `workout-picker.test.ts` PART15-17/18/26/27 + "contratos adicionais" (ordem taxonômica, 3 focos sem duplicar aba, contadores equivalentes) |
| Tempos 10/30/60/90/240 | **T** | `workout-time-fit.test.ts`: 10 = clamp inferior (t14); 30 (t1); 60 (t3/t6); 90 (zonas → high); 240 = clamp superior + teto 12 exercícios (t15) |
| Perfis reduzido/padrão/alto | **T** | `workout-time-fit.test.ts` recomendações Compacto/Padrão/Alto Volume + zonas de fronteira 35–90 min |
| Estado dia vazio | **T** | time-fit t12 ("não fabrica diferença para dia vazio"); assessment "plano vazio → insufficient_data" |
| Estado dia parcial (append-only) | **T** | `workout-suggestion.test.ts` #31 ("aplicar SÓ acrescenta: slots intocados byte a byte") |
| Estado dia cheio | **T** | suggestion #32 ("dia já cheio: nada sugerido, aplicar no-op") |
| Estado dia estourado | **T** | suggestion #32 (within/above); assessment "exceeds_time nunca aplica a sugestão" |
| Sugestão determinística | **T + E** | suggestion #29 (duas chamadas idênticas ⇒ saída idêntica); código sem `Math.random`/`Date`/rede (só comentário) |
| Distribuição multi-foco / ranking | **T** | suggestion #35 (peso aditivo) e #36 (compostos antes de isolados) |
| Nomes programa vs dia (GOAL E) | **T** | `workout-program-normalization.test.ts` "createInitialDraft — PART 10" regras 1–7 |
| Multi-day (ordem/numeração/roundtrip) | **T** | normalization "programa multi-dia" (5 casos) |
| Picker: grupos/badges/Todos plana | **T + E** | picker PART15-23/24/25 + CORRECTIVE-004 P1-01..06 (Todos = flat, sem match/badge) |
| Busca (acento/aba/vazia) | **T** | picker "aplica a busca dentro da aba", "mantém busca ao trocar de aba", "reinicializa ao reabrir"; `exerciseSearch.test.ts` |
| Renderização visual / pixels | **NE** | requer navegador ao vivo |
| Safe-area / mobile 360px | **NE** | requer navegador ao vivo |
| Teclado / foco / acessibilidade (runtime) | **NE** | requer navegador ao vivo (contratos ARIA verificados por leitura de código) |
| Console do navegador (erros/hydration) | **NE (parcial)** | console do navegador não lido; **servidor dev limpo**, HTML sem marcador de erro |
| Next DevTools "1 Issue" | **NE** | overlay client-only; ver §12 |

Combinações mínimas exigidas (extrema 3 focos/240/alto; restritiva 1 foco/10/reduzido;
intermediária 2 focos/60/padrão): a **regra determinística** de cada uma está coberta
por teste (clamps de tempo, faixa de exercícios, distribuição por foco). A execução
**manual** dessas combinações **não foi realizada** (sem navegador). Não é alegada
cobertura manual de nenhuma combinação.

## 8–11. Resultados por foco / tempo / perfil / estado

Todos **verdes por teste automatizado** conforme a matriz da §7. Contagens dos
suites-âncora: time-fit **21**, picker **24**, suggestion **10**, normalization
**34**, plan-assessment **15**. Nenhuma execução manual no navegador foi feita;
portanto nenhum resultado visual é declarado como aprovado.

## 12. Sugestão determinística (§20 do enunciado)

Verificado por código + teste, **sem navegador**:

- **Sem `Math.random`, sem `Date`, sem rede, sem IA externa**: a única ocorrência
  de `Math.random` em `workout-suggestion.ts` é um **comentário** afirmando a
  ausência; não há chamada real (confirmado por busca). `IaCoachHologram.tsx` usa
  `Date.now()` apenas em loop de canvas (não é o motor de sugestão nem entra na
  landing).
- Determinismo, não-duplicação, respeito a equipamento, append-only, teto por
  retorno, distribuição multi-foco e defaults idênticos ao `handleAddExercise`:
  cobertos por `workout-suggestion.test.ts` #29–#38.
- Execução dupla comparando saída: coberta pelo caso #29 (a suíte falharia se o
  motor não fosse determinístico).

## 13. Nomes de programa vs dia (GOAL E)

Smoke **coberto por teste** (`createInitialDraft` regras 1–7): o caminho legado
nomeia o programa por `sourceProgramName` (ou `DEFAULT_PROGRAM_NAME`), nunca pelo
nome do dia; o nome do dia vira `customName` do Dia 1. O **smoke visual** no app
("ABC Hipertrofia Masculino" / "Dia A — Peito e Tríceps") **não foi refeito ao
vivo** neste GOAL (sem navegador) — permanece como o QA MANUAL já registrado na
entrada do GOAL-TF-E.

## 14. Multi-day / 15. Picker / 16. Busca

Contratos cobertos por teste (§7). Aspecto visual (alternância de abas com pixels,
snap horizontal, safe-area) **não executável** sem navegador.

## 17. Mobile 360px / 18. Desktop / 19. Teclado e acessibilidade

**Não executáveis ao vivo** (sem extensão do navegador). Os contratos de ARIA
(roving `tabIndex`, `aria-selected`, `aria-expanded/controls`, headings de seção,
`aria-label` de item) estão presentes no código e foram validados por leitura, mas
o comportamento em runtime (foco visível, ordem de tabulação, retorno de foco ao
disparador, ausência de foco preso, teclado virtual) **não foi verificado**.

## 20. Console

- **Servidor dev (`:3017`): limpo.** Rotas exercitadas `/` (200), `/poc-3d` (200),
  `/manifest.webmanifest` (200), rota inexistente (404). Nenhum warning/erro/
  hydration no terminal do Next.
- Assets referenciados (favicon, apple-touch-icon, ícones do manifest, `icon.svg`)
  **todos HTTP 200** — sem 404.
- **Console do navegador não foi lido** (sem extensão). Portanto "zero erros no
  console do navegador" **não é declarado** — apenas o lado servidor está limpo.

## 21. "1 Issue" do Next DevTools — investigação

**Classificação: D — NÃO REPRODUZIDA (ambiente não permite inspeção).**

O indicador "1 Issue" é um **overlay client-side** do Next DevTools; sem a extensão
do Chrome conectada não é possível clicar no badge nem ler título/mensagem/arquivo/
linha/stack. Investigação possível sem navegador, **toda negativa/limpa**:

1. Terminal do `next dev`: sem qualquer issue/warning/erro em nenhuma rota.
2. `layout.tsx`: `<html class="dark">` fixo no servidor (sem mismatch de tema);
   `metadata` sem `openGraph`/imagens ⇒ **sem** aviso de `metadataBase`.
3. Caminho de render da landing: sem `Math.random`/`Date.now()`/`new Date()`
   (as ocorrências estão em efeitos/handlers/canvas, não no render inicial).
4. Assets referenciados: todos 200 (nenhum 404 que gerasse 1 issue de rede).

**Hipótese (baixa confiança, a confirmar com navegador):** issue **dev-only** de
React ligada a um dos padrões legados já sinalizados pelo ESLint em runtime
(`react-hooks/set-state-in-effect` em `GlobalVideoPlayer`/`TechniqueSequencePlayer`,
ou `refs-during-render` em `XPBadgeNotification`) — todos disparam apenas quando
esses componentes montam/interagem, **não** na landing. **Recomendação:** repetir
com a extensão do Chrome ativa, clicar no badge e capturar título/arquivo/linha/
stack; registrar o resultado (GOAL de follow-up). Enquanto não inspecionado,
tratar como **risco P2 de severidade desconhecida**, provavelmente dev-only.

## 22. Classificação de achados (P0–P3)

- **P0:** nenhum.
- **P1:** nenhum.
- **P2:**
  - QA visual/interativa (focos/tempos/perfis/estados no navegador, mobile 360px,
    desktop) **não executável** — extensão do Chrome ausente.
  - Teclado/acessibilidade em runtime **não verificados**.
  - "1 Issue" do Next DevTools **não inspecionado** (severidade desconhecida,
    provavelmente dev-only).
- **P3:** dívida legada pré-existente — 12 erros + 6 warnings de ESLint de projeto
  inteiro; 3 warnings históricos do `GymFlowContext`; fonte de 8px nas badges;
  ausência de teste DOM automatizado do picker/teclado; dependência circular
  `workout-builder.ts ↔ workout-picker.ts`; toggle de sinergistas; migração do
  estimador legado; `draft.targetMinutes` no nível do programa; AI Coach mock;
  deduplicação de programas sugeridos (GOAL-10.5); GOAL-33A (taxonomia).
  Todos detalhados em `PENDENCIAS.md`.

## 23. Riscos e conclusão

Os 8 commits do lote formam uma cadeia linear limpa; testes, TypeScript, build web
e build mobile estão verdes (lint global permanece **vermelho** por dívida
preexistente, neutra ao GOAL F) e o núcleo determinístico (tempo, foco, perfil,
estados, sugestão, nomes, multi-day, picker) está coberto por 600 testes +
inspeção estrutural. O
risco remanescente é **exclusivamente da camada visual/interativa e do overlay do
DevTools**, que não puderam ser exercitados ao vivo neste ambiente — todos P2/P3,
nenhum P0/P1.

**Veredito: Classe B — lote aprovado com ressalvas.** A publicação e a inspeção
visual pendente ("1 Issue" + matriz visual/teclado/mobile) ficam a critério do
Founder, preferencialmente num passe com a extensão do Chrome ativa.
