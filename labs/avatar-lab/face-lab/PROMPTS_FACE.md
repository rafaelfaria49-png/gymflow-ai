# PROMPTS_FACE — 15 direções de rosto do Kai (variação controlada)

Prompts para **descobrir qual rosto representa melhor o Kai**. Não é o Kai definitivo — é a exploração do espaço de rosto **dentro** do envelope travado em `docs/avatar-design/KAI_DNA_v1.md §3 (Face)` + `§4 (Pele)` e `KAI_MOODBOARD_v1.md §3/§4`.

> **Este lab não gera imagens nem GLBs.** Estes são textos prontos para colar no Rodin / ChatAvatar / outra IA. Resultado real volta para `batch-001/face_NNN/` e é avaliado pelo `FACE_SCORE_GUIDE.md`. **Nada de notas inventadas, nada de vencedor antecipado.**

---

## Como funciona a variação controlada

A **única variável é o rosto.** Para a comparação ser justa, **tudo o resto é constante**: enquadramento (busto/ombros), luz, fundo, gola neutra sem marca, idade-base, etnia-base, pele viva. Cada direção muda **um eixo** do rosto e mantém o resto idêntico ao `BASE_FACE`.

**Prompt final de cada direção = `BASE_FACE` + `DELTA da direção` + `NEGATIVE`.**

- O `BASE_FACE` e o `NEGATIVE` abaixo são escritos **uma vez** (não repetir) — herdam `KAI_DNA §3/§4` e a lista "nunca usar" do `MOODBOARD §8`.
- Cada uma das 15 direções traz só o seu **DELTA** (a cláusula que muda) + a descrição/objetivo/diferença.
- **Toda variação acontece dentro do DNA.** Nenhum delta viola `KAI_DNA §7` (sem fisiculturista, sem influencer, sem celebridade, sem cartoon/CGI, sem sorriso de catálogo). Quando um delta mexe na idade ou na expressão, fica **dentro das tolerâncias** do DNA (28–34 anos, expressão neutra-focada).

---

## BASE_FACE (constante — colar em toda direção)

```
Hyper-realistic head-and-shoulders portrait of "Kai", a natural athletic male personal
trainer, 30 years old (read 28-34), warm healthy skin (Fitzpatrick III-IV), oval-square
masculine face shape with balanced mid-face, defined masculine jawline (natural, not
chiseled), straight-to-slightly-aquiline nose with a subtle natural imperfection, medium
brown alert confident eyes with realistic sclera (off-white, micro-veins), iris depth and
catchlight, masculine eyebrows with individual hairs and slight irregularity, medium lips
with a slightly fuller lower lip, short trimmed beard (3-5 mm), modern short training
haircut (dark brown, lower sides, lightly textured top), neutral-focused serene expression,
face symmetrical WITH natural micro-asymmetry, living skin with visible variable pores,
subsurface scattering, fine expression lines coherent with age 30, and natural color
variation (subtle blush at cheeks/ears) - skin that breathes, NOT plastic, own distinct
character identity (a face nobody has seen but everyone trusts). Head-and-shoulders
framing, plain neutral dark crew-neck top with NO visible branding, plain dark premium
background (#09090b), cinematic three-point studio lighting with a subtle rim light that
sculpts the face, high controlled contrast, photorealistic, PBR materials.
```

> **Por que busto/ombros e gola neutra:** isolar o **rosto**. Corpo e roupa são deliberadamente neutros para não influenciarem a avaliação (eles são avaliados na `candidates/`, não aqui). Ver `README.md → Regra de isolamento`.

## NEGATIVE (constante — colar em toda direção)

```
NOT cartoon, NOT anime, NOT toon shading, NOT low-poly, NOT wireframe, NOT skeleton,
NOT videogame face, NOT PS2/PS3 graphics, NOT CGI uncanny face, NOT dead or empty eyes,
NOT anime eyes, NOT poreless smooth plastic doll skin, NOT oily wet skin, NOT grey or
cadaverous skin, NOT fake orange tan, NOT airbrushed zero-pore skin, NOT fake catalog
smile, NOT dentist smile, NOT model smize, NOT arrogant face, NOT celebrity lookalike,
NOT perfectly symmetric face, NOT influencer aesthetic, NOT selfie pose, NOT magazine
cover pose, NOT bodybuilder, NOT exaggerated muscles, NOT cinematic overgrading,
NOT heavy LUT, NOT over-clarity HDR plastic, NOT oversaturated ad look.
```

---

# As 15 direções

> Formato de cada uma: **descrição completa · objetivo visual · diferença em relação aos demais · variação controlada (o que muda / o que NÃO muda) · DELTA (EN, para colar)**.

---

## F01 — Treinador mais amigável
- **Descrição completa:** Kai no extremo **caloroso e acessível** do envelope do DNA. Continua neutro-focado, mas com o mínimo de calor humano que faz o usuário sentir "esse cara está do meu lado". É a simpatia de `KAI_DNA §6.1` (acessibilidade) levada ao seu limite aceitável — sem virar sorriso de catálogo.
- **Objetivo visual:** maximizar **simpatia** sem perder credibilidade. Olhos que participam, leve relaxamento da musculatura facial.
- **Diferença em relação aos demais:** é o mais **caloroso** do conjunto. Onde F08 (calmo) é sereno e F13 (confiante) é firme, F01 é **convidativo**.
- **Variação controlada:** muda **só a micro-expressão** (calor). **NÃO** muda idade, traços, grooming, luz, fundo. O sorriso, se houver, é o "soft smile" genuíno e assimétrico de `KAI_DNA §3` — nunca dente perfeito de propaganda.
- **DELTA:** `the faintest genuine asymmetric soft smile starting from the eyes, slightly relaxed brows and softer cheeks, warm approachable micro-expression while staying neutral-focused.`

## F02 — Treinador mais maduro
- **Descrição completa:** Kai no **topo da faixa etária** (32–34), com a gravidade de quem treina e ensina há mais tempo. Mais experiência percebida, sem sair do alvo de "adulto ~30" do DNA.
- **Objetivo visual:** maximizar **maturidade** e gravitas; presença de mentor experiente.
- **Diferença em relação aos demais:** o mais **velho/experiente** do conjunto, oposto direto de F11 (energia alta) e do frescor de F10 (moderno).
- **Variação controlada:** muda **só a leitura de idade** (para o topo da faixa) e o que vem com ela (linhas de expressão um pouco mais presentes, leve grisalho opcional nas têmporas, sobrancelha um tom mais marcada). **NÃO** ultrapassa 34 (sem meia-idade), **NÃO** muda enquadramento/luz/grooming-base.
- **DELTA:** `read at the top of the age range (32-34), slightly more present forehead and crow's-feet expression lines, a touch heavier brow, optional faint grey at the temples, calm experienced gravitas - never older than mid-thirties.`

## F03 — Treinador mais técnico
- **Descrição completa:** Kai **analítico e preciso** — o treinador que corrige o milímetro do seu movimento. O foco do olhar é o protagonista; a expressão lê "atenção técnica", não dureza.
- **Objetivo visual:** maximizar **credibilidade** técnica via concentração; olhar focado e inteligente.
- **Diferença em relação aos demais:** é o mais **concentrado/analítico**, oposto do calor de F01 e da energia de F11. Clean-shaven para leitura de precisão.
- **Variação controlada:** muda **só o foco do olhar e o grooming de precisão** (clean-shaven, sobrancelhas levemente cerradas em concentração, boca neutra muito controlada). **NÃO** vira cara brava (proibido `KAI_DNA §6.2`); **NÃO** muda idade/luz/fundo.
- **DELTA:** `clean-shaven for a precise read, focused analytical gaze, eyebrows very slightly drawn in concentration, tightly controlled neutral mouth, intelligent attentive expression - focused, never frowning or harsh.`

## F04 — Treinador mais inspirador
- **Descrição completa:** Kai que **inspira pelo exemplo silencioso** (`KAI_DNA §6.1` — motivação silenciosa). Olhar levemente aberto e esperançoso, presença que diz "você consegue" sem euforia.
- **Objetivo visual:** equilibrar **confiança + simpatia** numa leitura otimista e motivadora.
- **Diferença em relação aos demais:** é o mais **otimista/aspiracional**; onde F03 é técnico e frio-focado, F04 é caloroso-elevado. Menos eufórico que F11.
- **Variação controlada:** muda **só a abertura/direção do olhar e o tônus otimista** (olhos alertas e claros, leve elevação do olhar à frente, traço de esperança). **NÃO** muda para "smize" de modelo; **NÃO** muda grooming/idade/luz.
- **DELTA:** `open slightly lifted forward gaze, bright clear alert eyes, a quiet hint of optimism and encouragement in the expression - inspiring by calm example, never euphoric, never a model smize.`

## F05 — Treinador premium
- **Descrição completa:** Kai com **acabamento editorial de produto caro**. Grooming refinado, pele tratada (poros mantidos!), luz que esculpe — leitura "Apple Fitness+ / Technogym". A pessoa não muda; a **qualidade de acabamento** sobe.
- **Objetivo visual:** maximizar **aparência premium**.
- **Diferença em relação aos demais:** o mais **luxuoso/editorial**; oposto de F07 (funcional, cru) e F12 (minimalista). Mais polido que F15 (que combina premium + gravitas).
- **Variação controlada:** muda **só o nível de acabamento** (grooming impecável, key+rim mais precisos, pele refinada mas real). **NÃO** apaga poros/imperfeições (continuaria `KAI_DNA §4`); **NÃO** muda traços/idade.
- **DELTA:** `editorial premium finish, impeccably groomed, refined sharp three-point key and rim lighting, sculpted but real skin with pores and imperfections preserved, high-end fitness brand product look.`

## F06 — Treinador esportivo
- **Descrição completa:** Kai com **vitalidade atlética** evidente no rosto — frescor de quem acabou de treinar (sem suor encharcado), corte bem curto e prático, olhar dinâmico.
- **Objetivo visual:** leitura **atlética/esportiva** viva, energia física saudável.
- **Diferença em relação aos demais:** mais "atleta em ação" que F07 (funcional, mais cru/comum) e que F10 (moderno, mais estiloso). Energia física, não a energia-de-olhar de F11.
- **Variação controlada:** muda **só a vitalidade atlética e o corte** (cabelo bem curto atlético, leve brilho saudável de pele fresca, olhar desperto e dinâmico). **NÃO** adiciona suor permanente/oleosidade; **NÃO** muda idade/fundo.
- **DELTA:** `athletic vitality, very short practical athletic haircut, healthy fresh post-training glow (NOT sweaty or oily), dynamic awake gaze, sporty energetic read.`

## F07 — Treinador funcional
- **Descrição completa:** Kai **real e sem verniz** — o personal de academia de verdade, autêntico, menos editorial. Realismo cru, stubble leve, naturalidade "documental".
- **Objetivo visual:** maximizar **autenticidade/naturalidade** de "treinador de verdade", baixando o brilho editorial.
- **Diferença em relação aos demais:** o mais **cru/autêntico**; oposto direto de F05 (premium) e F12 (minimalista limpo). Mais "gente comum competente" que F15 (elite).
- **Variação controlada:** muda **só o grau de polimento** (pele muito natural não-retocada, stubble leve, ar acessível sem glamour). **NÃO** vira desleixo/baixa qualidade; mantém poros+SSS reais (`§4`); **NÃO** muda luz/fundo (continua premium de captura).
- **DELTA:** `rugged authentic real-gym trainer realism, very natural un-retouched skin texture, light natural stubble, approachable unglamorous everyday-coach feel - real but still high-quality capture, never sloppy or low quality.`

## F08 — Treinador calmo
- **Descrição completa:** Kai na **serenidade máxima** — "calma confiante de alta performance" (`KAI_DNA §6.1`) no seu ápice. Musculatura facial totalmente relaxada, respiração visível e tranquila.
- **Objetivo visual:** maximizar **serenidade/calma**; presença que tranquiliza.
- **Diferença em relação aos demais:** o mais **sereno/relaxado**; onde F13 é firme-confiante e F11 é energético, F08 é quieto. Mais relaxado que F03 (que é focado-tenso).
- **Variação controlada:** muda **só o nível de relaxamento da expressão** (testa e mandíbula soltas, olhar firme porém suave, lábios totalmente relaxados). **NÃO** vira apatia/olhar morto (portão de naturalidade); **NÃO** muda idade/grooming/luz.
- **DELTA:** `maximally serene, fully relaxed forehead and jaw, soft steady calm gaze, lips completely at rest, visible tranquil breathing - calm confidence at its peak, never apathetic or empty.`

## F09 — Treinador disciplinado
- **Descrição completa:** Kai onde **a disciplina aparece no acabamento da pessoa** (`KAI_DNA §6.1`). Grooming exato, linha de barba nítida, mandíbula firme e compostura controlada — rigor visível.
- **Objetivo visual:** maximizar **profissionalismo/disciplina**; leitura de método e rigor.
- **Diferença em relação aos demais:** o mais **rigoroso/exato**; mais "militar-controlado" que F05 (luxo) e mais firme que F10 (estiloso). Disciplina vs. calor (F01).
- **Variação controlada:** muda **só o rigor de acabamento e compostura** (barba curta de linha perfeita, cabelo impecável, mandíbula firme, expressão composta e contida). **NÃO** vira agressividade/sargento (proibido `§6.2`); **NÃO** muda idade/traços.
- **DELTA:** `crisp disciplined grooming, sharp neat short beard line, impeccably kept hair, firm set jaw, composed controlled expression conveying method and rigor - disciplined, never aggressive or drill-sergeant.`

## F10 — Treinador moderno
- **Descrição completa:** Kai com **estilo contemporâneo atual** — corte moderno (crop texturizado/fade discreto), grooming do agora, frescor de tendência sem virar influencer.
- **Objetivo visual:** leitura **moderna/atual**; "treinador de 2026", estiloso e premium.
- **Diferença em relação aos demais:** o mais **estiloso/atual**; onde F02 é maduro e F07 é cru, F10 é fresco e na moda. Estilo sem a vaidade de influencer (proibida `§7.3`).
- **Variação controlada:** muda **só corte/grooming para o contemporâneo** (textured crop ou fade suave, barba muito curta ou limpa, styling atual). **NÃO** vira penteado de influencer datado/vaidoso; **NÃO** muda idade/luz/fundo.
- **DELTA:** `contemporary modern haircut (textured crop or subtle fade), current grooming, very light stubble or clean-shaven, fresh on-trend styling - stylish and premium, never an influencer or dated vain hairstyle.`

## F11 — Treinador energia alta
- **Descrição completa:** Kai com **mais vivacidade no olhar** — desperto, presente, com faísca. É energia **contida e premium**, não euforia de academia (`KAI_DNA §6.2` proíbe "VAMOS, GUERREIRO!").
- **Objetivo visual:** maximizar **energia** (presença viva) sem quebrar a contenção.
- **Diferença em relação aos demais:** o mais **vibrante/desperto**; oposto de F08 (calmo). É energia-de-olhar, distinta da energia-física de F06 (esportivo).
- **Variação controlada:** muda **só a vivacidade do olhar/expressão** (olhos mais despertos e brilhantes, leve elevação das sobrancelhas, traço de meio-sorriso energizado). **NÃO** vira euforia/grito/exagero; mantém neutro-focado; **NÃO** muda idade/grooming.
- **DELTA:** `brighter more awake lively eyes, a faint energized half-smile, slightly raised brows, a vivid present spark - contained premium energy, never euphoric, never shouting or over-excited.`

## F12 — Treinador minimalista
- **Descrição completa:** Kai **reduzido ao essencial** — limpo, atemporal, sem nada que distraia. Clean-shaven, corte simples, leitura pura. A força está na contenção.
- **Objetivo visual:** leitura **minimalista/atemporal**; premium por contenção (`MOODBOARD §6` — "premium por luz e contenção").
- **Diferença em relação aos demais:** o mais **limpo/reduzido**; oposto de F09 (rigor marcado) e F06/F10 (estilo). Mais simples e atemporal que F05 (editorial).
- **Variação controlada:** muda **só a simplicidade** (clean-shaven, corte o mais simples possível, zero elementos distintivos além das micro-imperfeições obrigatórias, expressão pura e neutra). **NÃO** apaga as imperfeições de pele (`§4`), que são obrigatórias; **NÃO** muda luz/fundo.
- **DELTA:** `pared-back minimal look, clean-shaven, simplest possible short haircut, no distinguishing accessories or marks beyond the required natural skin micro-imperfections, pure neutral timeless read - premium through restraint.`

## F13 — Treinador confiante
- **Descrição completa:** Kai na **confiança serena no seu ápice** (`KAI_DNA §6.1` — confiança). Olhar direto e firme, compostura assentada, postura de cabeça segura — "ele sabe o que faz".
- **Objetivo visual:** maximizar **confiança** sem tocar arrogância.
- **Diferença em relação aos demais:** o mais **firme/assertivo**; mais direto que F08 (calmo) e mais assentado que F04 (inspirador). Confiança ≠ a energia de F11.
- **Variação controlada:** muda **só a intensidade da confiança** (olhar direto e estável à câmera, ombros assentados relaxados, boca composta e segura). **NÃO** vira queixo erguido/desdém/superioridade (proibido `§6.2`/`§7.3`); **NÃO** muda idade/grooming/luz.
- **DELTA:** `strongest calm confidence, steady direct gaze to camera, settled relaxed shoulders, composed assured set of the mouth, self-assured grounded presence - confident, never arrogant or looking down.`

## F14 — Treinador natural
- **Descrição completa:** Kai com **realismo humano máximo** — o teste "isso é foto de uma pessoa real?". Micro-assimetria e imperfeições de pele no ponto mais alto crível, ar espontâneo/candid.
- **Objetivo visual:** maximizar **naturalidade** (o portão crítico) — derrotar o uncanny por completo.
- **Diferença em relação aos demais:** o mais **fotográfico/humano**; onde F05 é editorial-polido, F14 é candid-real. Mais espontâneo que F07 (que é "cru de academia" mas ainda posado).
- **Variação controlada:** muda **só o grau de realismo/espontaneidade** (assimetria natural e textura de pele no máximo crível, expressão candid não-posada, "alguém em casa" nos olhos). **NÃO** introduz defeito/deformação (continua premium); **NÃO** muda luz/fundo.
- **DELTA:** `maximum human realism, strongest believable natural micro-asymmetry and real skin texture, candid un-posed feel, genuine "someone is home" in the eyes - looks like an unedited photo of a real person, never deformed or flawed.`

## F15 — Treinador elite
- **Descrição completa:** Kai como **mentor de performance de elite** — a combinação de gravitas madura + acabamento premium + confiança assentada. É o "topo de gama": o treinador que comanda um centro de alto rendimento.
- **Objetivo visual:** leitura de **elite** — credibilidade + premium + autoridade serena somados.
- **Diferença em relação aos demais:** é a **síntese de ponta** (combina o melhor de F02 maduro + F05 premium + F13 confiante). Onde os outros isolam um eixo, F15 é o "tudo junto no auge", mantendo contenção.
- **Variação controlada:** combina **gravitas (alto da faixa etária) + grooming premium + confiança firme**, todos dentro do DNA. **NÃO** vira arrogância de "estrela"/celebridade (portão); **NÃO** muda enquadramento/luz/fundo.
- **DELTA:** `top-tier elite performance-mentor gravitas, mature confident read at the upper age range, refined premium grooming, serene authority of a high-end coach who leads an elite training facility - elite, never arrogant or celebrity-like.`

---

## Resumo das direções (atalho de comparação)

| Dir | Nome | Eixo maximizado | Oposto/contraste |
|---|---|---|---|
| F01 | amigável | simpatia (calor) | F08, F13 |
| F02 | maduro | maturidade (gravitas) | F11, F10 |
| F03 | técnico | credibilidade (foco) | F01, F11 |
| F04 | inspirador | confiança+simpatia (otimismo) | F03 |
| F05 | premium | aparência premium (editorial) | F07, F12 |
| F06 | esportivo | energia física (vitalidade) | F07, F10 |
| F07 | funcional | naturalidade (autenticidade crua) | F05, F12 |
| F08 | calmo | serenidade (calma) | F11, F13 |
| F09 | disciplinado | profissionalismo (rigor) | F01 |
| F10 | moderno | estilo (atual) | F02, F07 |
| F11 | energia alta | energia (olhar vivo) | F08 |
| F12 | minimalista | premium por contenção | F09, F05 |
| F13 | confiante | confiança (firmeza) | F08 |
| F14 | natural | naturalidade (realismo máx.) | F05 |
| F15 | elite | síntese (gravitas+premium+confiança) | (combina F02+F05+F13) |

> **Uso:** gerar pelo menos um candidato por direção na `batch-001/`, registrar `prompt_id` (ex.: `F08-calmo`) no `meta.json`, avaliar pelos 10 critérios e ranquear. As direções fortes — **não vencedores antecipados** — vão para refino na `batch-002/`.

> **Lembrete de escopo:** nenhuma imagem ou GLB foi gerado; estes são apenas textos de prompt. Toda variação respeita `KAI_DNA §3/§7` e o `MOODBOARD §8`.

*Fim — `labs/avatar-lab/face-lab/PROMPTS_FACE.md`.*
