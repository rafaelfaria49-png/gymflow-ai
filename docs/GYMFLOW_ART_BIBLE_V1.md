# GYMFLOW AI — BÍBLIA OFICIAL DE ARTE (ART BIBLE V1)

**Documento:** `docs/GYMFLOW_ART_BIBLE_V1.md`
**Natureza:** Direção de Arte. **Documento mestre** — guia oficial e perene para qualquer artista 3D, animador ou estúdio produzir **todos** os personagens, cenários, equipamentos e animações do GymFlow AI.
**Premissa de uso:** este documento deve permitir que um profissional **que nunca viu o projeto** produza assets conformes. Se algo precisar de "perguntar ao time", é uma falha deste documento — reportar e corrigir.
**Escopo desta etapa:** exclusivamente direção de arte. **Nenhum código, asset, dependência ou alteração de POC/Motion Engine** faz parte deste documento.

> **Documentos irmãos (contexto técnico, não arte):**
> `GYMFLOW_MOTION_ENGINE_SPEC_v01.md` (spec normativa) · `GYMFLOW_ASSET_SELECTION_001.md` (escolha de pipeline) · `GYMFLOW_MOTION_ENGINE_SPIKE_001.md` (prova de conceito) · `GYMFLOW_MOTION_STUDIO_E0_ASSET_PRODUCTION_PLAN.md` (plano de produção) · `ROADMAP_SPIKE_TO_PRODUCTION.md`.
> **Esta Bíblia é a fonte da verdade ESTÉTICA. Os documentos acima são a fonte da verdade TÉCNICA.** Em conflito de arte, vence esta Bíblia; em conflito técnico (peso, bones, formato), vence a SPEC.

---

## Tokens de marca (referência rápida — usados em todo o documento)

| Token | Valor | Uso |
|---|---|---|
| **gym-dark / fundo profundo** | `#09090b` | Fundo base, "vazio premium" |
| **gym-surface** | `#0b0b0f` | Palco, superfícies escuras |
| **gym-accent (cyber-lime)** | `#a3e635` | Cor-assinatura GymFlow. Energia, ativação, CTA, highlight muscular |
| **branco texto** | `#ffffff` / `#f4f4f5` | Texto e contraste máximo |
| **cinza-muted** | grafites neutros | UI secundária, metais, equipamentos |

> O **cyber-lime `#a3e635`** é a digital única da marca. Aparece como **acento controlado** (costura de roupa, LED, highlight de músculo ativo, glow de UI) — **nunca** como banho geral. Se a cena ficar "verde", errou a dose.

---

# SEÇÃO 1 — Identidade visual do GymFlow AI

### Qual sensação o usuário deve ter ao abrir o aplicativo?
> *"Eu entrei numa academia de elite, à noite, só para mim. Tudo é caro, preciso e silencioso. A tecnologia está a meu serviço. Eu vou evoluir aqui."*

Sensação-alvo em uma frase: **calma confiante de alta performance** — o oposto de barulho, neon exagerado ou "energia de videogame". Premium é **contenção**, não excesso.

### Palavras-chave (e como cada uma vira pixel)
| Palavra | Tradução visual |
|---|---|
| **Premium** | Materiais caros, acabamento impecável, espaço negativo generoso, nada amador |
| **Alta tecnologia** | Limpeza, precisão, LED discreto, dados elegantes — tech que sussurra, não grita |
| **Fitness** | Corpos atléticos reais, equipamentos profissionais, ambiente de treino sério |
| **Saúde** | Pele viva (não plástica), corpos naturais, luz que valoriza vitalidade |
| **Elegância** | Paleta restrita, composição equilibrada, ausência de poluição visual |
| **Academia moderna** | Espaço amplo, escuro-sofisticado, equipamento contemporâneo, espelhos |
| **Confiança** | Postura ereta, olhar firme dos avatares, estabilidade de composição |
| **Performance** | Definição muscular funcional, movimento eficiente, sem desperdício |
| **Energia** | Acento cyber-lime, contraluz, momento de esforço do movimento |
| **Disciplina** | Repetição limpa, técnica correta, ambiente sem distração |
| **Longevidade** | Corpos saudáveis e sustentáveis (não extremos), estética atemporal |

### O visual NÃO deve, em hipótese alguma, lembrar:
videogame · anime · cartoon · personagem infantil · boneco low poly · mock · wireframe · skeleton · debug.

> **Teste do corredor:** se um usuário visse a tela por 1 segundo e pensasse "isso é um jogo" ou "isso é um boneco/protótipo", **falhou**. O alvo de leitura é **"app fitness premium internacional"** (categoria Apple Fitness+ / Technogym), não "engine 3D".

---

# SEÇÃO 2 — Direção artística

| Dimensão | Definição oficial GymFlow |
|---|---|
| **Estilo visual** | **Realismo cinematográfico contido.** Fotorrealismo estilizado por iluminação e enquadramento — não hiper-render frio, não estilização. Referência de linguagem: trailer de produto Apple / editorial fitness premium. |
| **Nível de realismo** | **Alto, mas legível.** Humano crível (pele, pelos, micro-detalhe), porém otimizado para tempo real. Realismo **a serviço da clareza didática** — nunca realismo que esconde a técnica do exercício. |
| **Iluminação** | **Dramática e escultural**, fundo escuro, sujeito iluminado. Três pontos + contraluz (ver §11). Luz **revela músculo e forma**; sombra **dá premium**. Nada de luz chapada de "showroom claro". |
| **Contraste** | **Alto e controlado.** Sujeito claro sobre fundo profundo (`#09090b`). Pretos ricos, não esmagados; realces sem estourar. Sensação de "produto sob holofote". |
| **Materiais** | PBR fisicamente corretos. Pele com SSS sutil; tecidos com microfibra/normal real; metais escovados/anodizados; borracha fosca; pouco plástico brilhante. **Coerência de material entre todos os assets.** |
| **Texturas** | 2K como padrão (4K só herói/marketing). Densidade de textel consistente. Roupa com tecido real (não cor lisa). Pele com poros/imperfeição sutil — viva, não boneca. |
| **Reflexos** | **Discretos e direcionais.** Reflexo especular controlado em pele/metal/piso. Piso pode ter reflexo sutil ("wet look" leve) para premium — nunca espelho de jogo de corrida. |
| **Sombras** | **Suaves com contato definido.** Contact shadow ancorando o avatar ao chão (a POC já usa ContactShadows). Sombra dá peso e realidade; sem sombra = boneco flutuando = reprovado. |
| **Paleta de cores** | **Monocromática escura + 1 acento.** Base: pretos/grafites (`#09090b`–`#0b0b0f`). Pele em tons naturais. **Único acento vivo: cyber-lime `#a3e635`** (energia/ativação). Evitar competição cromática. |
| **Tom do ambiente** | **Noturno, premium, focado.** Academia de elite vazia, iluminação de cena, atmosfera de concentração. Não diurno-genérico, não festa-neon. |

### Regras de ouro da direção
1. **Fundo escuro, sujeito iluminado** — sempre. O avatar é o herói; o ambiente é moldura.
2. **Um acento só** — cyber-lime, em dose cirúrgica.
3. **Realismo serve à clareza** — se o realismo atrapalhar a leitura do exercício, simplifica-se a cena, nunca o corpo.
4. **Premium = contenção** — menos elementos, melhor acabados.

---

# SEÇÃO 3 — Avatar Masculino Oficial

> **Diretriz mestra:** corpo **atlético NATURAL**. Praticante consistente e saudável. **NÃO bodybuilder. NÃO fisiculturista. NÃO super-herói.** O usuário deve pensar "eu posso chegar lá", não "isso é impossível/químico".

| Atributo | Especificação |
|---|---|
| **Idade aparente** | 28–34 anos. Maduro, em pico saudável; não adolescente, não meia-idade. |
| **Altura** | ~1,80 m (referência; escala real 1 unidade = 1 m). |
| **Peso aproximado** | ~78–82 kg. |
| **Percentual de gordura** | ~12–15%. Definido e seco, **com** gordura subcutânea natural — não "shredded" de palco/estágio competitivo. |
| **Tipo físico** | Mesomorfo atlético equilibrado. Ombros levemente mais largos que quadril (V suave, **não** exagerado). Proporção funcional de atleta, não de cartum heroico. |
| **Tom de pele** | **Neutro/versátil** para identidade global — tom médio caucasiano-latino (~Fitzpatrick III–IV) como V1. (Roadmap futuro: variações de etnia — §14.) Pele **viva**, com subsurface, nunca cinza/plástica. |
| **Formato do rosto** | Oval-quadrado masculino, mandíbula definida porém natural, traços simétricos e simpáticos. **Sem** uncanny valley agressivo; **sem** beleza irreal de game. |
| **Olhos** | Castanhos, médios, alerta e confiantes. Esclera realista (não branco puro). Olhar firme à frente/no movimento — transmite foco. |
| **Cabelo** | Curto a médio, estilo treino (corte moderno, lateral mais baixa). Card/strand realista; **nunca** capacete sólido low-poly. Cor castanho-escuro. |
| **Barba** | Curta aparada (3–5 mm) ou bem barbeado. Limpo, cuidado — coerente com "premium/disciplina". |
| **Expressão** | Neutra-focada em repouso; leve tensão de esforço no concêntrico do exercício. **Nunca** sorriso de catálogo nem careta. Confiança serena. |
| **Postura** | Ereta, ombros para trás e baixos, core engajado, peso equilibrado. Postura **modelo de boa técnica** — ele é a referência. |
| **Roupa** | Regata ou camiseta dry-fit GymFlow + short/bermuda de treino (ver §5). Caimento de tecido real. |
| **Tênis** | Tênis de treino GymFlow (ver §5). Sempre calçado. |
| **Acessórios** | Smartwatch GymFlow no pulso (discreto). Opcional: pulseira fina. **Sem** excesso (sem cordões, bonés, fones — limpeza premium). |
| **Detalhes de pele** | Poros sutis, micro-imperfeições, brilho de suor leve **apenas** durante esforço (mapa controlado), subsurface scattering. Pele que respira. |
| **Detalhes musculares** | Definição funcional visível (deltoides, peitoral, dorsal, quadríceps) **sem** vascularização extrema nem separação de palco. Volume natural de quem treina, não de quem compete. |
| **Mãos** | Topologia correta de mão: dedos que fecham/abrem sem colapsar, palma realista, proporção certa. **Mãos são teste de qualidade** — mão ruim reprova o avatar. |
| **Unhas** | Curtas, limpas, naturais. Modeladas (não pintadas na textura de forma chapada). |
| **Veias** | Sutis no antebraço/mão durante esforço. **Discretas** — sinal de atleta natural, não de fisiculturista vascularizado. |

---

# SEÇÃO 4 — Avatar Feminino Oficial

> **Diretriz mestra:** corpo **fitness NATURAL**. Atlética, saudável, elegante. **Sem exageros** (nem hiper-musculosa, nem modelo-fashion irreal, nem hipersexualização). Naturalidade e força. Mesma qualidade de acabamento do masculino — **mesmo mundo, mesma marca**.

| Atributo | Especificação |
|---|---|
| **Idade aparente** | 26–32 anos. |
| **Altura** | ~1,68 m. |
| **Peso aproximado** | ~60–64 kg. |
| **Percentual de gordura** | ~18–22%. Tonificada e saudável, **com** curvas naturais femininas — não fisiculturista, não emagrecida ao extremo. |
| **Tipo físico** | Atlética equilibrada. Tônus visível em glúteos, pernas, ombros, core. Proporção feminina natural; força elegante. |
| **Tom de pele** | Neutro/versátil (~Fitzpatrick III), coerente com o masculino. Viva, com SSS. (Variações de etnia no roadmap, §14.) |
| **Formato do rosto** | Feminino harmônico, traços suaves e simétricos, simpático e confiante. Sem uncanny valley; sem beleza irreal de game. |
| **Olhos** | Castanhos/expressivos, alerta e serenos. Esclera realista. |
| **Cabelo** | **Preso para treino** — rabo de cavalo alto ou coque. **Obrigatório preso** para não atravessar corpo/ombros nas animações (evita clipping barato). Strand realista; cor castanho. |
| **Sobrancelhas/maquiagem** | Natural, "no-makeup look" — saudável, não produzido. Coerente com disciplina/performance. |
| **Expressão** | Neutra-focada; leve esforço no concêntrico. Confiança calma. |
| **Postura** | Ereta, alinhada, core ativo — referência de boa técnica, igual ao masculino. |
| **Roupa** | Top de treino GymFlow + legging (ver §5). Caimento e compressão de tecido real. Cobertura adequada e elegante. |
| **Tênis** | Tênis de treino GymFlow. |
| **Acessórios** | Smartwatch GymFlow. Opcional: pulseira fina. Sem excesso. |
| **Detalhes de pele** | Poros sutis, subsurface, brilho de suor leve só no esforço. Pele viva e saudável. |
| **Detalhes musculares** | Tônus definido (glúteo, quadríceps, ombro, abdômen) **sem** hipertrofia masculinizada. Definição saudável e natural. |
| **Mãos** | Mesma exigência do masculino — topologia e proporção corretas. |
| **Unhas** | Curtas/médias, naturais, limpas. |
| **Veias** | Praticamente imperceptíveis; no máximo sutil no esforço. |

> **Coesão M × F (regra de aprovação):** mesma linguagem de roupa, mesmo padrão de pele/shader, mesma escala plausível, mesmo nível de acabamento e iluminação. **Um premium e outro barato = reprova o par.**

---

# SEÇÃO 5 — Roupa oficial GymFlow

> Objetivo: **identidade própria reconhecível**. Um usuário deve olhar a roupa e pensar "isso é GymFlow", como reconheceria Nike/Gymshark. Premium, técnico, atemporal.

### Linguagem geral
- **Paleta:** base preta/grafite profunda (`#09090b`–`#1a1a1f`) + **acento cyber-lime `#a3e635`** em **detalhes** (costura, faixa lateral fina, logo, sola do tênis). Acento é **detalhe**, não cor dominante.
- **Tecido:** técnico/atlético real — dry-fit, microfibra, compressão. Caimento com peso e dobras reais; **nunca** cor lisa de plástico.
- **Acabamento:** costuras visíveis finas, recortes ergonômicos, zero logos de terceiros.

### Peças
| Peça | Especificação |
|---|---|
| **Camiseta (M)** | Dry-fit slim atlético, gola careca, manga curta. Preto grafite + detalhe lime na barra da manga ou costura lateral. Logo discreto no peito (esquerdo) e/ou nuca. |
| **Regata (M, alt.)** | Versão alternativa para exercícios que mostram ombro/dorsal. Mesmo padrão. |
| **Short (M)** | Short de treino acima do joelho, tecido leve, faixa de cintura com microbordado GymFlow, detalhe lime sutil. |
| **Legging (F)** | Cintura alta, compressão, costura ergonômica (valoriza forma de modo elegante, sem hipersexualizar). Preta com faixa lateral lime fina ou logo discreto na coxa/cós. |
| **Top (F)** | Top de treino com suporte adequado, cobertura elegante, recorte esportivo. Mesma paleta; detalhe lime. |
| **Tênis** | Tênis de treino próprio GymFlow: silhueta moderna de cross-training, cabedal preto/grafite em mesh técnico, **entressola/detalhe em cyber-lime**, sola estável. Assinatura visual da marca nos pés. |
| **Pulseira** | Fina, discreta, silicone/tecido preto com micro-detalhe lime. Opcional. |
| **Smartwatch** | **Smartwatch GymFlow** — caixa preta minimalista, tela com leve glow lime (dados/anel de atividade), pulseira esportiva preta. Reforça "alta tecnologia". Discreto no pulso. |

### Marca / Logotipo GymFlow (diretriz de aplicação)
> *Observação honesta: a vetorização final do logotipo é um entregável de design gráfico ainda a ser fornecido (ver §14, gaps de handoff). Aqui define-se como aplicá-lo, não o desenho final.*
- **Conceito:** monograma/wordmark minimalista, geométrico, tech — coerente com cyber-lime. Legível em escala pequena.
- **Aplicação na roupa:** discreta — peito esquerdo, nuca, cós, lateral da legging, língua do tênis. **Pequeno e elegante**, nunca estampa grande.
- **Cor do logo:** branco ou lime sobre preto; preto sobre lime. Sempre alto contraste, sempre limpo.

---

# SEÇÃO 6 — Academia Oficial GymFlow

> Conceito: **"academia boutique de elite, à noite, iluminação de cena"**. Espaço premium, escuro-sofisticado, focado — o palco do herói (avatar). **Sem excesso**: cada elemento ganha o direito de existir.

| Elemento | Especificação |
|---|---|
| **Tipo de academia** | Boutique premium / performance lab. Amplo, pé-direito alto, sensação de exclusividade. **Não** academia de bairro lotada, **não** garagem, **não** showroom branco. |
| **Iluminação** | Noturna, dramática, pontos de luz dirigidos sobre as estações. Fundo cai em penumbra rica. Luz de cena cinematográfica (ver §11). |
| **Equipamentos** | Profissionais, contemporâneos, paleta preta/grafite coesa (ver §7). Poucos e bem posicionados em cena — não amontoado. |
| **Piso** | Concreto polido escuro **ou** piso emborrachado premium grafite. Leve reflexo direcional (premium), sem virar espelho. Contact shadow ancora o avatar. |
| **Espelhos** | Parede de espelho ao fundo/lateral (assinatura de academia), com reflexo **controlado e escurecido** — reforça espaço sem custar performance nem distrair. Uso cênico, não literal. |
| **Luzes** | Spots dirigidos + strips LED arquitetônicas discretas. Temperatura mista (ver §11). |
| **Painéis LED** | Painéis/strips de **acento cyber-lime** discretos (moldura de parede, sob bancada, linha de piso). **Detalhe**, não dominante. Reforçam tech/energia sem virar boate. |
| **Detalhes** | Texturas reais (concreto, metal escovado, borracha, vidro). Sutileza: leve névoa volumétrica/atmosfera para profundidade cinematográfica. Zero poluição visual (sem cartazes, sem bagunça). |

> **Para a POC / runtime:** o cenário de produto é **minimalista e leve** (palco escuro + contact shadow + acento), conforme `STAGE_CONFIG` (fundo `#0b0b0f`). A "academia completa" descrita aqui é o **alvo estético/marketing**; o runtime usa uma **destilação leve** dela (ver SPEC §8 e E0 §5). **Cenário nunca compete por orçamento de performance com o avatar.**

---

# SEÇÃO 7 — Equipamentos

> **Identidade visual única:** todos os equipamentos pertencem à mesma família de design — estrutura **preta/grafite anodizada**, estofado preto premium, **detalhe cyber-lime mínimo** (logo, indicador, estofado-costura), metais escovados. Contemporâneos, sólidos, "Technogym-grade". Coerência total entre peças.

| Equipamento | Aparência oficial |
|---|---|
| **Banco** | Estrutura preta robusta, estofado preto fosco premium com costura discreta, regulagem visível de qualidade, pés com detalhe lime mínimo. |
| **Rack (gaiola)** | Aço preto anodizado, linhas retas modernas, marcações numéricas discretas, ganchos/segurança bem acabados, logo GymFlow sutil. |
| **Barra** | Barra olímpica realista: eixo metálico escovado, recartilhado (knurling) visível, presilhas pretas. Peso e proporção corretos. |
| **Anilhas** | Anilhas emborrachadas pretas com **anel/numeração em cyber-lime** por peso. Modernas, limpas, coesas. |
| **Halteres** | Hexagonais ou redondos emborrachados pretos, pegada metálica escovada, detalhe lime de peso. Família visual com as anilhas. |
| **Cross (crossover/funcional)** | Estrutura preta alta, cabos/polias bem modelados, pegadores pretos, detalhe lime nos pontos de ajuste. |
| **Leg Press** | Estrutura preta sólida, plataforma com textura antiderrapante, estofado premium, trilho metálico escovado. |
| **Smith** | Máquina Smith preta, barra guiada em trilho, travas de segurança visíveis e bem acabadas, marcações discretas. |
| **Polias** | Sistema de polia preto, cabos realistas, acessórios (corda, barra, triângulo) coesos, detalhe lime nos pegadores. |
| **Máquinas (genérico)** | Toda máquina segue: chassi preto anodizado + estofado preto premium + metal escovado + detalhe lime mínimo + logo GymFlow discreto. **Nenhuma peça destoa da família.** |

> **Regra técnica:** equipamentos são **suporte**, não herói. Modelar com **economia de polígonos** (LOD obrigatório na biblioteca), texturas compartilhadas onde possível, sem detalhe que custe performance e não apareça em câmera. O foco de orçamento é o avatar.

---

# SEÇÃO 8 — Movimento (padrão de animação)

> **Princípio:** movimento **humano, controlado e didático**. O avatar é um **personal trainer modelo** — toda repetição ensina a técnica correta. Beleza a serviço da didática.

| Dimensão | Padrão GymFlow |
|---|---|
| **Velocidade** | Ritmo de execução **correto e controlado**: excêntrico (descida) mais lento (~2–3 s), concêntrico (subida) firme (~1–2 s). Loop limpo. Nunca acelerado/robótico, nunca lento-arrastado irreal. |
| **Respiração** | Visível e correta: caixa torácica expande/contrai conforme a fase (inspira/estabiliza no excêntrico, expira no concêntrico). Sutil — dá vida, não exagera. |
| **Transição** | Entrada e saída suaves; início = fim para loop perfeito. Microajuste de "settle" entre reps. Sem corte seco, sem teleporte de pose. |
| **Postura** | Sempre tecnicamente correta (coluna neutra, alinhamento articular). A postura É o produto — erro de postura ensina errado (ver §9 e E0 §8). |
| **Olhar** | Direcionado e estável conforme o exercício (à frente, ou acompanhando o movimento). Transmite foco e controle. Cabeça não "flutua". |
| **Equilíbrio** | Peso distribuído de forma crível; centro de massa coerente; pés ancorados (sem foot sliding). Sensação de força estável. |
| **Naturalidade** | Aceleração/desaceleração reais (ease in/out), micro-movimentos de estabilização, peso corporal perceptível. Zero interpolação linear "de robô". |

### Erros de animação que reprovam (sempre)
Foot sliding · interpolação linear robótica · jitter · pose congelada sem respiração · loop com "salto" · membros que atravessam o corpo/equipamento · biomecânica incorreta (ver §9).

---

# SEÇÃO 9 — Biomecânica (padrão visual)

> Como o GymFlow **comunica** anatomia e técnica em cima do avatar realista. Camada **didática** sobre a camada estética. Sempre **elegante e clara**, nunca poluída.

| Necessidade | Linguagem visual oficial |
|---|---|
| **Como destacar músculos** | **Glow/realce em cyber-lime `#a3e635`** sobre o(s) músculo(s)-alvo, com gradiente suave (mais intenso no ventre muscular). Camada aditiva sobre a pele — músculo "acende". Primário mais forte, secundário mais suave. **Nunca** colorir o corpo inteiro; **nunca** parecer raio-x de jogo. |
| **Como mostrar ativação** | Intensidade do glow **pulsa com a fase de contração** — acende no concêntrico (esforço), suaviza no excêntrico/relaxamento. Comunica "este músculo está trabalhando AGORA". |
| **Como mostrar postura** | **Linha de alinhamento** sutil (coluna/eixo) e/ou marcadores discretos de articulação **apenas quando o modo "análise" estiver ativo**. Linha fina, elegante, lime ou branca. Fora do modo análise, postura é comunicada pela própria execução correta. |
| **Como mostrar correção** | Contraste **certo vs. errado**: pose correta em lime/neutro, desvio incorreto destacado em **alerta** (âmbar/vermelho discreto) com seta/arco indicando a correção. Curto, didático, depois volta ao correto. |

### Regras absolutas da camada biomecânica
1. **É overlay, não é o avatar.** Por baixo há sempre um humano realista. O highlight nunca substitui o corpo (jamais "esqueleto colorido" como visual).
2. **Acende/apaga.** A camada didática pode ser ligada/desligada; o avatar premium existe com ou sem ela.
3. **Cyber-lime para ativação, alerta para erro.** Vocabulário cromático consistente.
4. **Elegância sobre informação:** se a tela virar "infográfico poluído", reduzir. Premium primeiro.

---

# SEÇÃO 10 — Câmeras

> Linguagem de câmera **cinematográfica e estável**. Cada plano tem propósito didático e estético. Distância/altura coerentes com escala humana (referência de runtime: alvo ~`[0, 1.0, 0]`, fov ~35; ver `STAGE_CONFIG`/SPEC §7).

| Câmera | Uso e enquadramento |
|---|---|
| **Frontal** | Plano frontal, levemente acima da linha do quadril. Mostra simetria, alinhamento e o exercício "de cara". Plano-base de muitas telas. |
| **Lateral (perfil)** | Perfil 90°. **A câmera técnica mais importante** para a maioria dos exercícios (agachamento, supino, stiff) — revela coluna, quadril, amplitude e trajetória. |
| **45° (três-quartos)** | Plano-herói. Combina volume, profundidade e leitura técnica. **O plano de marca** (hero shot) — premium e legível. |
| **Zoom** | Aproximação dirigida a uma região (joelho, quadril, ombro) para detalhe técnico. Movimento suave de dolly/zoom, nunca tranco. |
| **Replay** | Repetição da rep sob ângulo escolhido, ritmo controlado, ideal após execução para revisão. Pode encadear ângulos (lateral → 45°). |
| **Close** | Detalhe de músculo ativo/articulação, casado com highlight biomecânico (§9). Foco raso (DOF sutil) para premium. |
| **Slow Motion** | Desaceleração da fase crítica (ex.: profundidade do agachamento) para ensino. Movimento ultra-suave, sem perda de naturalidade. |

### Diretrizes de câmera (todas)
- **Estabilidade**: movimentos suaves, ease in/out, sem shake gratuito.
- **Respeito à escala**: nunca ângulos que distorcem o corpo (sem grande-angular deformante).
- **Premium**: enquadramento com respiro, sujeito valorizado, fundo em penumbra.
- **Órbita livre** (interação do usuário) limitada a distâncias seguras (sem entrar no corpo, sem ver "por baixo do palco") — coerente com os limites de controle da POC.

---

# SEÇÃO 11 — Direção de iluminação

> Esquema oficial: **três pontos + contraluz**, fundo escuro, sujeito esculpido. Luz é o que transforma "modelo 3D" em "produto premium". A iluminação é **assinatura** GymFlow.

| Luz | Função e especificação |
|---|---|
| **Luz principal (key)** | A 30–45° do sujeito, ligeiramente acima. **Branco-neutro a levemente quente (~4500–5200 K)**. Esculpe o volume muscular, define a forma. Intensidade dominante. |
| **Luz secundária (fill)** | Lado oposto, mais fraca (ratio ~1:3 a 1:4 com a key). Suaviza sombras sem matar o contraste. **Levemente fria (~6000 K)** para separação sutil. Mantém a sombra rica, não preta-chapada. |
| **Contraluz (rim/back)** | Atrás/acima, recorta a silhueta do sujeito contra o fundo escuro. **Pode carregar leve tom cyber-lime** — assinatura de energia/marca no contorno. Crucial para o "pop" premium e para separar avatar do fundo. |
| **Temperatura geral** | Mista e controlada: key neutra-quente, fill fria, acento lime no rim/ambiente. Sensação noturna-sofisticada, nunca diurna-chapada. |
| **Reflexos** | Especular controlado em pele (saudável, não oleosa), metal escovado e piso (direcional sutil). HDRI/ambiente discreto para PBR correto, sem dominar a cena. |
| **Ambientação** | Fundo em penumbra rica (`#09090b`), leve gradiente/vinheta natural, opcional névoa volumétrica sutil para profundidade. Painéis LED lime discretos pontuam o ambiente (§6). |

### Regras de iluminação (todas)
1. **Fundo escuro, sujeito iluminado** — inegociável.
2. **Contraluz sempre** — é o que separa premium de amador.
3. **Acento lime na luz é detalhe** (rim/ambiente), nunca banho geral.
4. **Sombra é premium** — pretos ricos, contact shadow ancorando, nunca achatar com luz total.
5. **Consistência**: o mesmo esquema vale para todos os avatares/planos, ajustado por câmera.

---

# SEÇÃO 12 — Qualidade mínima aceitável (checklist)

### ✔ O asset DEVE parecer:
- [ ] **Humano** (anatomia, pele e movimento críveis)
- [ ] **Premium** (acabamento de produto caro)
- [ ] **Academia real** (ambiente/equipamento profissionais e coesos)
- [ ] **Natural** (corpo atlético natural, sem exageros)
- [ ] **Moderno** (linguagem contemporânea, tech contida)
- [ ] **Elegante** (paleta restrita, composição limpa)

### ❌ REPROVAR IMEDIATAMENTE se parecer:
- [ ] **skeleton** (ossos/joints como visual)
- [ ] **wireframe**
- [ ] **cartoon** (estilização/toon)
- [ ] **boneco barato** (genérico/plástico/sem alma)
- [ ] **videogame antigo** (low-poly, textura pobre, era PS2/PS3)
- [ ] **mock** (placeholder vendido como final / aparência de protótipo/debug)

> **Regra de honestidade (herdada do projeto):** enquanto não houver asset real, usa-se **placeholder honesto** na UI — nunca se chama um palco vazio, esqueleto ou wireframe de "avatar 3D realista". A reprovação acima vale para qualquer asset que **se proponha a ser final**.

---

# SEÇÃO 13 — Referências visuais

> O que **aproveitar** de cada uma. Referência é **direção**, não cópia — GymFlow tem identidade própria (escuro + cyber-lime + realismo contido).

| Referência | O que aproveitar |
|---|---|
| **Apple Fitness+** | Iluminação de estúdio impecável, fundo limpo, tipografia/UI elegante, corpos reais e diversos, sensação premium-acessível. **Padrão-ouro de "premium sem ser frio".** |
| **Nike Training Club** | Energia atlética, contraste forte, atletas reais em ótima forma natural, linguagem de movimento motivacional, uso ousado-porém-controlado de acento. |
| **Technogym** | **Linguagem de equipamentos premium** — design industrial preto/metal, acabamento de luxo, ambiente boutique de elite. Referência mestra para §6 e §7. |
| **WHOOP** | Estética **dados/dark UI**, minimalismo tech, glow de métrica sobre fundo escuro. Referência para a camada biomecânica/dados (§9) e o smartwatch (§5). |
| **Peloton** | Iluminação dramática de estúdio noturno, produção cinematográfica, instrutor como herói iluminado, atmosfera de "aula premium". Referência para §6 e §11. |
| **Fitbod** | Clareza didática de exercício, visualização de músculos-alvo limpa e funcional. Referência para **como comunicar músculo ativado** sem poluir (§9). |
| **Gymshark** | **Roupa fitness com identidade de marca forte**, caimento técnico, atletas naturais aspiracionais, fotografia de roupa premium. Referência mestra para §5. |
| **Lululemon Studio** | Elegância serena, paleta sofisticada, tecido premium, bem-estar/longevidade (não "gym bro"). Equilibra a energia atlética com **calma premium** — exatamente o tom GymFlow. |

> **Síntese GymFlow = Technogym (ambiente/equipamento) + Apple Fitness+ (iluminação/premium) + Gymshark (roupa/atleta natural) + WHOOP (camada tech/dados) — sob a assinatura escuro + cyber-lime + realismo contido.**

---

# SEÇÃO 14 — Briefing para artista 3D (contratação real)

> Texto pronto para handoff profissional. Acompanha a SPEC técnica e o `E0_ASSET_PRODUCTION_PLAN` (formato, peso, bones, pipeline).

### 14.1 Quem somos / o que estamos construindo
GymFlow AI é um aplicativo de fitness **premium internacional**. Precisamos de **avatares humanos 3D realistas** (masculino e feminino), uma **biblioteca de animações de exercícios** tecnicamente corretas, **equipamentos** e **cenário de academia**, todos com **identidade visual única** e qualidade **AAA**, otimizados para **tempo real na web e mobile** (React Three Fiber / Three.js, formato **GLB**).

### 14.2 O que esperamos (padrão)
- **Realismo cinematográfico contido** (§1, §2). Humano premium, atlético **natural** (§3, §4) — não bodybuilder, não estilizado.
- **Identidade de marca**: paleta escura + acento **cyber-lime `#a3e635`**, roupa GymFlow própria (§5), equipamentos coesos (§7).
- **Iluminação e câmera** conforme §10–§11.
- **Movimento didático e natural** (§8) com **biomecânica correta** validada por profissional (§9 + E0 §8/§9).
- **Acabamento impecável** de pele, rosto e **mãos** (mãos são teste de qualidade).

### 14.3 O que será entregue
1. Avatar **masculino** oficial (§3) — modelo + rig + roupa, PBR, GLB otimizado.
2. Avatar **feminino** oficial (§4) — idem.
3. **Animações** de exercício (começando pelo agachamento V1) — clips limpos, loop, biomecânica correta, reutilizáveis entre M e F.
4. **Equipamentos** (§7) coesos, com LOD.
5. **Cenário** de academia (§6) — versão runtime leve + (opcional) versão render/marketing.
6. **Arquivos-fonte** (projeto CC4/.blend/FBX) + **GLB final otimizado** (Draco/Meshopt + KTX2, 2K).

### 14.4 Padrão de qualidade
- **AAA** legível em tempo real. Conforme checklist §12 e GO/NO-GO §15.
- Coesão total **M × F** e entre todos os assets (mesma marca/mundo).
- Dentro do **orçamento técnico** (ver SPEC §10 / E0 §7: avatar ≤6 MB ideal/≤8 MB teto, ≤40k tris ideal/≤60k teto, ≤70 bones, desktop ≥60 fps, mobile ≥30 fps).

### 14.5 O que será RECUSADO
skeleton · wireframe · cartoon/toon · low-poly evidente · boneco genérico barato · aparência de videogame antigo · mock/protótipo vendido como final · roupa sem identidade / de terceiros · bodybuilder/exagero · uncanny valley grave · mãos/rosto malfeitos · foot sliding / biomecânica errada · asset **sem licença comprovada por escrito**.

### 14.6 Licença (cláusula obrigatória)
**Work-for-hire / transferência total de direitos**: GymFlow recebe **posse e uso comercial irrestrito**, incluindo **embutir e servir os assets em aplicativo web/mobile** para usuários finais. Se houver ferramenta com EULA própria (ex.: CC4/ActorCore), o artista deve **garantir e comprovar por escrito** a permissão de **web embed**. Origem de todo asset **documentada**. (Ver `GYMFLOW_ASSET_SELECTION_001.md`.)

### 14.7 Gaps de handoff a fornecer junto (honestidade de produção)
Para um handoff 100% autossuficiente, acompanham este briefing (entregáveis do lado GymFlow, ainda a finalizar):
- **Logotipo GymFlow vetorial** (arquivos finais) — §5 define aplicação, não o desenho final.
- **Board de referência de imagem real** (moodboard visual das §13) — este documento descreve; um board de imagens acelera o alinhamento.
- **Roadmap de diversidade** — V1 define 1 M + 1 F neutros; variações de etnia/biotipo/idade são ondas futuras a especificar.

---

# SEÇÃO 15 — Critérios de aprovação (GO / NO-GO)

> Decisão objetiva. Combina **arte** (esta Bíblia) + **técnica** (SPEC/E0) + **didática** (validação profissional).

### ✅ GO — o asset só é aprovado se TODOS:
- [ ] **Parece humano** (anatomia/pele/movimento críveis — §3, §4, §8)
- [ ] **Parece premium** (acabamento AAA — §1, §2, §12)
- [ ] **Roda bem** (desktop ≥60 fps, mobile ≥30 fps, dentro do peso — §14.4 / E0 §7)
- [ ] **Licença correta** (posse + web embed comprovados por escrito — §14.6)
- [ ] **Movimento correto** (natural, loop, sem foot sliding — §8)
- [ ] **Postura correta** (biomecânica validada por profissional de Ed. Física — §9 / E0 §9)
- [ ] **Qualidade AAA** (coesão M×F, mãos/rosto/pele/roupa aprovados — §12)

### ❌ NO-GO — reprova se QUALQUER:
parece boneco barato / cartoon / low-poly / videogame antigo / skeleton / wireframe / mock · pesado demais ou FPS abaixo do mínimo · licença duvidosa · movimento ou postura errados · mãos/rosto/roupa malfeitos · sem identidade de marca · incoerência M×F.

### Processo
2 avaliadores de arte (checklist §12) **+** 1 profissional de Ed. Física (biomecânica) **+** verificação técnica (FPS/peso/licença). Divergência em item crítico → revisar antes de decidir. Aprovação registrada por asset.

---

# SEÇÃO 16 — Conclusão

### A pergunta-teste
> **Se este documento fosse entregue a um estúdio de animação AAA, eles conseguiriam produzir exatamente o que imaginamos?**

### Resposta honesta: **SIM — para 95% do trabalho. Com 3 anexos, 100%.**

Um estúdio AAA, lendo esta Bíblia **junto com os documentos técnicos irmãos** (SPEC, E0, ASSET_SELECTION), tem o necessário para produzir conformemente, porque o documento fornece:
- **Sensação-alvo e palavras-chave traduzidas em pixel** (§1) — direção emocional clara.
- **Direção artística mensurável** (§2): estilo, realismo, contraste, materiais, paleta, iluminação definidos, não vagos.
- **Fichas completas de personagem** (§3, §4) com números (idade, altura, %gordura, biotipo) — um character artist consegue esculpir a partir disso.
- **Identidade de marca operável** (§5, §6, §7): roupa, ambiente e equipamentos com paleta, materiais e regras de aplicação.
- **Padrões de movimento, biomecânica, câmera e luz** (§8–§11) — animador e lighting artist têm receita.
- **Checklists e GO/NO-GO objetivos** (§12, §15) — critério de aceite sem ambiguidade.
- **Referências com instrução de uso** (§13) e **briefing de contratação pronto** (§14).

### Por que ainda não é 100% só com este arquivo (e como chegar lá)
Honestamente — porque a Bíblia define o **sistema estético**, mas três insumos visuais finais dependem de entregáveis do lado GymFlow (já listados em §14.7):
1. **Logotipo vetorial final** (aqui há a diretriz de aplicação, falta o desenho oficial).
2. **Moodboard de imagens reais** (este texto descreve com precisão; imagens reais eliminam qualquer interpretação subjetiva de "premium").
3. **Roadmap de diversidade** (V1 fecha 1 M + 1 F; variações futuras precisam de especificação própria).

Esses três **não são lacunas de direção** — são **assets de apoio** que acompanham o handoff. Com eles anexados, a resposta à pergunta-teste é **SIM, integralmente**: um estúdio AAA produziria o GymFlow imaginado sem precisar conhecer o projeto.

### Status do documento
**Bíblia Oficial de Arte do GymFlow AI — V1.** Documento mestre, perene. Atualizável por versão (V2, V3…) à medida que a identidade evolui (novos exercícios, novas etnias/biotipos, novos cenários). **A direção estética definida aqui é a fonte da verdade de arte do projeto.**

> **Lembrete de escopo:** nenhuma linha de código foi escrita, nenhum asset criado, nada instalado ou alterado. Este documento é **exclusivamente direção de arte** — o blueprint estético que orienta toda a produção futura.

*Fim — `GYMFLOW_ART_BIBLE_V1.md`.*
