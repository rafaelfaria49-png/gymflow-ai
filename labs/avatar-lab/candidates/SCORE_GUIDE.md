# SCORE_GUIDE — como pontuar cada critério (0–10)

Régua **única e objetiva** para avaliar candidatos ao Kai. Mesma régua para toda ferramenta = comparação justa. Alvo: `docs/avatar-design/KAI_DNA_v1.md` + `KAI_MOODBOARD_v1.md`. Esta camada de review humano alimenta os eixos visual/experiência-humana do `tools/rubric.json`; portões objetivos (peso/extensões/FPS/licença) vêm do analisador + `APPROVAL_CRITERIA.md`.

> **Princípio:** pontue o que **vê**, com evidência. Na dúvida entre duas notas, **escolha a menor** (premium é exigente). Honestidade > otimismo — uma nota inflada estraga o ranking inteiro.

---

## Banda geral de qualidade (vale para todos os critérios)
| Nota | Significado |
|:--:|---|
| **10** | Referência. Indistinguível de produção AAA premium. Nada a corrigir. |
| **9** | Excelente. Premium; no máximo um retoque mínimo. |
| **8** | Muito bom. Premium com ajustes pequenos. **Piso de "premium".** |
| **7** | Bom, mas claramente precisa de trabalho humano para virar premium. |
| **6** | Aceitável/limítrofe. Serve como base, longe de pronto. **Piso de portão.** |
| **5** | Mediano. Cheira a "IA genérica". |
| **3–4** | Fraco. Boneco/CGI evidente. |
| **1–2** | Ruim. Wireframe/skeleton/mock/colapso. |
| **0** | Ausente/inavaliável. |

---

## Critério a critério

### 1. Visual (impressão geral)
Primeira leitura em ~1 segundo: "isso é um app premium?".
- **9–10:** foto-real premium; passa o teste do corredor com folga.
- **7–8:** muito bom; leve cheiro de render.
- **5–6:** ok, mas "IA genérica".
- **3–4:** boneco/CGI evidente.
- **0–2:** wireframe/skeleton/mock.
> É uma nota **holística** de sanidade. Deve ficar a **±1 do Overall**; se divergir muito, re-revise (alguma sub-nota está errada).

### 2. Face — **PORTÃO (<6 reprova o candidato)**
Alvo: `KAI_DNA_v1 §3`. Masculino, neutro-focado, simpático, identidade própria, **sem uncanny**.
- **9–10:** "tem alguém aí, e eu confio"; traços naturais com micro-assimetria; sem uncanny; identidade própria.
- **7–8:** crível, com leve uncanny **ou** leve genérico.
- **6:** passável, mas artificial — limite do portão.
- **<6 (REPROVA):** olhar morto/anime, cara de jogo/CGI, uncanny grave, sorriso de catálogo travado, **ou** cara de celebridade reconhecível.

### 3. Body
Alvo: `KAI_DNA_v1 §2` + escala **8/10** (`§8`): atleta natural, V suave (ombro:cintura ~1,4), ~7,5 cabeças, definido **com gordura natural**.
- **9–10:** exatamente 7.5–8 na escala; proporção e definição naturais e alcançáveis.
- **7–8:** ótimo, com um pequeno desvio (uma região levemente forte/fraca).
- **5–6:** genérico, **ou** começando a exagerar (puxando p/ 8.5+).
- **3–4:** fisiculturista/super-herói/desproporcional, **ou** magro sem treino.
- **0–2:** anatomia quebrada.
> **Erre para baixo:** corpo "exagerado" é pior que "discreto" — exagero descaracteriza o Kai (`MOODBOARD §8`).

### 4. Hands — **PORTÃO (<6 reprova o candidato)**
Mãos são teste de qualidade do projeto.
- **9–10:** dedos corretos, fecham/abrem sem colapso; palma e proporção reais.
- **6:** utilizáveis com retoque.
- **<6 (REPROVA):** dedos fundidos/colapsados, "luva", contagem/relação errada, deformação grave.

### 5. Skin
Alvo: `KAI_DNA_v1 §4`. Os **4 não-negociáveis**: poros + SSS + micro-imperfeição + variação de cor.
- **9–10:** os 4 presentes; pele "respira"; brilho saudável controlado.
- **7–8:** 3 dos 4; convincente.
- **5–6:** lisa demais **ou** sem SSS; "quase boneco".
- **3–4:** plástica/borracha; oleosa permanente; cinza/laranja.
- **0–2:** cor chapada sem detalhe.

### 6. Hair
- **9–10:** fios/cards realistas, corte moderno de treino, encaixe natural no crânio.
- **7–8:** bom, leve aspecto de card.
- **5–6:** card chapado **ou** datado.
- **<5:** "capacete" low-poly, plástico brilhante, clipping grave.

### 7. Clothes
Alvo: `KAI_DNA_v1 §5`. Identidade GymFlow (paleta escura + **lime em detalhe**, tecido técnico real, tênis calçado, smartwatch).
- **9–10:** roupa GymFlow reconhecível, tecido com caimento/dobra real, acento lime cirúrgico, tênis + smartwatch corretos.
- **7–8:** premium, mas **sem identidade de marca** (genérico bom).
- **5–6:** genérica/cor lisa; caimento pobre.
- **<5:** marca de terceiros, estampa grande, sem caimento, pé descalço.
> Roupa errada **não** reprova sozinha (é finalizável), mas derruba a nota e exige pós-produção.

### 8. Naturalness
"Parece um humano natural e **alcançável**?" (não exagerado, não CGI).
- **9–10:** totalmente natural; "dá pra chegar nesse corpo treinando".
- **5–6:** ok, mas algo entrega que é IA/render.
- **<5:** exagerado/fisiculturista/uncanny/impossível.

### 9. Trust
"**Eu confiaria nesse treinador?**" (presença, confiança serena, sem arrogância).
- **9–10:** confiança imediata; "seguiria o treino dele".
- **5–6:** neutro; nem confio nem desconfio.
- **<5:** frio/morto, arrogante, ou "boneco sem alma".

### 10. Fitness Coach
"**Parece um personal trainer premium?**" (e não modelo/influencer/genérico).
- **9–10:** claramente um coach de elite, competente e premium.
- **5–6:** atlético, mas poderia ser qualquer um.
- **<5:** cara de influencer/modelo de capa, ou genérico sem competência.

---

## Overall (nota final) — fórmula
Média **ponderada** das 9 sub-notas mensuráveis (Visual é checagem de sanidade, não entra na soma):

```
Overall = 0.15·Face + 0.12·Hands + 0.12·Skin + 0.10·Body
        + 0.06·Hair + 0.05·Clothes
        + 0.15·Naturalness + 0.13·Trust + 0.12·FitnessCoach
```
(pesos somam 1.00; priorizam o que faz/quebra realismo e confiança: rosto, mãos, pele, naturalidade, confiança.)

- Arredondar a 1 casa decimal.
- **Visual** deve ficar a ±1 do Overall; se não, há uma sub-nota inconsistente → re-revisar.
- **Overall é provisório** enquanto faltar dado objetivo (FPS/peso/licença); marcar no `meta.json → notas`.

---

## Portões (gates) — reprovam **independentemente** do Overall
Qualquer um → `Status: REJECTED`:
- **Face < 6** (portão visual).
- **Hands < 6** (portão visual).
- **Peso do GLB > 8 MB** (analisador).
- **Extensão glTF obrigatória não suportada em R3F/Three** (analisador).
- **Não carrega em `useGLTF`** (analisador).
- **Licença incompatível** com uso comercial + embed web.
> Portões objetivos só se aplicam quando há GLB medido. Só com capturas → portões objetivos ficam `null` e o status fica `PENDING` (não dá pra aprovar sem o modelo real).

---

## Status — decisão final
| Status | Condição |
|---|---|
| **PENDING** | Ainda não avaliado, **ou** faltam dados objetivos (sem GLB/FPS/licença) para decidir. |
| **REJECTED** | Qualquer **portão** falhou, **ou** Overall **< 7.5**, **ou** qualquer sub-nota **< 6**. |
| **APPROVED** | **Todos** os portões passam **e** Overall **≥ 8.5** **e** nenhuma sub-nota **< 6**. |

- Faixa **7.5–8.4** com portões ok = **forte como BASE** (não "APPROVED" para herói): manter no ranking, marcar `REJECTED` para uso-como-está **ou** anotar "base B" e decidir produção A/B/C (`APPROVAL_CRITERIA.md`). Para o ranking binário pedido, use `REJECTED` e registre em `notas` que é "base viável (B)".
- **"Nenhum APPROVED ainda" é honesto e esperado** no início. O objetivo do lab é achar **o melhor equilíbrio**, não forçar uma aprovação.

> **Coerência com o sistema existente:** o piso de `APPROVED` (Overall ≥ 8.5) espelha o `macro_visual_min: 8.5` do `tools/rubric.json`; os portões Face/Hands < 6 espelham `visual_rosto_min`/`visual_maos_min: 6`. Este guia **não** substitui aquele scoring — é a régua humana que o alimenta.
