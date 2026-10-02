# GOAL-124 — Reconciliação do catálogo operacional de mídia

Base confirmada por fetch: `747e85c7d79ec7acb1df3121e88e881292f52d02`. Working tree rastreada limpa no pre-flight. Branch dedicada: `codex/goal-124-media-runtime-reconciliation`. `.claude/settings.local.json` local permanece fora do commit; hash SHA-256 inicial: `2AB7AAB3F5449D14C6C241D982EAE91440930F7120D5367F72FE55B830970DD0`.

## Escopo operacional e consumidores

MEDIA_CATALOG_SCOPE=RUNTIME_CATALOG. São 126 de BASE_CATALOG_126 + 29 de LOTE_6_EXPANSION + 29 de LOTE_7_EXPANSION = 184 IDs selecionáveis. Os 58 adicionais são exercícios curados, com instruções, equipamento e substituições reais; não há marcador experimental nem filtro de exclusão de lote. Todos têm images vazio e nenhum asset em disco. Nenhum exercício foi movido ou removido.

| Consumidor auditado | Contrato |
|---|---|
| src/mock/data.ts | Reexporta MOCK_EXERCISES |
| src/providers/GymFlowContext.tsx | Inicializa exercises com MOCK_EXERCISES e usa a lista em planos demo/iniciais; sem filtro de lote |
| src/modules/ExerciseLibrary.tsx | Recebe exercises do contexto; filtro Todos inclui o catálogo inteiro |
| src/components/ExerciseCatalogPicker.tsx | Filtra a lista recebida por grupo/busca e pagina 30 por vez; paginação não exclui os demais |
| src/components/workout-builder/ExercisePickerModal.tsx | Usa a mesma lista do construtor, com aba Todos e organização por foco |
| src/lib/workout-picker.ts / exerciseSearch.ts | Filtros por grupo e tokens; identidade permanece o ID exato |
| scripts/media/exercise-media-inventory.mjs | Inventaria RUNTIME_CATALOG, valida composição e preservação do baseline |
| scripts/media/generate-exercise-media-contact-sheets.mjs | Fonte futura atualizada para RUNTIME_CATALOG; nenhuma nova contact sheet gerada neste GOAL |

MOCK_EXERCISES e RUNTIME_CATALOG são a mesma lista em memória. BASE_CATALOG_126 continua exportado, com os mesmos 126 IDs e ordem. O snapshot `scripts/media/goal-123-baseline.json` preserva as métricas originais e a entrada dos 11 achados; o inventário V2 registra também métricas atuais dos 126 e de todo o runtime.

IDs duplicados=0; inválidos=0; lotes sobrepostos=0; ID runtime sem inventário=0. Nome duplicado normalizado: biceps_rosca_direta / biceps_rosca_w. Candidato semântico adicional: legs_leg_press / legs_legpress_45, com o termo de busca ambíguo "leg press 45". Ambos os pares já pertencem ao baseline, permanecem selecionáveis e são classificados HUMAN_REVIEW_REQUIRED / preservar IDs sem remapear mídia. Termos amplos compartilhados, como "pulldown" e "pulley", são MULTI_MATCH_SEARCH_HINT; searchTerms não é um alias de identidade ou mídia. Nenhum dos 58 novos tem nome normalizado ou candidato semântico duplicado.

## Os 11 achados, individualmente

| Achado original | Origem / diagnóstico | Resolução e evidência preservada |
|---|---|---|
| Path back_puxada_atras/1.jpg ausente | Thumbnail de registro histórico retired do GOAL-34 | Entrada inteira em historicalAssets; path ausente continua documentado e não é servido |
| Path chest_supino_declinado/1.jpg ausente | Draft placeholder genérico, sem equipamento comprovado | Entrada inteira em historicalAssets, sem inventar thumbnail substituta |
| Path legs_hack_squat/1.jpg ausente | Draft placeholder sem variante/modelo comprovado | Entrada inteira em historicalAssets, sem inventar thumbnail substituta |
| Path chest_supino_reto/2.jpg ausente | Contrato antigo de dois frames do GOAL-34; só existem 0.jpg, 1.jpg e sequence/step-01..05.jpg | Desativada a lista antiga de frames do manifest; os dois metadados originais ficam no snapshot. Player usa os cinco frames próprios, com indicação provisória. Nenhum 2.jpg foi criado |
| Manifest back_puxada_atras sem exercício | Puxada atrás da nuca não consta do runtime; puxada pela frente não é equivalente | HISTORICAL_RETIRED; sem consumidor runtime, equivalente exato ou remapeamento; status/proveniência intactos |
| Manifest chest_supino_declinado sem exercício | Pode lembrar supino declinado com barra ou articulado; ID genérico e draft não provam equivalência | ABANDONED_DRAFT_UNSPECIFIED_EQUIPMENT; sem consumidor runtime, arquivado sem remapear |
| Manifest legs_hack_squat sem exercício | Existem hack convencional, invertido e sentado; draft não identifica qual | ABANDONED_DRAFT_UNSPECIFIED_VARIANT; sem consumidor runtime, arquivado sem remapear |
| extra_vid_technique_2 → elevação pélvica | Mapa introduzido no GOAL-13, commit b1d381c; gerador educacional atual produz extra_vid_machines_2 no índice 2 | Removido de ambas as direções; nenhuma substituição por aula genérica |
| extra_vid_technique_6 → elevação pélvica | Mesmo mapa; no índice 6 o gerador produz extra_vid_posture_6 | Removido do mapa reverso; nenhum novo vínculo |
| extra_vid_machines_1 → leg press 45 | Mesmo mapa; no índice 1 o gerador produz extra_vid_technique_1 | Removido de ambas as direções; preservada sequência própria de cinco |
| extra_vid_machines_5 → leg press 45 | Mesmo mapa; no índice 5 o gerador produz extra_vid_injury-prevention_5 | Removido do mapa reverso; nenhum novo vínculo |

Os consumidores dos mappings mortos eram ExerciseLibrary.handleOpenVideo e GlobalVideoPlayer.relatedExercise. São IDs mortos de mock educacional, sem registro em MOCK_VIDEOS e sem arquivo de vídeo comprovado. Registros genéricos em índices próximos não estabelecem equivalência. As aulas educacionais restantes continuam separadas da disponibilidade de mídia real.

Todos os consumidores ativos de chest_supino_reto/2.jpg eram os dois manifests sincronizados e sua cadeia de fallback. A referência de teste sintético foi ajustada ao contrato local 0.jpg/1.jpg; documentação histórica e metadados desativados preservam a ocorrência original.

Manifest schema 1.2.0/version 5: 25 entradas em assets + 3 em historicalAssets = 28 registros. getExerciseMedia consulta apenas assets e exige ID runtime e exerciseId correspondente, protegendo também manifests antigos. O player descarta mídia direta de outro exercício ou de ID histórico. historicalAssets não participa de preload, download ou reprodução. Hashes dos assets originais comprovam preservação de status, URL, versão e proveniência; nenhum asset novo foi aprovado.

## Gaps e revisão visual

125 diretórios e 59 exercícios runtime sem qualquer asset: triceps_maquina + 29 do lote 6 + 29 do lote 7. Todos os 59 mantêm NO_MEDIA / P1 / GENERATE_REFERENCE_IMAGES. P1 de produção não significa achado estrutural pendente. STRUCTURAL_MEDIA_P0=0 e STRUCTURAL_MEDIA_P1=0.

Vídeos preservados: 2 approved, 25 draft, 1 retired. No escopo operacional são 2 approved + 23 draft; no histórico, 2 draft + 1 retired. Sequências de cinco=10. Draft nunca conta como vídeo reproduzível; retired histórico retorna placeholder e não volta ao runtime.

Capas, em classes disjuntas sobre os 184 IDs: COVER_EXISTING_CANDIDATE=122, COVER_NEEDS_REVIEW=3, COVER_MISSING=59, COVER_BLOCKED_WRONG_MEDIA=0. As 125 candidatas locais disponíveis aguardam aprovação humana. Quadríceps tem alternativa 1.jpg e exige revisão; por isso sua capa está em COVER_NEEDS_REVIEW, enquanto 0.jpg continua bloqueado individualmente.

`mobility_alongamento_quadriceps/0.jpg` permanece no disco como WRONG_EXERCISE / HUMAN_REVIEW_REQUIRED. `localMediaPolicy.ts` o exclui das imagens runtime; gallery cover e fallback técnico usam somente 1.jpg. Nenhuma imagem foi apagada. Dois pares preservados como DUPLICATE_EXACT / HUMAN_REVIEW_REQUIRED:

- back_remada_curvada_supinada/0.jpg = back_remada_curvada_supinada/1.jpg;
- mobility_alongamento_posterior/0.jpg = mobility_alongamento_quadriceps/0.jpg.

PERSONAL_REFERENCE_STATUS=MISSING_OFFICIAL_VISUAL_REFERENCE. Contrato em [GYMFLOW_PERSONAL_REFERENCE_INTAKE.md](./GYMFLOW_PERSONAL_REFERENCE_INTAKE.md): original preservado, mesmo rosto/corpo/roupa oficial, confirmação real do usuário, sem pessoa genérica nem aparência inferida de texto. READY_FOR_PERSONAL_REFERENCE_INTAKE=YES; READY_FOR_MEDIA_GENERATION_GOAL=NO.

## Comportamento antes/depois e QA

Antes, o inventário cobria 126 dos 184 IDs e ocultava o tamanho real do gap; o supino priorizava dois frames antigos, um inexistente; mappings mortos podiam abrir um guia sem registro; quadríceps começava pela imagem incompatível; mídia direta podia pertencer a outro exercício.

Depois, os 184 IDs estão presentes, os 59 gaps são explícitos, supino usa sua sequência própria de cinco, mapping ausente abre somente o guia do exercício selecionado, quadríceps usa 1.jpg e mídia cruzada/histórica é descartada.

| Caso coberto em código/teste | Resultado esperado |
|---|---|
| Base: chest_supino_haltere | Imagens próprias / sequência provisória |
| LOTE_6: legs_leg_press_90 | Selecionável, placeholder honesto, NO_MEDIA |
| LOTE_7: back_puxador_articulado | Selecionável, placeholder honesto, NO_MEDIA |
| triceps_maquina | Preservado, sem vídeo/frame/imagem emprestada, P1 |
| Approved: back_puxada_pulley | Vídeo; cinco frames próprios quando offline sem cache |
| Draft: chest_supino_reto | Nunca reproduz draft, inclusive em cache; cinco frames próprios |
| Retired: back_puxada_atras | Não pertence ao runtime; placeholder, sem thumbnail quebrado |

As alterações de runtime/player têm regressões de domínio e componente. Em 2026-10-02, após liberação de armazenamento pelo usuário, o smoke físico passou no Galaxy S22 SM-S901E (Android 16/API 36). O APK já preparado do HEAD funcional `8408a29c2507ddd3e5440bd8d7bd7e53f55478fe` foi instalado somente com `adb install -r`, sem rebuild ou limpeza de dados. Espaço livre antes: 1.613.916 KiB. O APK instalado foi extraído e seu SHA-256 confirmou `EE41413F65F0CB2ECF2D729A57C246B7C6DEAF50F315218F81BA85DBB22A5A4E`; assinatura preservada. firstInstallTime permaneceu `2026-09-22 11:17:58`; lastUpdateTime passou a `2026-10-02 00:02:13` (valores brutos do aparelho).

A revisão independente integral do PR #61 no HEAD funcional acima reconciliou 28 arquivos: 22 modificados + 6 adicionados. Seu único P2 era a ausência de evidência física; encerrado como `INDEPENDENT_REVIEW_P2=FIXED_BY_PHYSICAL_EVIDENCE`, sem repetir a revisão. `S22_PHYSICAL_SMOKE=PASS`; P0=0/P1=0/P2=0/P3=0; `FUNCTIONAL_CODE_CHANGED_AFTER_REVIEW=NO`.

Casos físicos PASS: biblioteca com 184 movimentos; BASE/chest_supino_reto com os cinco frames próprios, navegação anterior/próximo e draft sem vídeo promovido; LOTE_6/legs_leg_press_90 e LOTE_7/back_puxador_articulado acessíveis e honestos como NO_MEDIA; triceps_maquina sem mídia; vídeos reais approved back_puxada_pulley e back_remada_baixa reproduzindo seus próprios movimentos; busca de puxada atrás sem resultado retired, combinada com a exclusão de historicalAssets já verificada no diff integral; quadríceps com a candidata 1.jpg, sem seleção de 0.jpg e sem aprovação visual; mappings de hip thrust e leg press 45 sem aula cruzada. Player, Back, fechamento do guia, safe area e navegação funcionaram. Após remover somente o cartão GymFlow do Recents, a reabertura foi COLD (913 ms), preservando Rafael, 3150 XP, sequência de seis dias, treino planejado de sete exercícios e métricas do histórico (cinco PRs e duas semanas consecutivas). Nenhuma sessão foi iniciada ou apagada.

Logcat no intervalo iniciado em epoch 1790910119, processos GymFlow 3252/8936: FATAL_EXCEPTION=0 e ANR=0. Evidências locais: screenshots 03–32, metadados de instalação e logcat-audit.json no diretório externo goal124/s22-smoke. O fechamento posterior altera somente documentação; o merge depende dos quatro checks SUCCESS no novo HEAD. Não houve geração de imagem/vídeo, GPT Image, upload, alteração de CDN, AI-Guard, Nutrição ou Play Store. A referência visual oficial continua ausente e READY_FOR_MEDIA_GENERATION_GOAL=NO.
