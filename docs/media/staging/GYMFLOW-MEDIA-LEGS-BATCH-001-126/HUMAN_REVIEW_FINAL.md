# Fechamento humano final — lote de pernas

Decisão explícita do usuário no GOAL-127, em 2026-10-03. Escopo: STAGING_VISUAL_SELECTION_ONLY. Nenhuma aprovação de runtime concedida, nenhuma imagem nova gerada. agentReview, overall e reviewNotes originais permanecem inalterados; humanDecision é separado.

| Campo | Resultado |
| --- | --- |
| BATCH_HUMAN_REVIEW | PASS_9_SEQUENCES_ONE_DEFERRED |
| EXERCISES_TOTAL | 10 |
| TECHNIQUE_SEQUENCES_ACCEPTED | 9 |
| TECHNIQUE_SEQUENCES_DEFERRED | 1 |
| FINAL_SELECTED_SEQUENCE_FRAMES | 27 |
| GALLERY_ONLY_CANDIDATES | 1 |
| SISSY_STATUS | DEFERRED |
| SISSY_COVER_STATUS | GALLERY_COVER_CANDIDATE_ONLY |
| DEFER_REASON | ENDPOINT_OR_BIOMECHANICS_NOT_RELIABLE |
| REGENERATION_REQUIRED_FUTURE | YES |
| DEFERRED_SEQUENCE_POLICY | EXPLICIT_IN_CANONICAL_SKILL |
| RUNTIME_MEDIA_CHANGED | NO |
| APPROVAL_STATUS_CHANGED | NO |
| CDN_CHANGED | NO |

## Decisão por exercício

| exerciseId | humanDecision | Ressalva / motivo |
| --- | --- | --- |
| legs_leg_press_90 | ACCEPTED | — |
| legs_agachamento_pendulo | ACCEPTED_WITH_CAVEAT | Pequena deriva de geometria/apoios da máquina. |
| legs_agachamento_sissy | DEFERRED_TECHNICAL_SEQUENCE | As tentativas delimitadas não produziram 02/03 com flexão/progressão confiáveis sem alterar apoio/calcanhar/câmera. |
| legs_afundo_smith | ACCEPTED | — |
| legs_agachamento_bulgaro_smith | ACCEPTED | — |
| legs_flexora_em_pe_maquina | ACCEPTED | — |
| legs_flexora_articulada | ACCEPTED_WITH_CAVEAT | Pequenas diferenças de pivô/transmissão entre fases. |
| legs_stiff_smith | ACCEPTED_WITH_CAVEAT | Deriva residual de pés/base entre frames, mas hip hinge e progressão visual são suficientemente claros. |
| legs_aducao_cabo | ACCEPTED | — |
| legs_agachamento_sumo_smith | ACCEPTED | — |

ACCEPTED_IDS: legs_leg_press_90, legs_afundo_smith, legs_agachamento_bulgaro_smith, legs_flexora_em_pe_maquina, legs_aducao_cabo, legs_agachamento_sumo_smith.

ACCEPTED_WITH_CAVEAT_IDS: legs_agachamento_pendulo, legs_flexora_articulada, legs_stiff_smith.

DEFERRED_IDS: legs_agachamento_sissy. As nove aceitas incluem seis sem ressalva e três com ressalva. NEEDS_HUMAN_REVIEW do agente não foi convertido em PASS: 1 CANDIDATE_OK e 9 NEEDS_HUMAN_REVIEW preservados.

## Sissy Squat deferred

As tentativas delimitadas não produziram 02/03 com flexão/progressão confiáveis sem alterar apoio/calcanhar/câmera. A falha também envolve a fase final; TWO_FRAME_EXCEPTION não aplicada. 02_intermediaria e 03_final são EXCLUDED_FROM_FINAL_SEQUENCE e estão fora de todas as listas FINAL_SELECTED. 01_inicial é somente GALLERY_COVER_CANDIDATE_ONLY, fora da seleção técnica e sem runtime approval.

Todos os três PNGs anteriores, tentativas rejeitadas, prompts e proveniência permanecem no arquivo local. Nenhum frame substituto ou sequência incompleta foi fabricado. Novo round exige GOAL/autorização futura.

## Seleção, arquivo e publicação compacta

As nove sequências aceitas têm 01_inicial | 02_intermediaria | 03_final: 27 PNGs de 1024×1536. Folha FINAL: nove linhas com três frames; Sissy somente 01 e marcador textual externo TECHNIQUE SEQUENCE DEFERRED.

Arquivo original intacto na branch codex/goal-126-media-legs, commits 043e8e811d6cf6d301ff7aa94869b085928823e4 e dce5b1dc0a2e010fdd0d9f4c4330254fd51ad48f: 71 tentativas e 30 candidatas retidas. Nenhum amend/rebase nem push desses commits. Entrega limpa sobre origin/master d8887ef31cf4d013f9318280feda7cd0189552f4 em codex/goal-127-media-legs-close; commits locais fora da ancestry publicada.

Paths localArchivePath/localCandidatePath são LOCAL_ONLY_NOT_VERSIONED: não existem no clone compacto e não representam mídia publicada/pronta para runtime. Referências oficiais já estão na base remota e permanecem intactas. Proveniência essencial retém IDs, contadores, hashes e paths; prompts e invocações completos permanecem no JSON local identificado por SHA-256.

| Medição | Bytes |
| --- | ---: |
| SELECTED_FRAME_BYTES | 57079437 |
| GALLERY_ONLY_FRAME_BYTES | 2069030 |
| ATTEMPT_HISTORY_BYTES | 148326199 |
| HEAVY_HISTORY_BYTES | 211380981 |
| REFERENCES_BYTES | 4899989 |
| CONTACT_SHEET_BYTES | 1431730 |
| VERSIONED_BINARY_BYTES | 1431730 |

HEAVY_HISTORY_BYTES = all 71 attempt PNG copies + all 30 retained local candidate PNG copies; source generated_images duplicates, prior sheets, inspection derivatives and refs are not included.

Somente fechamento, manifest/metadata essencial, folha final, atualização mínima da skill e registros de governança são versionados. Não são enviados PNGs selecionados ou tentativas. O único binário novo é a folha final; referências existentes não são recopiadas. Modelo efetivo de geração histórica: NOT_DISCLOSED_BY_TOOL; nenhuma ferramenta geradora acionada neste fechamento.

## Preservação, checks e revisão

[validation-final.json](./validation-final.json): 847 protegidos, personal/ambiente oficiais, public assets/manifests ativos/aprovações existentes e arquivo local intactos; 9/1/27/1, PNGs e seleção verificados. [GOAL_127_CHECKS.json](./GOAL_127_CHECKS.json): inventário, mídia, build e diff. [INDEPENDENT_REVIEW.md](./INDEPENDENT_REVIEW.md): revisão limitada ao fechamento, exigindo P0=0/P1=0/P2=0.

Push/PR e merge commit explicitamente autorizados, condicionados a CI verde e revisão independente limpa. Sem squash/rebase/force. Evidência Git/CI final será registrada no recibo local .local/DELIVERY_FINAL.json após conclusão, evitando SHA circular dentro do próprio commit.

[Manifest](./batch-manifest.json) · [Decisão humana](./human-decision.json) · [Proveniência](./provenance-essential.json) · [Medições/publicação](./preflight-publication.json) · [Folha FINAL](./contact-sheets/lote-pernas-final.jpg) · [Skill canônica](../../GYMFLOW_MEDIA_GENERATION_SKILL.md)

READY_FOR_NEXT_MEDIA_BATCH = YES_WITH_SEPARATE_GOAL. Ponto de parada: fechamento documental do lote. Nenhuma geração, integração no app ou início de outro grupo neste GOAL.
