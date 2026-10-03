# GymFlow — Especificação do pipeline futuro de mídia

Status: contrato atualizado pelo GOAL-125 (2026-10-03). Nesta entrega não houve geração nova nem integração de mídia no app/CDN. O histórico local do piloto permanece preservado.

PILOT_TRICEPS_STANDARD=ACCEPTED
PERSONAL_REFERENCE_STATUS=READY
MEDIA_GENERATION_SKILL_STATUS=READY
READY_FOR_NEXT_MEDIA_BATCH=YES_WITH_SEPARATE_GOAL

Contrato canônico reutilizável: [GYMFLOW_MEDIA_GENERATION_SKILL.md](./GYMFLOW_MEDIA_GENERATION_SKILL.md). [Fechamento humano do piloto](./pilots/GYMFLOW-MEDIA-PILOT-TRICEPS-001/HUMAN_REVIEW_FINAL.md): 9 sequências de 3 + 1 de 2 = 29 frames, aprovação somente PILOT_VISUAL_STANDARD_ONLY.

## Gate de prontidão

O próximo GOAL somente poderá gerar mídia quando **todos** os critérios forem satisfeitos:

| Critério | Estado após GOAL-125 | Exigência |
|---|---|---|
| CATALOG_RUNTIME_RECONCILED | YES | YES; 126 + 29 + 29 = 184 IDs únicos e válidos |
| STRUCTURAL_MEDIA_P0_P1 | 0 | 0; nenhum path ou mapping quebrado ativo |
| INVENTORY_RUNTIME_COMPLETE | YES | YES; os 184 IDs selecionáveis no inventário |
| PERSONAL_REFERENCE_STATUS | READY | READY |
| MEDIA_GENERATION_SKILL_STATUS | READY | READY |
| PILOT_TRICEPS_STANDARD | ACCEPTED | padrão humano documentado |

READY_FOR_PERSONAL_REFERENCE_INTAKE=YES. Referência oficial recebida, preservada e confirmada: [GYMFLOW_PERSONAL_REFERENCE_INTAKE.md](./GYMFLOW_PERSONAL_REFERENCE_INTAKE.md). READY_FOR_MEDIA_GENERATION_GOAL=YES somente quanto aos gates de referência/contrato; executar um próximo lote exige seu próprio GOAL autorizado. A aprovação do piloto não aprova futuros lotes ou mídia runtime.

Antes de uma execução futura, o GOAL deverá:

1. verificar disponibilidade e hash da referência visual oficial já registrada, sem trocar a identidade nem alterar docs/avatar-design;
2. confirmar MEDIA_CATALOG_SCOPE=RUNTIME_CATALOG e rodar media:inventory:check; os 58 IDs de LOTE_6/LOTE_7 já pertencem ao escopo operacional;
3. revisar as flags objetivas, as capas e os achados do inventário;
4. confirmar os IDs canônicos e os equipamentos de cada lote.

## Fonte e preservação

- Usar src/mock/exercises.ts#RUNTIME_CATALOG como única fonte operacional; MOCK_EXERCISES é a mesma lista. BASE_CATALOG_126 permanece como baseline histórico, sem limitar a cobertura atual. Usar equipment do catálogo como requisito por exercício.
- Consultar o inventário JSON para os paths locais, sequências e estado do manifest. MOCK_VIDEOS não é fonte de disponibilidade ou aprovação.
- Preservar os dois vídeos approved (back_puxada_pulley, back_remada_baixa) e suas evidências de proveniência.
- Preservar as 10 sequências de cinco frames. Não as reescrever nem regenerar automaticamente.
- Manifest: assets contém 25 entradas operacionais; historicalAssets contém três registros preservados sem remapeamento. Os totais históricos são 2 vídeos approved, 25 draft e 1 retired; os ativos são 2 approved e 23 draft. Nunca consultar historicalAssets no player, preload ou download. Draft não é vídeo disponível; retired não pode voltar automaticamente ao runtime.
- Há 59 exercícios runtime sem qualquer asset: triceps_maquina + 29 de LOTE_6 + 29 de LOTE_7. Manter NO_MEDIA / P1 / GENERATE_REFERENCE_IMAGES até uma produção futura autorizada.
- Bloquear quadriceps/0.jpg, preservado no disco como WRONG_EXERCISE / HUMAN_REVIEW_REQUIRED. Apenas quadriceps/1.jpg é candidata, ainda sem aprovação. Preservar os dois pares DUPLICATE_EXACT / HUMAN_REVIEW_REQUIRED do inventário, sem exclusão automática.
- As classes de capa são disjuntas: COVER_EXISTING_CANDIDATE=122, COVER_NEEDS_REVIEW=3, COVER_MISSING=59 e COVER_BLOCKED_WRONG_MEDIA=0. Há 125 candidatas locais ao todo e todas aguardam aprovação humana; uma alternativa segura para quadríceps não remove o achado sobre 0.jpg.
- Para exercício sem vídeo approved e sem sequência de cinco frames a preservar, o alvo padrão é uma sequência coerente de três imagens: posição inicial, meio e posição final. A posição inicial é a candidata de capa.
- Tratar imagens legacy como disponibilidade técnica até revisão humana; não pressupor aprovação por haver dois arquivos.

## Contrato canônico por sequência

Aplicar [a skill de geração de mídia](./GYMFLOW_MEDIA_GENERATION_SKILL.md): IDENTITY_LOCK, CAMERA_LOCK, ENVIRONMENT_LOCK, EQUIPMENT_LOCK e MIDPOINT_50_PERCENT_RULE. Dentro do exercício câmera/lado/distância/crop e equipamento ficam fixos; entre exercícios o ângulo pode variar para mostrar a biomecânica.

Três frames são o padrão. No máximo três tentativas automáticas por frame, incluindo a primeira; depois HUMAN_REVIEW_GATE. Nova rodada exige autorização humana explícita e delimitada. Uma intermediária que falhe recebe MIDPOINT_FAILED_BOUNDED_ATTEMPTS; TWO_FRAME_EXCEPTION somente com decisão humana explícita, preservando 02 como EXCLUDED_FROM_FINAL_SEQUENCE. O caso da máquina no piloto não autoriza automaticamente outro exercício.

## Validação automática e aprovação

O validador futuro deve confirmar, pelo menos: ID e path canônicos; quantidade e ordem de frames; arquivos decodificáveis; dimensões/proporções consistentes; duplicatas exatas; correspondência de nome/equipamento declarados; ausência de texto/logo quando detectável; e que nenhum arquivo ou status approved foi substituído. Heurísticas visuais são sinais para revisão, não aprovação de anatomia ou biomecânica.

Cada saída precisa de revisão humana antes de ser ligada ao catálogo, manifest, CDN ou interface. A revisão deve conferir exercício e equipamento, anatomia/biomecânica, clareza/crop, identidade/roupa/cenário e escolha da capa. USABLE_AS_GALLERY_COVER é somente uma candidata; não concede status approved. Não promover draft nem alterar proveniência sem nova evidência e aprovação explícita.

Armazenar novas saídas em paths/versionamento novos, comparar com os hashes existentes e manter os assets aprovados intactos. Upload, CDN e atualização do manifest pertencem a uma etapa/GOAL separado com validação e autorização próprias.
