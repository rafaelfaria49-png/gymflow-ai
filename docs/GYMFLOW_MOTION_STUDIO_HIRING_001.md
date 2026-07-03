# GYMFLOW MOTION STUDIO — PROCESSO DE CONTRATAÇÃO DE ARTISTA 3D (HIRING_001)

**Documento:** `docs/GYMFLOW_MOTION_STUDIO_HIRING_001.md`
**Fase:** início oficial da **produção artística** do GymFlow AI — seleção do artista/estúdio que produzirá os avatares oficiais.
**Natureza:** processo de contratação (RH técnico / direção de produção). **Nenhum código, asset ou alteração de projeto/POC/Motion Engine** faz parte deste documento.

> **Documentos de apoio que acompanham qualquer contratação:**
> `GYMFLOW_ART_BIBLE_V1.md` (a Bíblia de Arte — o que produzir, esteticamente) · `GYMFLOW_MOTION_STUDIO_E0_ASSET_PRODUCTION_PLAN.md` (plano de produção + briefing técnico) · `GYMFLOW_MOTION_ENGINE_SPEC_v01.md` (spec técnica: peso, bones, formato) · `GYMFLOW_ASSET_SELECTION_001.md` (decisão de pipeline e licença).
> **Este documento define COMO CONTRATAR. A Bíblia e a SPEC definem O QUE será produzido.**

---

## 1. Objetivo da contratação

Contratar um **artista 3D especializado em humanos realistas** (ou pequeno estúdio) para produzir os avatares oficiais, animações, e — em ondas futuras — equipamentos e cenário do GymFlow AI, dentro do pipeline já decidido.

### Competências exigidas
| Competência | Por quê |
|---|---|
| **Character Creator 4** | Base de modelagem humana do pipeline oficial |
| **Blender** | **Etapa obrigatória** — tradução de materiais CC4→glTF, limpeza de animação, biomecânica, export |
| **AccuRig** | Auto-rig humanoide do pipeline |
| **Animação humana** | Movimentos de exercício naturais e didáticos |
| **Rigging** | Esqueleto limpo, skinning correto, reutilizável M/F |
| **PBR** | Materiais fisicamente corretos (pele, tecido, metal) |
| **GLB / glTF 2.0** | Formato de runtime do produto |
| **Otimização para WebGL / tempo real** | Caber no orçamento de peso/FPS (web e mobile) |
| **React Three Fiber / Three.js** | **Diferencial** — entende o destino final do asset, antecipa problemas de runtime |

> **NÃO buscamos** modelagem estilizada/cartoon/anime/low-poly. **Buscamos realismo cinematográfico contido** (ver Bíblia §1–§2). Este é o filtro nº 1 de todo o processo.

---

## 2. Perfil ideal

O candidato deve **comprovar** (com trabalho real, não promessa) experiência em:
- **Personagens humanos realistas** (não estilizados).
- **Anatomia** correta (proporção, articulação, deformação).
- **Musculatura** crível e natural (atlético, **não** bodybuilder exagerado — ver Bíblia §3/§4).
- **Roupas** com tecido real (caimento, dobras, materiais técnicos).
- **Materiais PBR** (pele com SSS, metal escovado, borracha fosca).
- **Animações naturais** (ease in/out, peso, respiração, sem foot sliding).
- **Otimização para tempo real** (LOD, compressão, budget de polígonos/bones/textura).

### Sinais de senioridade real (o que separa bom de ótimo)
- Mostra **mãos e rosto** de perto sem medo (onde amadores escondem).
- Mostra **wireframe/topologia** limpa (prova domínio técnico, não só "comprou um asset").
- Mostra o **mesmo personagem em tempo real** (viewport/engine), não só render offline.
- Fala de **budget** (tris, texels, bones) com naturalidade.
- Entrega **fonte organizada**, não só o resultado final.

---

## 3. Portfólio obrigatório (checklist)

O candidato **deve** apresentar, no portfólio:
- [ ] **Personagens humanos** (realistas)
- [ ] **Corpo inteiro** (não só busto/retrato)
- [ ] **Animações** (vídeo/turntable, não só pose estática)
- [ ] **Rigging** (evidência de esqueleto/skinning, idealmente weight paint)
- [ ] **Mãos** (close — teste de qualidade)
- [ ] **Rosto** (close — sem uncanny valley grave)
- [ ] **Pele** (close — material realista, não plástico)
- [ ] **Roupas** (tecido real, caimento)
- [ ] **Personagens masculinos**
- [ ] **Personagens femininos**

### ❌ REPROVAR IMEDIATAMENTE se o portfólio:
- Só possui **cartoon**
- Só possui **anime**
- Só possui **low poly**
- Só possui **personagens de games mobile simples**
- **Não possui animações**
- (Sinal de alerta extra) Mostra só renders bonitos sem **nenhum** wireframe/tempo real/fonte — pode indicar assets comprados, não produzidos.

> **Regra:** o portfólio é o **primeiro portão**. Sem humano realista + animação + corpo inteiro, não passa para entrevista. Não há "vou aprender" nesta vaga.

---

## 4. Teste técnico (pago, antes da contratação definitiva)

> **Pequeno, justo e diagnóstico.** Mede exatamente o que o projeto precisa, sem pedir trabalho gratuito extenso. **O teste é remunerado** (boa prática profissional; protege qualidade e respeito mútuo).

### Escopo do teste — **mínimo**:
- **1 avatar masculino** (perfil Bíblia §3 — atlético natural).
- **1 animação**: **agachamento** (spec técnica em E0 §8 / Bíblia §8).
- **Exportação em GLB** otimizado.

### O que avaliar no teste
| Eixo | O que olhar |
|---|---|
| **Qualidade visual** | Parece humano premium? Pele/rosto/mãos/roupa OK? (Bíblia §12) |
| **Biomecânica** | Agachamento tecnicamente correto? (joelho, coluna, amplitude — E0 §8/§9) |
| **Otimização** | Peso, tris, bones, textura dentro do budget (SPEC §10 / E0 §7)? |
| **Organização dos arquivos** | Fontes nomeadas, estruturadas, limpas? |
| **Documentação** | Explicou pipeline, ferramentas, decisões, licenças? |

> **Por que masculino primeiro:** valida pipeline completo (modelagem → rig → anim → export) com um asset só. O feminino e o refino vêm **após** o teste aprovado. O agachamento é escolhido por ser o movimento mais **diagnóstico** de rig (estressa joelho/quadril/coluna — onde rigs ruins colapsam).

---

## 5. Critérios de avaliação (notas 0–10)

> Aplicar ao **teste técnico** e a cada **entrega**. Notas de 0 a 10 por critério, com **peso** (a soma ponderada dá a nota final). Pesos refletem o que mais importa para um app fitness premium em tempo real.

| # | Critério | Nota (0–10) | Peso | O que define 10 |
|---|---|:---:|:---:|---|
| 1 | **Realismo** | ☐ | ×3 | Indistinguível de humano premium; zero "cara de boneco" |
| 2 | **Anatomia** | ☐ | ×3 | Proporção/articulação/deformação impecáveis |
| 3 | **Rig** | ☐ | ×3 | Esqueleto limpo, skinning perfeito, reutilizável M/F |
| 4 | **Texturas** | ☐ | ×2 | PBR correto, 2K otimizado, densidade consistente |
| 5 | **Pele** | ☐ | ×3 | SSS realista, poros, viva — não plástica/cinza |
| 6 | **Mãos** | ☐ | ×3 | Topologia/proporção perfeitas; fecham/abrem sem colapso |
| 7 | **Rosto** | ☐ | ×2 | Simpático, simétrico, sem uncanny valley grave |
| 8 | **Roupa** | ☐ | ×2 | Tecido real, identidade GymFlow, sem clipping |
| 9 | **Movimento** | ☐ | ×3 | Natural, peso, loop, **biomecânica correta**, sem foot sliding |
| 10 | **Performance** | ☐ | ×3 | Dentro do budget (peso/tris/bones/FPS web+mobile) |
| 11 | **Organização** | ☐ | ×1 | Fontes limpas, nomeadas, estruturadas |
| 12 | **Comunicação** | ☐ | ×2 | Responde bem, entende briefing, proativo em dúvidas |
| 13 | **Prazo** | ☐ | ×2 | Cumpre o combinado, avisa cedo se houver risco |
| 14 | **Licença** | ☐ | ×3 | Transparência total de ferramentas/ativos; compatível com web embed |

**Nota final = Σ(nota × peso) / Σ(pesos)**.
**Critérios eliminatórios (nota < 6 = reprova independentemente da média):** Realismo, Rig, Mãos, Movimento, Performance, Licença. *(Um avatar lindo com licença duvidosa ou rig quebrado é inútil.)*

| Faixa final | Decisão |
|---|---|
| **≥ 8,5** | Contratar (excelente) |
| **7,0 – 8,4** | Contratar com observações / ciclo de ajuste |
| **6,0 – 6,9** | Zona de risco — só com forte sinal de evolução |
| **< 6,0** ou eliminatório | Reprovar |

---

## 6. Entregáveis (contrato de produção completo)

> Estes são os entregáveis da **produção definitiva** (pós-teste). O teste entrega só o subconjunto da §4.

| Entregável | Especificação |
|---|---|
| **Avatar masculino** | Oficial V1, perfil Bíblia §3 |
| **Avatar feminino** | Oficial V1, perfil Bíblia §4 |
| **Animação** | Agachamento V1 (depois, demais clips), limpa, biomecânica correta, reutilizável M/F |
| **Materiais** | PBR metallic-roughness, coerentes entre assets |
| **Texturas** | 2K otimizadas, **KTX2/Basis** quando possível |
| **Arquivos-fonte** | **Projeto CC4** + **`.blend`** + **`.fbx`** — necessários para posse real e etapas futuras (E1/E2) |
| **GLB** | Final otimizado (Draco/Meshopt + KTX2), dentro do budget (SPEC §10 / E0 §7) |
| **FBX** | Intermediário/fonte (rig + anim) |
| **Blender (.blend)** | Cena fonte organizada |
| **Licença** | Declaração de ferramentas/ativos de terceiros + comprovação de compatibilidade (ver §7) |

**Padrões de entrega:** Y-up, 1 unidade = 1 metro; nomenclatura conforme E0 §11 (`gymflow_male_v1.glb`, `gymflow_female_v1.glb`, `squat_v1.glb`); clips de animação separados.

---

## 7. Direitos autorais e licenciamento

> Cláusula obrigatória do contrato. Redigida para **proteger o produto** sem inviabilizar o uso legítimo das ferramentas do pipeline.

### 7.1 Cessão dos direitos necessários ao GymFlow AI
Todo o trabalho **autoral** produzido sob contrato (modelagem, rig, texturas, animação, cena) deve ser entregue com **cessão completa dos direitos de uso necessários ao GymFlow AI**, incluindo, sem limitação, o direito de **usar, modificar, reproduzir e distribuir** os assets, e de **embutir e servir os assets em aplicativos web e mobile** para usuários finais, em caráter **comercial e irrestrito**, em todo o mundo e por prazo indeterminado.

### 7.2 Transparência de ferramentas e ativos de terceiros
O artista **deve informar claramente** quais ferramentas e ativos de terceiros utilizou na produção (ex.: bases CC4/ActorCore, morphs, roupas, materiais, texturas, packs de animação, HDRIs, brushes), **para que a equipe GymFlow confirme a compatibilidade das licenças antes da incorporação ao produto**.

- A declaração deve listar: **o ativo, a origem, e a licença/EULA aplicável**.
- A equipe GymFlow valida, **antes da integração**, se cada licença permite o uso pretendido (especialmente **embutir/servir em web app** — o GLB entregue ao navegador é inerentemente extraível; ver `GYMFLOW_ASSET_SELECTION_001.md`).
- Ativos **sem licença comprovável** ou **incompatíveis** com web embed não serão incorporados — e isso é responsabilidade do artista corrigir.

### 7.3 Garantias do artista
O artista garante que o trabalho é original (ou devidamente licenciado), não infringe direitos de terceiros, e que tem autoridade para conceder os direitos acima. Pendência de licença = pendência de aprovação (critério eliminatório §5/§14).

> *Observação: cláusulas contratuais finais devem ser revisadas por profissional jurídico. Este documento define a **intenção e os requisitos**, não substitui o contrato assinado.*

---

## 8. Cronograma

> Faixas de referência para o **primeiro pacote** (teste → 2 avatares + agachamento). Ajustar à disponibilidade do artista escolhido.

| Fase | Conteúdo | Duração típica |
|---|---|---|
| **Teste** | 1 avatar M + agachamento + GLB (§4) | 5–10 dias |
| **Validação (teste)** | Avaliação §5 (arte + biomecânica + técnica) | 2–3 dias |
| **Correções (teste)** | 1 ciclo de ajuste, se necessário | 2–4 dias |
| **Produção** | Avatar M final + avatar F + animação + fontes | 2–4 semanas |
| **Correções (produção)** | Ciclos de ajuste sobre as entregas | 1–2 semanas |
| **Entrega** | Pacote completo §6 (GLB + FBX + .blend + licença) | — |
| **Aprovação** | GO/NO-GO final (§ Bíblia 15 / E0 §13) + carregar em `/poc-3d` | 2–5 dias |

**Total estimado do primeiro pacote:** ~**6–10 semanas** ponta a ponta (teste incluído), variando com senioridade e número de ciclos.

> **Regra de ciclos:** definir no contrato **quantos ciclos de revisão** estão inclusos (sugestão: 2 por entregável). Revisões além disso são escopo adicional — evita "loop infinito de ajustes".

---

## 9. Estimativa de orçamento

> Faixas de **ordem de grandeza** para o primeiro pacote (**2 avatares M+F + 1 animação de agachamento + fontes + GLB otimizado**), **excluindo** o teste técnico (que é pago à parte, normalmente uma fração do valor). Moeda: USD; converter ao câmbio/mercado. Não são cotações — servem para calibrar a decisão.

| Perfil | Faixa (pacote) | Prazo típico | Perfil de risco |
|---|---|---|---|
| **Freelancer júnior** | ~US$ 300 – 900 | 3–5 sem | Alto risco de qualidade/licença; pode reprovar §12 da Bíblia; exige muita supervisão |
| **Freelancer pleno** | ~US$ 900 – 2.500 | 2–4 sem | **Melhor custo/risco** para validar o pipeline; portfólio realista comprovado |
| **Freelancer sênior** | ~US$ 2.500 – 6.000 | 3–5 sem | Qualidade alta, autonomia; ótimo para os avatares **definitivos** de marca |
| **Pequeno estúdio** | ~US$ 6.000 – 15.000 | 4–8 sem | Capacidade de escala (E3/E4), processo, mas custo e overhead maiores |
| **Estúdio AAA** | US$ 15.000 – 40.000+ | 6–12+ sem | Qualidade máxima; overkill para o primeiro pacote/validação |

> Para incluir **teste técnico pago**, reservar tipicamente **10–25%** do valor do pacote do respectivo perfil.

---

## 10. Onde procurar (com prós e contras)

| Plataforma | Vantagens | Desvantagens |
|---|---|---|
| **ArtStation** | **Melhor vitrine de portfólio AAA** do mercado; filtrar por "realistic character"/"game character"; qualidade visível na hora | Não é marketplace de contratação direta (negociar fora); top talents caros/ocupados |
| **CGTrader** | Marketplace com artistas e assets; alguns aceitam custom | Foco em **venda de asset pronto** (cuidado com licença/web embed); custom é secundário |
| **Blender Artists (fórum)** | Comunidade Blender forte; bom para o lado técnico/pipeline | Mistura amadores e pros; curadoria manual necessária |
| **Polycount** | Comunidade técnica de **game art** (tempo real, topologia, budget) — exatamente nosso domínio | Menos ativo que antes; mais técnico que comercial |
| **Fiverr Pro** | Rápido, **"Pro" = curado**; bom para teste pago pequeno | Fora do "Pro" há muito asset genérico/risco de licença; qualidade variável |
| **Upwork** | Contratos estruturados, escrow, histórico/reviews, bom para freelancer pleno/sênior | Taxa de plataforma; triagem demanda esforço; muitos perfis genéricos |
| **LinkedIn** | Encontrar **profissionais/estúdios sérios**, validar histórico real, abordagem B2B | Mais lento; menos foco em portfólio visual; requer prospecção ativa |
| **Discords de Blender** | Acesso direto a comunidade ativa, indicações, talentos emergentes | Informal; sem garantias contratuais; curadoria 100% sua |
| **Comunidades Character Creator (Reallusion)** | **Especialistas no nosso pipeline exato** (CC4/AccuRig); fórum + Discord oficiais | Nicho menor; nem todos focam em tempo real/web |
| **Unreal / MetaHuman (comunidades)** | Artistas de altíssimo realismo humano | Foco em Unreal/offline; pode faltar experiência **web/GLB/R3F** |
| **Reddit** (r/blenderhelp, r/3Dmodeling, r/gameDevClassifieds, r/INAT) | Alcance amplo, posts de "hiring", custo zero para anunciar | Ruído alto; curadoria pesada; verificar portfólio com rigor |

> **Estratégia recomendada de busca:** prospectar **ativamente** no **ArtStation** (filtrar realistic real-time character) + **comunidades Character Creator/Reallusion** (domínio exato do pipeline), e **contratar via Upwork/contrato direto** (estrutura + escrow). LinkedIn para validar seriedade. Fiverr Pro como atalho para o **teste pago** rápido.

---

## 11. Processo de seleção (fluxo)

```
   Receber portfólio
          │   (filtro §3 — humano realista + animação + corpo inteiro?)
          ▼
       Analisar
          │   (checklist §3 + sinais de senioridade §2; reprova rápida)
          ▼
       Entrevista
          │   (fit, comunicação, entende pipeline CC4→Blender→GLB→R3F?, expectativa de prazo/preço)
          ▼
        Teste  (PAGO)
          │   (§4 — 1 avatar M + agachamento + GLB)
          ▼
      Validação
          │   (§5 — notas 0–10 ponderadas; eliminatórios; + biomecânica por Ed. Física)
          ▼
       Contrato
          │   (§6 entregáveis, §7 licença/direitos, §8 cronograma+ciclos, §9 valor)
          ▼
       Produção
          │   (2 avatares + animação + fontes; checkpoints intermediários)
          ▼
        Entrega
          │   (pacote completo §6; GLB dentro do budget; licenças declaradas)
          ▼
      Integração
              (carregar em /poc-3d → GO/NO-GO §Bíblia 15 / E0 §13)
```

> **Portões do fluxo:** Portfólio (rápido) → Teste (decisivo) → Validação (objetiva). Cada um filtra antes de gastar mais tempo/dinheiro. **Nunca pular o teste pago** — é o seguro mais barato contra contratar errado.

---

## 12. Conclusão — recomendação do Diretor Técnico

> Resposta direta às quatro perguntas, sem hedge.

### Qual perfil de artista você contrataria?
Um **freelancer 3D realista com experiência comprovada em personagem humano para tempo real (game/real-time character artist)**, idealmente com **fluência no pipeline CC4/AccuRig + Blender** e, como diferencial forte, noção de **GLB/WebGL/Three.js**. Prioridade absoluta: **humano realista + rig limpo + animação natural + licença transparente**. Cartoon/estilizado é desqualificação imediata.

### Freelancer ou estúdio?
**Freelancer (pleno→sênior) para começar.** Para o **primeiro pacote** (validar pipeline e produzir 2 avatares + 1 animação), um bom freelancer entrega com **menor custo, mais contato direto e mais agilidade** que um estúdio. **Estúdio** entra depois, em **E3/E4** (escalar a biblioteca de 10→50→100 animações), quando capacidade e processo importam mais que custo. AAA full agora é overkill para uma validação.

### Brasil ou exterior?
**Indiferente quanto à bandeira — decisivo é o portfólio.** Na prática: **Brasil** oferece ótimo custo-benefício, fuso e idioma alinhados (comunicação mais fácil = menos retrabalho), e há talento realista forte. **Exterior** amplia o pool de especialistas no nicho exato (CC4/real-time character). Recomendação: **abrir busca global, mas dar preferência a um brasileiro pleno/sênior qualificado** pela vantagem de comunicação/custo — sem nunca sacrificar qualidade por proximidade.

### Orçamento ideal para os 2 avatares oficiais + a primeira animação?
**Faixa-alvo: ~US$ 1.500 – 3.500** (freelancer pleno→sênior), **+ ~US$ 200–500 de teste técnico pago**. Abaixo de ~US$ 900 o risco de qualidade/licença sobe muito; acima de ~US$ 6.000 já é território de sênior top/estúdio, justificável só para os avatares **definitivos de marca** (E1) ou escala. **Para a etapa atual (validar o pipeline com qualidade premium), ~US$ 2.000–3.000 + teste é o ponto ideal de custo × risco × qualidade.**

> **Resumo executivo:** *freelancer realista pleno/sênior, busca global com preferência a brasileiro qualificado, teste técnico pago obrigatório, contrato com cessão de direitos + transparência de licenças, orçamento-alvo ~US$ 2–3,5k + teste para o primeiro pacote. Estúdio fica para a fase de escala.*

---

> **Lembrete de escopo:** nenhuma linha de código foi escrita, nenhum arquivo do projeto/POC/Motion Engine foi alterado, nada foi instalado. Este documento é **exclusivamente o processo de contratação** — o blueprint de RH técnico que inicia a fase de produção artística.

*Fim — `GYMFLOW_MOTION_STUDIO_HIRING_001.md`.*
