# CHECKLIST_REVIEW — avaliação humana padronizada de um candidato

Objetivo: transformar **um candidato** (`<ferramenta>/candidate_NNN/`) em **notas comparáveis e um status**, sem inventar nada. Use este checklist **na ordem**, marcando cada item. Régua de pontuação: `SCORE_GUIDE.md`. Alvo: `docs/avatar-design/KAI_DNA_v1.md` + `KAI_MOODBOARD_v1.md`.

> **Regra-mãe:** você só pontua o que **vê**. Sem `avatar.glb`/capturas reais na frente → não há nota → `Status: PENDING`. Nunca preencher de memória ou "no otimismo".

---

## 0. Preparação
- [ ] A pasta do candidato existe (copiada de `_TEMPLATE/candidate_XXX/`) com `meta.json` e `review.md`.
- [ ] Os assets foram **realmente depositados**: `avatar.glb` (se houver) + `preview_front.png`, `preview_34.png`, `preview_face.png`, `preview_hands.png`.
- [ ] Em `meta.json`, marcar `assets.*.present = true` **somente** para os que existem de fato.
- [ ] Identidade preenchida em `meta.json`: `ferramenta`, `modalidade`, `entrada.prompt_usado`/`imagem_referencia`, `data_geracao`, `custo`, `licenca`.

## 1. Portões objetivos (do analisador, não do olho)
- [ ] Rodar `../tools/analyze-glb.mjs` sobre o GLB (quando houver) e ler o relatório em `../results/_auto/`.
- [ ] **Peso** ≤ 8 MB? (acima → portão falha)
- [ ] **Extensões** glTF todas suportadas em R3F/Three? (extensão **obrigatória** não suportada → portão falha)
- [ ] **Carrega em `useGLTF`** sem erro? (não → portão falha)
- [ ] **Licença** compatível com uso comercial + embed web? (não → portão falha)
- [ ] Registrar resultados objetivos em `meta.json → gates` (`true` = passou).

> Sem GLB ainda (só capturas)? Pule os portões técnicos, marque-os `null` em `meta.json`, e siga para a avaliação visual — a nota fica **provisória**.

## 2. Avaliação visual (humano — você olha)
Abrir as 4 capturas + o GLB num viewer neutro (fundo escuro, luz de estúdio). Pontuar **0–10** cada critério pela régua do `SCORE_GUIDE.md`:
- [ ] **Visual** (impressão geral em 1 segundo)
- [ ] **Face** *(portão: <6 reprova)*
- [ ] **Body** (escala 8/10 do DNA — natural, não fisiculturista)
- [ ] **Hands** *(portão: <6 reprova)*
- [ ] **Skin** (poros + SSS + imperfeição + variação de cor)
- [ ] **Hair**
- [ ] **Clothes** (identidade GymFlow)
- [ ] **Naturalness** (humano, alcançável)
- [ ] **Trust** ("eu confiaria nesse treinador?")
- [ ] **Fitness Coach** ("parece um personal premium?")

## 3. Testes decisivos (sim/não — registrar no review)
- [ ] **Teste do corredor:** 1 segundo de tela → "app fitness premium" (✔) ou "jogo/boneco" (✘)?
- [ ] **Teste dos 3 segundos no olhar:** "tem alguém aí, e eu confio" (✔) ou "boneco/CGI" (✘)?
- [ ] **Teste do pagamento:** "eu pagaria por um app com esse personagem?" (✔/✘)
- [ ] **Teste do alcançável:** "esse é um treinador em forma de verdade" (✔) ou "fisiculturista/químico/impossível" (✘)?

## 4. Escrever o review
- [ ] Preencher `review.md` (cópia do `REVIEW_TEMPLATE.md`): o que funciona, o que falha, por região; com **evidência** ("os dedos da mão direita colapsam", não "mãos ruins").
- [ ] Listar a **pós-produção** necessária e uma estimativa honesta de esforço (base vs. inútil).

## 5. Fechar nota e status
- [ ] Calcular **Overall** pela fórmula ponderada do `SCORE_GUIDE.md`.
- [ ] Aplicar **portões**: Face<6, Hands<6, qualquer sub<6 crítico, ou portão objetivo falho → `REJECTED`.
- [ ] Definir **Status**: `APPROVED` / `REJECTED` / `PENDING` (regras no `SCORE_GUIDE.md`).
- [ ] Gravar tudo em `meta.json → scores`, `gates`, `status`.

## 6. Registrar no ranking
- [ ] Adicionar/atualizar a linha do candidato no `MASTER_RANKING.md` (ID = `<ferramenta>_candidate_NNN`).
- [ ] Reordenar a tabela por `Overall`.
- [ ] Atualizar o "Resumo por ferramenta" e a "Líder atual".

## 7. Decisão de produção (opcional, quando relevante)
- [ ] Classificar o uso conforme `APPROVAL_CRITERIA.md`: **A** (usar como está) · **B** (base + artista finaliza) · **C** (descartar para esse papel), justificando com números + horas humanas.

> **Independência do avaliador:** quando possível, 2 avaliadores fazem os passos 2–5 **separadamente**; divergência grande (>1.5 no Overall) → re-revisar juntos antes de gravar.
