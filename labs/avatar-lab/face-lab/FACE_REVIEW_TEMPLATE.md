# FACE_REVIEW_TEMPLATE — análise visual de um ROSTO candidato ao Kai

> **Copiar este arquivo** para `batch-00X/face_NNN/review.md` e preencher olhando as capturas (+ GLB de cabeça, se houver). Alvo: `docs/avatar-design/KAI_DNA_v1.md §3/§4` + `KAI_MOODBOARD_v1.md §3/§4`. Régua de notas: `FACE_SCORE_GUIDE.md`. **Avalie só o rosto** — corpo/roupa são neutros por design e não entram na nota. **Escrever com evidência** (descreva o que vê), não adjetivos soltos.
>
> É o recorte de **rosto/pele** do `../candidates/REVIEW_TEMPLATE.md` (§2 Face, §3 Pele) especializado nesta fase.

---

## Identificação
- **ID:** `face_NNN`
- **Direção (prompt):** `FNN-<nome>` (ex.: `F08-calmo`) — ver `../PROMPTS_FACE.md`
- **Ferramenta / versão:** … (Rodin / ChatAvatar / outra)
- **Modalidade:** ☐ text-to-3D ☐ image-to-3D
- **Data da geração:** … · **Data da review:** …
- **Avaliador(es):** …
- **Entrada usada (prompt/imagem):** … (colar/referenciar a direção + delta)
- **Assets presentes:** ☐ preview_front ☐ preview_34 ☐ preview_closeup ☐ face.glb

## Impressão de 1 segundo (antes de analisar)
> Primeira leitura, sem racionalizar.
- Pareceu: ☐ treinador premium real ☐ IA genérica ☐ boneco/jogo ☐ CGI/uncanny
- Frase espontânea: "…"

---

## Análise por região (alvo: `KAI_DNA §3`, `MOODBOARD §3`)
Para cada item: **o que vejo** / **bate com o alvo?** / **erro presente?**
- **Formato do rosto:** … (oval-quadrado masculino? redondo infantil? esquelético/cinzelado?)
- **Mandíbula:** … (definida natural? "jawline de filtro"? mole?)
- **Olhos:** … ("tem alguém aí"? esclera realista, catchlight? olhar morto/anime?)
- **Nariz:** … (proporcional, leve imperfeição? perfeito de boneca?)
- **Boca/lábios:** … (neutra-focada, relaxada? pintada/"preenchida"?)
- **Sobrancelhas:** … (fios individuais, leve irregularidade? bloco chapado?)
- **Barba:** … (curta aparada 3–5mm / limpa? pintada/desleixada?)
- **Cabelo:** … (corte moderno de treino, fios reais? capacete/plástico?)
- **Expressão (repouso):** … (neutra-focada, serena? cara brava/vazia/careta?)
- **Sorriso (se houver):** … (genuíno/assimétrico, dos olhos? catálogo/dentista?)

## Pele do rosto (alvo: `KAI_DNA §4`, `MOODBOARD §4`)
- **Textura:** … (relevo real + SSS? borracha?)
- **Poros:** … (sutis e variáveis por região? lisa/tiling?)
- **Imperfeições:** … (micro-assimetria/marca/rubor/rugas leves coerentes com ~30? perfeita demais?)
- **Brilho:** … (saudável controlado? oleosa/plástica? fosca?)
- **4 não-negociáveis presentes (poros + SSS + imperfeição + variação)?** ☐ 4 ☐ 3 ☐ ≤2

## Identidade e uncanny
- **Uncanny valley?** ☐ ausente ☐ leve ☐ grave
- **Identidade própria?** ☐ forte/memorável ☐ genérico/esquecível ☐ **parece celebridade (PORTÃO)**
- **Teste dos 3 s no olhar:** ☐ "tem alguém aí, e eu confio" ☐ boneco/CGI

## Linguagem visual da captura (alvo: `MOODBOARD §6`)
- **Luz/fundo/contraste:** … (estúdio escuro premium, contraluz? chapado/overgrading?)
- *(Nota: problema só de captura ≠ problema do rosto — separar no comentário.)*

---

## Testes decisivos (sim/não)
- **Teste do corredor (1 s):** ☐ treinador premium ☐ jogo/boneco
- **Teste dos 3 s no olhar:** ☐ confio ☐ boneco/CGI
- **Teste do treinador:** "eu confiaria/treinaria com ele?" ☐ sim ☐ não
- **Teste da memória:** "fecho os olhos — esse rosto fica?" ☐ sim (memorável) ☐ não (genérico)
- **Teste da identidade:** "é um rosto próprio, não de celebridade?" ☐ sim ☐ não (PORTÃO)

## Notas (0–10 — copiar para `meta.json → scores`)
| Confiança | Simpatia | Naturalidade | Maturidade | Profissionalismo | Energia | Credibilidade | Premium | Treinador | Memorabilidade | **Overall** |
|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| | | | | | | | | | | |

> **Naturalidade < 6** ou **cara de celebridade** = `REJECTED` automático (ver `FACE_SCORE_GUIDE.md → Portões`).

## Veredito
- **Overall:** … · **Status:** ☐ APPROVED ☐ REJECTED ☐ PENDING
- **Por quê (1–3 frases, com evidência):** …
- **Direção forte para `batch-002/`?** ☐ sim — refinar o quê? … ☐ não — por quê? …
- **Pós-produção de rosto necessária (estimativa honesta):** ☐ pele/shader (SSS/poros) ☐ olhos ☐ cabelo ☐ barba ☐ inútil ☐ base útil ☐ quase pronto
