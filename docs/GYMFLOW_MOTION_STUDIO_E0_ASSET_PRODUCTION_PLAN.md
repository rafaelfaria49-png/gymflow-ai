# GYMFLOW MOTION STUDIO — E0 · Plano de Produção de Assets

**Documento:** `docs/GYMFLOW_MOTION_STUDIO_E0_ASSET_PRODUCTION_PLAN.md`
**Etapa:** E0 (SPIKE EXECUTADO) do `ROADMAP_SPIKE_TO_PRODUCTION.md` — o **portão visual GO/NO-GO** de toda a Motion Engine.
**Status:** plano operacional. **Nenhum código, asset, compra, download ou instalação** é parte deste documento. Skeleton **não** será congelado nesta etapa (isso é E2 / `SKELETON_001`).
**Decisão técnica herdada (não reaberta aqui):** Character Creator 4 + AccuRig + Blender (`cc_blender_tools`) + glTF-transform → **GLB** → React Three Fiber / Three.js. Avatar de **posse própria**. (Ver `GYMFLOW_ASSET_SELECTION_001.md` e `GYMFLOW_MOTION_ENGINE_SPIKE_001.md`.)

> **O que este documento É:** a transformação da decisão técnica em uma ordem de produção real — o que produzir, com quais ferramentas, em qual ordem, com quais números, e como decidir se passou ou não.
> **O que este documento NÃO É:** autorização de execução, criação de asset, ou alteração da POC. É o blueprint que precede a primeira ordem de compra/produção.

---

## 0. Como ler este documento

Há **três leitores distintos** e o plano serve aos três:

| Leitor | Vai direto para |
|---|---|
| **Você (CTO/PO)** | §1, §13 (GO/NO-GO), §14 (custos), §15 (próxima etapa) |
| **Artista 3D / freelancer** | §10 (briefing pronto p/ enviar), §4, §5, §7, §11 |
| **Personal trainer / Ed. Física** | §8 (agachamento técnico) e §9 (checklist de validação) |

Cada seção é **autossuficiente** para o seu leitor — pode ser copiada e enviada isolada.

---

## 1. Objetivo da etapa E0

E0 existe para responder, **com pixels reais no navegador**, quatro perguntas que nenhum documento teórico consegue fechar:

1. **Qualidade visual** — um avatar autorado neste pipeline parece **humano premium** numa tela de celular e de desktop, ou denuncia origem barata?
2. **Performance** — o GLB resultante roda dentro do orçamento (desktop ≥60 fps, mobile ≥30 fps) sem estourar peso/carregamento?
3. **Pipeline** — o caminho CC4→Blender→glTF-transform→GLB→R3F funciona ponta a ponta **sem retrabalho infinito**, com etapas reprodutíveis e documentáveis?
4. **Premium no navegador** — pele, rosto, mãos, roupa e iluminação **sobrevivem** ao motor de tempo real do R3F (não só ao render bonito do CC4)?

**E0 não busca o avatar final de marca.** Busca **prova de viabilidade**. Um "bom o suficiente para dizer SIM, esse caminho entrega" — o refino de marca é E1.

**Critério de sucesso da etapa (não do asset):** ao fim de E0 temos um veredito **defensável com dados** (FPS medido, MB medidos, 2 avaliadores) — não uma opinião.

---

## 2. Perfil visual dos avatares (briefing de arte)

### 2.1 Avatar masculino oficial V1
- Corpo **atlético natural** — praticante consistente, **não** fisiculturista, **não** "super-herói". Definição visível, proporção realista.
- **Realista**, não estilizado.
- Roupa fitness **com identidade GymFlow**: regata ou camiseta dry-fit + bermuda/short de treino. Paleta alinhada à marca (escuro grafite/preto com detalhe **cyber-lime `#a3e635`** — o accent do app). Sem logos de terceiros.
- **Tênis** de treino (não pés descalços, não sapato social).
- **Mãos e rosto bem acabados** — mãos com topologia/peso de pele corretos (dedos não colapsam ao fechar/abrir), rosto neutro e simpático (sem uncanny valley agressivo).
- Cabelo curto/médio adequado a treino.
- **Visual premium**: leitura de "app fitness internacional caro", não "boneco de loja".

### 2.2 Avatar feminino oficial V1
- Corpo **fitness natural** — atlética, saudável, proporção realista. **Sem** exagero (nem hiper-musculoso, nem fashion-model irreal).
- **Realista**.
- Roupa fitness **com identidade GymFlow**: top + legging de treino (mesma paleta da marca). Sem logos de terceiros.
- **Cabelo adequado para treino** — preso (rabo de cavalo / coque) para não atravessar o corpo na animação de agachamento (evita penetração de malha barata).
- Tênis de treino.
- **Mãos e rosto bem acabados** (mesmos critérios do masculino).
- **Visual premium**.

### 2.3 Coesão M × F
Os dois devem parecer **da mesma marca/mundo**: mesma linguagem de roupa, mesma qualidade de pele/shader, mesma escala/altura plausível, mesmo padrão de acabamento. Um premium e outro barato = reprova o pacote.

---

## 3. Regras absolutas (não negociáveis)

### ❌ PROIBIDO entregar
- **Skeleton** visível como produto (ossos/joints como visual final).
- **Wireframe** como visual final.
- **Boneco palito** / stick-figure.
- **Avatar cartoon** / estilizado / toon-shaded.
- **Low poly** evidente (silhueta facetada, mãos em "luva").
- **Personagem genérico barato** ("free rigged character" reconhecível).
- **Aparência de videogame antigo** (PS2/PS3-era).
- **Roupa aleatória sem identidade** (avatar nu, roupa de outra marca, roupa fora do tema fitness).
- **Asset sem licença clara** (origem/EULA não comprovados por escrito).

### ✅ PERMITIDO / EXIGIDO
- **Humano 3D realista**.
- Asset **próprio / customizado** (não um free-pack genérico servido cru).
- **GLB otimizado** (Draco/Meshopt + KTX2 quando viável).
- **Placeholder honesto** apenas **enquanto** o asset real não existe (a POC já faz isso — banner "Adicione um arquivo .glb"; ver `GymFlowAvatarStage.tsx`). Nunca chamar o palco vazio de "3D realista".

> **Regra de honestidade de UI (herdada do SPEC):** enquanto faltar o asset, mostra-se placeholder honesto. Jamais um esqueleto/wireframe/palito vendido como "avatar".

---

## 4. Ferramentas recomendadas (fluxo)

| Etapa | Ferramenta | Função | Custo / licença |
|---|---|---|---|
| Modelagem base humana | **Character Creator 4** (Reallusion) | Gerar humano realista M/F, morfologia, pele PBR, roupa | Licença CC4 (perpétua, royalty-free; **embed em web app** previsto — confirmar por escrito, §10.5) |
| Auto-rig | **AccuRig** (Reallusion) | Esqueleto humanoide limpo, compatível Mixamo-like | **Grátis** (requer conta ActorCore grátis) |
| Animação-seed | **ActorCore / Mixamo** | Base de movimento p/ retarget (ponto de partida, não final) | ActorCore (alguns grátis); Mixamo grátis |
| Edição/limpeza/biomecânica | **Blender** + **cc_blender_tools** (addon Reallusion) | **Etapa obrigatória** — traduz materiais CC4→glTF, limpa anim, corrige biomecânica, exporta glTF | **Grátis** (GPL) |
| Export runtime | **glTF export (Blender)** | Gerar glTF/GLB com PBR correto | Grátis |
| Otimização | **glTF-transform (CLI)** | **Draco/Meshopt** (geometria) + **KTX2/Basis** (textura) + prune/dedup/weld | **Grátis** |
| Runtime | **React Three Fiber + Three.js + drei** | Carregar/animar/exibir no `/poc-3d` | Já no projeto (`three 0.184`, R3F `9.6.1`, drei `10.7.7`) |

### 4.1 Por que Blender é OBRIGATÓRIO (gargalo conhecido)
**CC4 não exporta glTF/GLB nativamente.** O caminho real é **CC4 → FBX → Blender (cc_blender_tools) → glTF**. Blender é onde o PBR do CC4 é **traduzido** para o material glTF (metallic-roughness) — pular essa etapa = material errado/quebrado no navegador.

⚠️ **Gotcha registrado:** em versões recentes do addon, **shape keys (blendshapes) podem quebrar o export glTF**. Para E0 **não precisamos de blendshape facial** → **desativar/remover shape keys antes do export** elimina o risco. (Decisão já tomada no SPIKE_001.)

---

## 5. Pipeline passo a passo

> Sequência reprodutível. Cada passo tem uma saída verificável. Numerada para o artista seguir literalmente.

**A — Avatar base (CC4)**
1. **Criar avatar base** M e F a partir do humano CC4 (CC_Base ou Headshot, conforme acabamento facial desejado).
2. **Ajustar corpo** — morfologia atlética natural (§2). Validar proporção e altura plausível.
3. **Ajustar rosto** — neutro/simpático, sem uncanny valley; acabamento de mãos verificado.
4. **Criar/vestir roupa GymFlow** — roupa fitness com paleta da marca (§2). Garantir que a roupa **acompanha o rig** (sem clipping no agachamento).

**B — Rig (AccuRig / CC4)**
5. **Rigar** — esqueleto humanoide limpo (AccuRig ou rig CC4), **mesma estrutura para M e F** (pré-requisito para reuso de animação; o congelamento formal é E2).
6. **Testar pose** — pose de agachamento manual: verificar deformação de joelho, quadril, coluna, ombro. Aqui se descobre rig ruim **antes** de animar.

**C — Animação (ActorCore/Mixamo → Blender)**
7. **Criar/importar animação de agachamento** — seed de ActorCore/Mixamo retargetada ao rig, **ou** keyframe manual.
8. **Limpar animação** — remover jitter, foot sliding, frames mortos; garantir loop suave (início = fim).
9. **Ajustar biomecânica** — corrigir conforme §8 (amplitude, joelho, coluna). **Esta é a etapa que define se o app ensina certo.**

**D — Export & Blender (materiais)**
10. **Exportar FBX** do CC4 (avatar + rig + roupa).
11. **Importar no Blender** via `cc_blender_tools`.
12. **Corrigir materiais** — confirmar tradução PBR→glTF (albedo/metallic/roughness/normal); remover shape keys (§4.1); aplicar transforms; checar escala (1 unidade = 1 m) e eixo (Y-up).
13. **Exportar GLB** (Blender glTF exporter) — **um GLB de avatar** (M e F separados) e **um GLB de animação** (clip de agachamento), preferindo **clips separados** para reuso.

**E — Otimização (glTF-transform)**
14. **Otimizar GLB** — `gltf-transform`: prune, dedup, weld, **Draco ou Meshopt** (geometria), **KTX2/Basis** (texturas 2K), gerar/limpar. Medir peso antes/depois.

**F — Teste**
15. **Testar no navegador** — carregar no `/poc-3d` (em E0 executado), medir FPS/peso/carregamento, rodar checklist §6 e §9.

> **Cenário de academia (item 4 do pacote):** modelado/montado em Blender (ou pack licenciado simples com EULA clara), **baixa contagem de tris**, exportado como GLB próprio (`gym_stage_v1.glb`). É **cenário**, não personagem — deve ser leve e não competir com o avatar por orçamento de performance.

---

## 6. Critérios de qualidade visual (checklist)

Marcar **SIM/NÃO** por avatar (M e F) e pela animação. Qualquer "NÃO" em item crítico → discussão de NO-GO.

| # | Pergunta | M | F | Crítico? |
|---|---|---|---|---|
| 1 | Parece **humano real**? | ☐ | ☐ | ✅ |
| 2 | Parece **premium**? | ☐ | ☐ | ✅ |
| 3 | **NÃO** parece esqueleto? | ☐ | ☐ | ✅ |
| 4 | **NÃO** parece cartoon/low-poly? | ☐ | ☐ | ✅ |
| 5 | **Pele** está boa (shader, sem plástico)? | ☐ | ☐ | ✅ |
| 6 | **Roupa** está boa e com identidade GymFlow? | ☐ | ☐ | ☐ |
| 7 | **Mãos** estão boas (sem colapso/luva)? | ☐ | ☐ | ✅ |
| 8 | **Rosto** está aceitável (sem uncanny grave)? | ☐ | ☐ | ☐ |
| 9 | **Movimento** está natural (sem robótico/jitter)? | — | — | ✅ |
| 10 | **Agachamento** tecnicamente correto (§8)? | — | — | ✅ |
| 11 | **Iluminação** valoriza o avatar (cena §, não chapado)? | ☐ | ☐ | ☐ |
| 12 | **Mobile** está aceitável (mesma leitura no celular)? | ☐ | ☐ | ✅ |

**Regra:** 2 avaliadores independentes preenchem. Divergência em item crítico → revisar antes de decidir.

---

## 7. Critérios técnicos (metas mensuráveis)

| Métrica | Ideal | Teto (aceitável) | Reprova se |
|---|---|---|---|
| **Peso GLB avatar** (cada) | ≤ 6 MB | ≤ 8 MB | > 8 MB |
| **Triângulos** (avatar) | ≤ 40k | ≤ 60k | > 60k |
| **Bones** | ~65 | ≤ 70 | > 70 (limite de uniforms em GPU mobile) |
| **Textura** | 2K otimizada, **KTX2** | 2K sem KTX2 | 4K cru / sem otimização |
| **Compressão geometria** | Draco **ou** Meshopt | — | nenhuma |
| **Peso clip animação** | ≤ 300 KB | ≤ 600 KB | > 600 KB |
| **FPS desktop** | 60 | ≥ 60 | < 60 estável |
| **FPS mobile** (device mediano) | 60 | ≥ 30 | < 30 |
| **Cenário** (`gym_stage_v1.glb`) | leve, baixo tris | — | competir por orçamento c/ avatar |
| **Carregamento / time-to-first-render** | rápido (alvo do SPIKE) | dentro do alvo do SPIKE §3 | acima do alvo |

> Números herdados do SPEC §10 e do SPIKE §3. **Mobile é o gargalo** — toda medição vale no device mediano, não no desktop.

---

## 8. Agachamento oficial V1 (especificação técnica)

> Esta seção é a "fonte da verdade" do movimento. O artista anima **para isto**; o personal valida **contra isto** (§9).

| Fase | Especificação |
|---|---|
| **Posição inicial** | Em pé, ereto, peito aberto, olhar à frente, core ativado. |
| **Pés** | Largura ~ombros (leve abertura aceitável), apoio total, calcanhares **não** sobem. |
| **Joelhos** | Alinhados à ponta dos pés; acompanham a abertura; **sem valgo** (joelho caindo para dentro). |
| **Quadril** | Inicia o movimento (quadril vai para trás, "sentar em cadeira invisível"); desce e sobe pelo quadril. |
| **Coluna** | **Neutra** o tempo todo — sem arredondar lombar (flexão), sem hiperextensão. Tronco inclina à frente de forma natural, não desaba. |
| **Amplitude** | Coxa ~paralela ao chão (ou levemente abaixo, se mobilidade permitir). **Sem** quarter-squat ridículo; **sem** profundidade que force a lombar. |
| **Respiração** | Inspira/segura na descida (estabiliza core), expira na subida. |
| **Descida (excêntrico)** | Controlada, mais lenta, ~2–3 s; quadril e joelho flexionam juntos. |
| **Subida (concêntrico)** | Empurra o chão pelos calcanhares, estende quadril e joelho **juntos** (sem "good morning": quadril subindo antes do tronco). |

### ❌ Erros que NÃO podem aparecer na animação V1
- Joelho em **valgo** (caindo para dentro).
- **Lombar arredondada** ("butt wink" exagerado) ou hiperestendida.
- **Calcanhar subindo** / peso na ponta do pé.
- **Foot sliding** (pé deslizando no chão) — artefato técnico, não biomecânico.
- Subida com **quadril disparando antes do tronco** (transformar em "bom dia").
- Movimento **robótico**, sem peso, sem aceleração/desaceleração natural.
- Profundidade impossível / penetração de malha (coxa atravessa panturrilha).

### Pontos que o personal DEVE validar (resumo)
Postura neutra · joelho alinhado · quadril iniciando · amplitude segura · ritmo excêntrico/concêntrico · sem erros acima.

---

## 9. Checklist para o personal trainer / Ed. Física validar

> Entregar ao profissional **junto com o clip rodando no `/poc-3d`** (em E0 executado). Preenchimento SIM/NÃO + observação.

| # | Item | Avaliação | Obs. |
|---|---|---|---|
| 1 | **Postura** — tronco e core corretos do início ao fim | ☐ SIM ☐ NÃO | |
| 2 | **Joelho** — alinhado à ponta do pé, sem valgo | ☐ SIM ☐ NÃO | |
| 3 | **Coluna** — neutra, sem arredondar/hiperestender | ☐ SIM ☐ NÃO | |
| 4 | **Amplitude** — adequada (≈paralelo), segura | ☐ SIM ☐ NÃO | |
| 5 | **Segurança** — nada que ensine padrão lesivo | ☐ SIM ☐ NÃO | |
| 6 | **Ritmo** — excêntrico controlado, concêntrico firme | ☐ SIM ☐ NÃO | |
| 7 | **Controle** — sem solavanco, sem queda livre | ☐ SIM ☐ NÃO | |
| 8 | **O exercício está correto** como referência didática? | ☐ SIM ☐ NÃO | |

**Veredito do personal:** ☐ Aprovado · ☐ Aprovado com ajustes · ☐ Reprovado
**Assinatura/registro (CREF):** ____________________

> **Por que isto importa:** o GymFlow ensina técnica. Um agachamento errado animado de forma bonita é **pior** que nenhum — vira referência de movimento lesivo. Validação profissional é **portão**, não enfeite.

---

## 10. Briefing pronto para artista 3D / freelancer

> **Copiar e colar** ao contratar. Já contém escopo, formato, qualidade e licença.

### 10.1 O que entregar
1. **Avatar masculino** GymFlow V1 (perfil §2.1) — modelo + rig + roupa, texturizado PBR.
2. **Avatar feminino** GymFlow V1 (perfil §2.2) — idem.
3. **1 animação de agachamento** (spec §8) — clip limpo, loop suave, biomecânica correta.
4. **1 cenário simples de academia** premium e leve (piso + ambiente mínimo).
5. **GLBs finais otimizados** (§11).

### 10.2 Formato dos arquivos
- Entrega final em **GLB** (glTF 2.0 binário), **Y-up, 1 unidade = 1 metro**.
- Material **PBR metallic-roughness** (padrão glTF).
- Texturas **2K**, em **KTX2/Basis** quando possível; **Draco ou Meshopt** na geometria.
- **Arquivos-fonte** entregues junto (CC4 project + .blend + FBX) — necessários para E1/E2 e para **posse real** do asset.
- Animação como **clip separado** (reutilizável entre M e F).

### 10.3 Qualidade esperada
- **Humano realista premium** (§3). Reprovado: cartoon, low-poly, genérico, videogame antigo.
- Pele, mãos, rosto e roupa **bem acabados** (§6).
- Dentro dos **limites técnicos** §7 (peso, tris, bones, FPS).

### 10.4 Roupa / identidade
- Roupa **fitness GymFlow**: paleta escura grafite/preto + accent **cyber-lime `#a3e635`**. Sem marcas de terceiros. Tênis de treino. Cabelo feminino preso.

### 10.5 Licença (cláusula obrigatória no contrato)
- **Transferência total de direitos / work-for-hire**: o GymFlow recebe **posse e direito de uso comercial irrestrito**, incluindo **embutir e servir os assets em aplicativo web/mobile** para usuários finais.
- Se o artista usar **CC4/ActorCore**, confirmar que a licença Reallusion cobre **"avatares embutidos servidos em web app"** — **obter confirmação escrita da Reallusion** (ação jurídica paralela herdada do roadmap; o GLB servido ao navegador é inerentemente extraível).
- **Proibido** entregar asset com origem/EULA não comprovada (free-packs sem licença, mesh de marketplace com cláusula anti-extração). **Origem documentada por escrito.**

### 10.6 Avatares, animação e cenário — resumo de entrega
- **Masculino:** §2.1 + §10.2/§10.3
- **Feminino:** §2.2 + §10.2/§10.3
- **Animação:** §8 (validada por personal, §9)
- **Cenário:** academia simples, leve, GLB próprio
- **GLB final:** §11 (nomes e pastas exatos)

---

## 11. Estrutura de arquivos esperada

```
public/
└─ assets/
   ├─ avatars/
   │  ├─ gymflow_male_v1.glb        ← avatar masculino oficial V1
   │  └─ gymflow_female_v1.glb      ← avatar feminino oficial V1
   ├─ animations/
   │  └─ squat_v1.glb               ← clip de agachamento V1 (reutilizável M/F)
   └─ environments/
      └─ gym_stage_v1.glb           ← cenário de academia premium simples
```

> ⚠️ **Nota de reconciliação (NÃO alterar agora — é E0-executado/E1):** a `avatar-config.ts` atual aponta para `/assets/avatars/male.glb`, `female.glb`, `neutral.glb` e a animação `squat` com `available:false`. Os nomes deste pacote (`gymflow_male_v1.glb` etc.) são **versionados** e mais explícitos. Na **execução** de E0, escolher um dos dois caminhos: (a) salvar os GLB com os nomes que a config já espera, **ou** (b) atualizar os `modelPath`/`path` da config para os nomes versionados. **Recomendado (b)** — versionamento explícito facilita V2/V3. Decisão tomada no momento da execução; aqui só fica registrada.

---

## 12. Teste futuro na POC (`/poc-3d`)

> Procedimento de validação **quando E0 for executado** (não agora).

1. Colocar os GLB nas pastas §11.
2. Em `avatar-config.ts`: marcar `available: true` para M, F e o clip de agachamento; ajustar `modelPath`/`path` se usar nomes versionados (§11). **Nenhuma outra mudança de código.**
3. Abrir **`/poc-3d`** (porta **3001** — porta 3000 é de outro projeto, **não mexer**).
4. **Testar masculino** — carregar, orbitar, checar §6.
5. **Testar feminino** — idem.
6. **Testar agachamento** — play, loop, velocidades; checar §8/§9.
7. **Medir FPS** (desktop e mobile) — confrontar §7.
8. **Medir carregamento / time-to-first-render** — confrontar §7.
9. **Avaliar qualidade visual** — 2 avaliadores preenchem §6; personal preenche §9.

> Em E0-executado, prepara-se também o **harness de medição** (FPS/peso/TTFR) no `/poc-3d` — instrumentação, sem tocar no app de produto.

---

## 13. Critério GO / NO-GO

> Decisão tomada **com os dados de §6, §7, §9** — não por impressão.

### ✅ GO (seguir para E1/SKELETON_001) — exige TODOS:
- **Parece premium** (§6: itens críticos 1–5, 7, 12 = SIM nos 2 avatares, 2 avaliadores).
- **Roda bem** (§7: desktop ≥60 fps, mobile ≥30 fps, GLB ≤8 MB).
- **Licença clara** (§10.5: posse comprovada + confirmação Reallusion se CC4).
- **Mobile aceitável** (leitura visual e performance no device mediano).
- **Agachamento correto** (§9: personal Aprovado ou Aprovado-com-ajustes-menores).

### ❌ NO-GO (parar e reavaliar) — qualquer um:
- **Parece boneco barato** / genérico / cartoon / low-poly.
- **Ficou pesado** (> 8 MB, ou FPS abaixo do mínimo).
- **Licença duvidosa** (origem/EULA não comprovada, ou Reallusion não confirma web embed).
- **Movimento errado** (personal reprova a biomecânica).
- **Performance ruim** em mobile.

### Se NO-GO → ramificações (§15 / SPIKE)
1 ciclo de ajuste (material/luz/otimização/rebake) **OU** plano B: vídeo real validado por personal · pack licenciado com EULA web · pipeline alternativo (Avaturn / MetaPerson / custom no Blender). **O NO-GO só some com nova execução aprovada.**

---

## 14. Custos estimados (cenários)

> Faixas de ordem de grandeza para **o pacote E0** (2 avatares + 1 animação + 1 cenário + GLBs otimizados). Não são cotações; servem para escolher o caminho. Moeda de referência: USD; converter conforme câmbio/mercado local.

| Cenário | Quem faz | Faixa estimada (pacote E0) | Prazo típico | Risco / observação |
|---|---|---|---|---|
| **Fazendo sozinho** | Você + CC4/AccuRig/Blender (grátis exceto licença CC4) | **Custo de software** (licença CC4) + seu tempo | 2–4 semanas (curva de aprendizado) | Maior controle e posse; depende da sua habilidade 3D; risco de "cara de CC4 genérico" sem refino |
| **Freelancer barato** | Marketplace de baixo custo | ~**US$ 150–500** | 1–2 semanas | Risco alto de qualidade/licença; exigir §10 por escrito; pode reprovar §6 |
| **Freelancer intermediário** | 3D artist com portfólio realista | ~**US$ 500–2.000** | 2–4 semanas | Melhor relação custo/risco para E0; exigir fontes + posse |
| **Artista premium** | Character artist sênior | ~**US$ 2.000–6.000+** | 3–6 semanas | Qualidade alta; talvez overkill para um **spike** (E0 é prova, não produto final) |
| **Estúdio** | Estúdio de 3D/avatar | **US$ 6.000–15.000+** | 4–8+ semanas | Para escala (E3/E4), não para o spike E0 |

> **Recomendação de CTO para E0:** **freelancer intermediário** (melhor custo/risco para provar o pipeline) **ou** "fazendo sozinho" se houver competência interna em CC4/Blender. Premium/estúdio ficam para E1+ (avatar definitivo) e E3/E4 (biblioteca), quando a aposta já está validada. **Não gastar caro antes do GO de E0.**

---

## 15. Próxima etapa após E0

### Se **GO**
1. **`SKELETON_001`** (E2) — congelar o skeleton **derivado do rig validado** (lista fechada de bones, bind pose, naming, validador de conformidade). Só agora, porque existe um rig provado.
2. **`ANIMATION_001`** — formalizar o padrão de produção de animação (a partir do agachamento aprovado) → caminho para as 10 oficiais (`MOTION_LIB_010`, E3).
3. **`PLAYER_INTEGRATION_001`** — preparar a integração drop-in (`GymFlowAvatarStage`/`MotionPlayerProps`) atrás de flag (E5), sem tocar no `GymFlowContext`.

### Se **NO-GO**
1. **Testar vídeo real com personal** — fallback de conteúdo (vídeo validado) enquanto o 3D não fecha.
2. **Testar pack licenciado** — avatar/animação de pack com EULA que permita web embed.
3. **Testar outro pipeline** — Avaturn / MetaPerson (loader three.js oficial) / custom 100% Blender. Reexecutar E0 com o novo caminho.

---

## Resultado esperado deste documento

Um **plano operacional completo** que converte a decisão técnica (CC4+AccuRig+Blender+GLB+R3F) em **produção real de assets**:
- **briefing pronto** para enviar a um artista 3D (§10),
- **checklist de validação** para o personal trainer (§9),
- **critérios de qualidade visual e técnicos** mensuráveis (§6, §7),
- **estrutura de arquivos e procedimento de teste** prontos para o `/poc-3d` (§11, §12),
- **critério GO/NO-GO objetivo** (§13) e **custos** (§14).

> **Nada foi implementado, alterado, comprado ou baixado.** Este documento é o blueprint que **precede** a primeira ordem de produção. A execução de E0 (criar/contratar os assets reais) **aguarda sua autorização** — e, mesmo autorizada, depende de trabalho de artista 3D no CC4/Blender (fora do que se resolve só com código).

*Fim — `GYMFLOW_MOTION_STUDIO_E0_ASSET_PRODUCTION_PLAN.md`.*
