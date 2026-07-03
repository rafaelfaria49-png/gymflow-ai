# REVIEW_TEMPLATE — análise visual de um candidato ao Kai

> **Copiar este arquivo** para `<ferramenta>/candidate_NNN/review.md` e preencher olhando o GLB + as 4 capturas. Alvo: `docs/avatar-design/KAI_DNA_v1.md` + `KAI_MOODBOARD_v1.md`. Régua de notas: `SCORE_GUIDE.md`. **Escrever com evidência** (descreva o que vê), não adjetivos soltos.

---

## Identificação
- **ID:** `<ferramenta>_candidate_NNN`
- **Ferramenta / versão:** …
- **Modalidade:** ☐ text-to-3D ☐ image-to-3D
- **Data da geração:** … · **Data da review:** …
- **Avaliador(es):** …
- **Entrada usada (prompt/imagem):** … (colar/referenciar)
- **Assets presentes:** ☐ avatar.glb ☐ front ☐ 3/4 ☐ face ☐ hands

## Impressão de 1 segundo (antes de analisar)
> Primeira leitura, sem racionalizar.
- Pareceu: ☐ app fitness premium ☐ IA genérica ☐ jogo/boneco ☐ CGI/uncanny
- Frase espontânea: "…"

---

## 1. Corpo (alvo: atleta natural, escala 8/10 — `KAI_DNA_v1 §2`, `MOODBOARD §2`)
Para cada região: **o que vejo** / **bate com o alvo?** / **erro presente?**
- **Ombros:** … (V suave e natural? trapézio invadindo? largura cartum?)
- **Peitoral:** … (cheio e definido? "estufado"/sulco de palco?)
- **Braços:** … (proporcionais? "estourando a manga"?)
- **Antebraços:** … (veias só no esforço? cordão saltado?)
- **Abdômen:** … (definido com gordura natural? "ralado" de estágio? liso?)
- **Costas:** … (V suave? lat spread de competição?)
- **Pernas:** … (proporcionais ao tronco? finas? grotescas?)
- **Panturrilhas:** … (proporcionais? palito/exagerado?)
- **Proporção geral:** … (~7,5 cabeças? ombro:cintura ~1,4?)
- **Veredito do corpo:** ☐ natural/alcançável ☐ levemente exagerado ☐ fisiculturista/desproporcional

## 2. Face (alvo: `KAI_DNA_v1 §3`, `MOODBOARD §3`) — **PORTÃO (<6 reprova)**
- **Mandíbula:** … (definida natural? "jawline de filtro"? mole?)
- **Olhos:** … ("tem alguém aí"? esclera realista? olhar morto/anime?)
- **Nariz:** … (proporcional, leve imperfeição? perfeito de boneca?)
- **Boca/lábios:** … (neutra-focada? pintada/"preenchida"?)
- **Sobrancelhas:** … (fios individuais? bloco chapado?)
- **Barba:** … (curta aparada/limpa? pintada/desleixada?)
- **Cabelo:** … (corte moderno, fios reais? capacete/plástico?)
- **Sorriso (se houver):** … (genuíno/assimétrico? catálogo/dentista?)
- **Uncanny valley?** ☐ ausente ☐ leve ☐ grave
- **Identidade própria?** ☐ sim ☐ genérico ☐ parece celebridade
- **Teste dos 3 s no olhar:** ☐ confio ☐ boneco/CGI

## 3. Pele (alvo: `KAI_DNA_v1 §4`, `MOODBOARD §4`)
- **Textura:** … (relevo real + SSS? borracha?)
- **Poros:** … (sutis e variáveis? lisa/tiling?)
- **Imperfeições:** … (micro-assimetria/marcas/rubor? perfeita demais?)
- **Brilho:** … (saudável controlado? oleosa/plástica? fosca?)
- **4 não-negociáveis presentes (poros + SSS + imperfeição + variação)?** ☐ 4 ☐ 3 ☐ ≤2

## 4. Mãos — **PORTÃO (<6 reprova)**
- **Dedos:** … (corretos, fecham/abrem? colapsados? "luva"?)
- **Topologia/proporção:** … (palma/proporção reais? deformação?)
- **Veredito:** ☐ aprovadas ☐ limítrofes ☐ reprovam o avatar

## 5. Cabelo
- **Tipo/corte:** … · **Realismo (fios/cards):** … · **Erro?** (capacete/plástico/datado)

## 6. Roupa (alvo: `KAI_DNA_v1 §5`, `MOODBOARD §5`)
- **Camiseta/regata:** … · **Short:** … · **Tênis (calçado?):** … · **Smartwatch:** …
- **Identidade GymFlow?** ☐ marca presente (paleta escura + lime detalhe, tecido real) ☐ premium-genérico ☐ genérico/terceiros

## 7. Linguagem visual da captura (alvo: `MOODBOARD §6`)
- **Luz/fundo/contraste:** … (estúdio escuro premium? chapado/overgrading?)
- *(Nota: problema só de captura ≠ problema do modelo — separar no comentário.)*

---

## Testes decisivos
- **Teste do corredor (1 s):** ☐ premium ☐ jogo/boneco
- **Teste do pagamento:** "eu pagaria por um app com esse personagem?" ☐ sim ☐ não
- **Teste do treinador:** "eu confiaria/treinaria com ele?" ☐ sim ☐ não
- **Teste do alcançável:** "é um corpo de treinador de verdade?" ☐ sim ☐ não (fisiculturista/químico)

## Notas (0–10 — copiar para `meta.json → scores`)
| Visual | Face | Body | Hands | Skin | Hair | Clothes | Naturalness | Trust | Fitness Coach | **Overall** |
|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| | | | | | | | | | | |

## Pós-produção necessária (estimativa honesta)
- [ ] Retopologia · [ ] Conserto de mãos · [ ] Conserto de rosto · [ ] Pele/shader (SSS/poros)
- [ ] Cabelo · [ ] Roupa de marca GymFlow · [ ] Rig/skin weights · [ ] Otimização (peso/tris)
- **Esforço estimado para "premium":** … (☐ inútil ☐ base útil ☐ quase pronto)

## Veredito
- **Overall:** … · **Status:** ☐ APPROVED ☐ REJECTED ☐ PENDING
- **Por quê (1–3 frases, com evidência):** …
- **Decisão de produção (A/B/C — `APPROVAL_CRITERIA.md`):** …
