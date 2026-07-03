# FACE_SCORE_GUIDE — como pontuar um rosto do Kai (0–10)

Régua **única e objetiva** para avaliar **rostos** candidatos ao Kai, isolados de corpo e roupa. Mesma régua para toda ferramenta = comparação justa.

> **Herança (não redefinida aqui):**
> - **Banda geral de qualidade 0–10**, princípio "na dúvida, escolha a menor", e regra de honestidade → herdados de `../candidates/SCORE_GUIDE.md`.
> - **Alvo do rosto** → `docs/avatar-design/KAI_DNA_v1.md §3 (Face)` + `§4 (Pele)` e `KAI_MOODBOARD_v1.md §3/§4`.
> - **Lista de erros** que reprovam → `KAI_DNA §7.3` + `MOODBOARD §8.3`.
>
> Este guia **não cria scoring novo**: ele recorta a camada de **rosto** e especializa os **10 critérios** que o usuário definiu para esta fase.

> **Princípio:** pontue o que **vê**, com evidência. Na dúvida entre duas notas, **escolha a menor** (premium é exigente). Honestidade > otimismo — uma nota inflada estraga o ranking inteiro. **Avalie só o rosto** — ignore corpo, mãos e roupa (são constantes/neutros por design; ver `README.md`).

---

## Banda geral de qualidade (igual à da `candidates/SCORE_GUIDE.md`)
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

## Os 10 critérios de rosto

### 1. Confiança — *confidence*
"O rosto projeta **confiança serena de alta performance**?" (`KAI_DNA §6.1`). Olhar firme à frente, expressão estável, sem dúvida nem ansiedade.
- **9–10:** confiança calma imediata; "esse cara sabe o que faz".
- **5–6:** neutro; nem confiante nem inseguro.
- **<5:** inseguro, hesitante, **ou** confiança que vira arrogância (queixo erguido, desdém — `KAI_DNA §6.2`).

### 2. Simpatia — *likability*
"Parece **acessível e do lado do usuário**?" (`KAI_DNA §6.1` — acessibilidade). Caloroso na medida, sem frieza.
- **9–10:** simpático e humano; dá vontade de treinar com ele.
- **5–6:** neutro/indiferente.
- **<5:** frio, antipático, intimidador, **ou** simpatia falsa de catálogo/selfie.

### 3. Naturalidade — *naturalness* — **PORTÃO (<6 reprova)**
"Parece **um humano real**, sem uncanny?" (`KAI_DNA §3/§4`). Micro-assimetria, pele viva, traços críveis.
- **9–10:** "isso é foto de uma pessoa real"; sem uncanny.
- **6:** crível com leve uncanny — limite do portão.
- **<6 (REPROVA):** uncanny grave, olhar morto/vazio, cara de CGI/jogo, simetria perfeita de boneco, pele plástica.

### 4. Maturidade — *maturity*
"Lê como **~30 anos** (faixa 28–34)?" (`KAI_DNA §2.1`). Adulto crível, nem garoto, nem meia-idade.
- **9–10:** exatamente adulto ~30, com sutileza de expressão coerente.
- **5–6:** levemente jovem ou levemente mais velho que o alvo.
- **<5:** adolescente/"garoto de capa", **ou** claramente meia-idade/idoso.

### 5. Profissionalismo — *professionalism*
"Tem **acabamento disciplinado de profissional**?" (`KAI_DNA §6.1` — disciplina). Grooming cuidado (barba/cabelo), apresentação caprichada.
- **9–10:** grooming impecável e coerente; "treinador que se cuida".
- **5–6:** ok, mas desleixado em algum detalhe (barba irregular, cabelo sem cuidado).
- **<5:** desleixado, datado, **ou** "produzido demais" (vaidade de influencer).

### 6. Energia — *energy*
"Há **presença viva** no rosto?" (olhos alertas, vitalidade), **sem** virar euforia. Kai é energia **contida**, não "VAMOS, GUERREIRO!" (`KAI_DNA §6.2`).
- **9–10:** olhar vivo e presente, vitalidade calma.
- **5–6:** apático ou, no outro extremo, agitado demais.
- **<5:** olhar morto/sem vida, **ou** energia exagerada/eufórica que quebra a contenção premium.

### 7. Credibilidade — *credibility*
"**Eu confiaria na orientação técnica desse treinador?**" Competência percebida no olhar e na compostura (`KAI_DNA §1` — "ele sabe o que está fazendo").
- **9–10:** credibilidade técnica imediata; "seguiria o que ele mostra".
- **5–6:** neutro; não passa nem tira credibilidade.
- **<5:** parece amador, modelo sem competência, **ou** "boneco sem substância".

### 8. Aparência premium — *premium look*
"Tem **cara de produto caro**?" (`KAI_MOODBOARD §6`; `rubric.json → humanExperienceCriteria.premium`). Acabamento de app fitness internacional.
- **9–10:** acabamento premium de ponta; passa o teste do corredor com folga.
- **5–6:** ok, mas "IA genérica" / render comum.
- **<5:** amador, datado, low-cost.

### 9. Treinador — *fitness coach read*
"**Parece um personal trainer premium** — e não modelo/influencer/genérico?" (`KAI_DNA §1`; `candidates/SCORE_GUIDE` critério 10).
- **9–10:** claramente um coach de elite, competente e premium.
- **5–6:** atlético/genérico — poderia ser qualquer um.
- **<5:** cara de influencer/modelo de capa, **ou** genérico sem leitura de treinador.

### 10. Memorabilidade — *memorability* — **PORTÃO de identidade**
"Tem **identidade própria reconhecível** — um rosto que ninguém viu, mas em que se confia?" (`KAI_DNA §3`). **Sem cara de celebridade** (proibição absoluta `§7.3`).
- **9–10:** identidade forte e única; memorável, "esse é o Kai".
- **5–6:** crível mas **genérico/esquecível** (cara de "qualquer fitness model de IA").
- **<5:** totalmente genérico.
- **REPROVA (portão, independe da nota):** **cara de celebridade reconhecível** → identidade emprestada não pode ser o Kai.

---

## Overall (nota final) — fórmula
Média **ponderada** dos 10 critérios. Pesos priorizam o que faz/quebra confiança e realismo no rosto:

```
Overall = 0.15·Naturalidade + 0.13·Confiança + 0.12·Credibilidade
        + 0.12·Treinador    + 0.10·Simpatia  + 0.10·AparênciaPremium
        + 0.10·Memorabilidade + 0.08·Profissionalismo
        + 0.06·Maturidade   + 0.04·Energia
```
(pesos somam 1.00.)

- Arredondar a 1 casa decimal.
- **Overall é provisório** enquanto faltar dado objetivo do GLB (quando houver cabeça em GLB e licença); marcar em `meta.json → notas`.

---

## Portões (gates) — reprovam **independentemente** do Overall
Qualquer um → `Status: REJECTED`:
- **Naturalidade < 6** (portão de uncanny — espelha `Face < 6` do sistema existente).
- **Cara de celebridade reconhecível** (identidade emprestada — `KAI_DNA §7.3`).
- Qualquer sub-nota **< 6** (premium é exigente).
- **(Se houver GLB de cabeça)** licença incompatível com uso comercial + embed web; ou não carrega em `useGLTF`. Portões técnicos do `../tools/analyze-glb.mjs` (peso/extensões) são **informativos** nesta fase — a malha final será finalizada em CC5/Blender; registrar, mas não bloquear a direção de rosto por eles.

> Sem GLB ainda (só capturas)? Portões técnicos ficam `null` e o status fica `PENDING` para uso-como-asset; a **direção de rosto** ainda pode ser avaliada e ranqueada pelos 10 critérios visuais.

---

## Status — decisão final (igual à lógica da `candidates/SCORE_GUIDE.md`)
| Status | Condição |
|---|---|
| **PENDING** | Ainda não avaliado, **ou** faltam dados objetivos (sem GLB/licença) para decidir o uso-como-asset. |
| **REJECTED** | Qualquer **portão** falhou, **ou** Overall **< 7.5**, **ou** qualquer sub-nota **< 6**. |
| **APPROVED** | Nenhum portão falhou **e** Overall **≥ 8.5** **e** nenhuma sub-nota **< 6**. |

- Faixa **7.5–8.4** com portões ok = **direção forte / base viável (B)**, não vencedor: manter no ranking, registrar "base B" em `notas`, candidata a refino em `batch-002/`.
- **"Nenhum APPROVED ainda" é honesto e esperado** no início. O objetivo é achar **a melhor direção de rosto**, não forçar uma aprovação nem antecipar um vencedor.

> **Coerência com o sistema existente:** o piso de `APPROVED` (Overall ≥ 8.5) espelha `macro_visual_min: 8.5` do `../tools/rubric.json`; o portão de naturalidade < 6 espelha `visual_rosto_min: 6`. Este guia **alimenta** aquele scoring na dimensão de rosto; não o substitui.
