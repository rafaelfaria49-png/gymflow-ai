# Revisão independente — GOAL-127

Resultado: **PASS**. P0=0, P1=0, P2=0, P3=0. Nenhum achado no escopo solicitado.

- Reviewed HEAD: `f3a05f46379dc27c1baabd9583076dedfee135b6`.
- Base revisada: `d8887ef31cf4d013f9318280feda7cd0189552f4` (`origin/master` informado no pedido).
- Branch: `codex/goal-127-media-legs-close`.
- Data: 2026-10-03, America/Sao_Paulo.
- Revisão independente da execução: leitura de CLAUDE.md, AGENTS.md, pedido humano original, diff base–HEAD, documentos e evidências locais. O único arquivo escrito por esta revisão é este relatório.

## Escopo

Somente fechamento documental: persistência das decisões humanas; DEFERRED_SEQUENCE_POLICY; ausência de auto-approval, integração runtime e histórico pesado acidental; contagens 9/1/27/1. A biomecânica já decidida pelo humano não foi reavaliada. Nenhuma imagem foi gerada; runtime, dados e skill não foram alterados pelo revisor; nenhum commit, push ou PR foi executado pelo revisor.

## Evidências verificadas

1. **Decisão humana exata.** O SHA-256 do pedido original corresponde a `requestSha256` em human-decision.json: `c57c0c3214a78acba09f1f6e4ccd1679fcfb1b76d5d425545fcc1c34dd07196f`. human-decision.json, batch-manifest.json e HUMAN_REVIEW_FINAL.md persistem seis HUMAN_ACCEPTED: legs_leg_press_90, legs_afundo_smith, legs_agachamento_bulgaro_smith, legs_flexora_em_pe_maquina, legs_aducao_cabo e legs_agachamento_sumo_smith. Persistem três ACCEPTED_WITH_CAVEAT: legs_agachamento_pendulo (pequena deriva de geometria/apoios), legs_flexora_articulada (pequenas diferenças de pivô/transmissão) e legs_stiff_smith (deriva residual de pés/base, hinge e progressão suficientemente claros). O Sissy permanece DEFERRED_TECHNICAL_SEQUENCE.

2. **Contagens recalculadas.** São 10 exercícios: nove sequências aceitas com exatamente 01_inicial, 02_intermediaria e 03_final; uma sequência deferred; 27 frames FINAL_SELECTED e uma candidata somente de capa. A lista global FINAL_SELECTED corresponde às listas por exercício; os 27 hashes selecionados são distintos. A proveniência contém 71 tentativas: 27 FINAL_SELECTED, 41 ATTEMPT_PRESERVED_NOT_FINAL, uma GALLERY_COVER_CANDIDATE_ONLY e duas EXCLUDED_FROM_FINAL_SEQUENCE.

3. **Sissy e contrato deferred.** Todas as listas FINAL_SELECTED excluem Sissy; frames e FINAL_SELECTED do exercício estão vazios. 01_inicial figura somente em galleryOnlyCandidates como GALLERY_COVER_CANDIDATE_ONLY; 02_intermediaria e 03_final estão EXCLUDED_FROM_FINAL_SEQUENCE. TECHNIQUE_SEQUENCE_STATUS=DEFERRED, DEFER_REASON=ENDPOINT_OR_BIOMECHANICS_NOT_RELIABLE e REGENERATION_REQUIRED_FUTURE=YES estão presentes. TWO_FRAME_EXCEPTION não foi aplicado. O diff da skill adiciona somente DEFERRED_SEQUENCE_POLICY: endpoint inadequado após bounded attempts exige deferred, preservação, capa opcional, nenhuma sequência inventada e GOAL/autorização futura. As demais regras permanecem intactas.

4. **Julgamento original preservado.** Comparados diretamente, em cada um dos 10 exercícios, agentReview, overall e reviewNotes com o manifest local original do GOAL-126: 30 comparações estruturais passaram. Mantidos 1 CANDIDATE_OK e 9 NEEDS_HUMAN_REVIEW; humanDecision está separado. Os hashes do manifest completo (`bfc2227e0dc07c857ea5ecf1d326a787ddffc12c111381a700e6d1a6d88c50f1`) e da proveniência completa (`ec699808806d18a8f881d41a4cc1726eaf5cff90d9ca470d47ce3a854d382c85`) correspondem aos arquivos locais e aos respectivos blobs do commit original dce5b1dc0a2e010fdd0d9f4c4330254fd51ad48f.

5. **Sem auto-approval ou integração.** Decisões e frames permanecem STAGING_VISUAL_SELECTION_ONLY, runtimeApproval=NOT_GRANTED, versioned=false e LOCAL_ONLY_NOT_VERSIONED para os PNGs. O diff contém somente os registros de governança, a adição mínima da skill e os artefatos compactos de staging; nenhum public asset, manifest ativo, aprovação existente ou código runtime foi alterado. RUNTIME_MEDIA_CHANGED, APPROVAL_STATUS_CHANGED e CDN_CHANGED permanecem NO. As verificações locais e a seleção humana não concedem aprovação runtime.

6. **Preservação e bytes conferidos.** Recalculados os hashes dos 847 arquivos de preservation-baseline.json: todos iguais. As duas referências oficiais mantêm hashes e tamanhos, somando 4.899.989 bytes. Recalculados hashes e tamanhos das 71 tentativas locais e das 30 candidatas retidas; para os 30 frames também conferida a correspondência entre cópia candidata e tentativa original. Selecionados: 57.079.437 bytes; capa: 2.069.030; 30 candidatas retidas: 63.054.782; tentativas: 148.326.199; HEAVY_HISTORY_BYTES: 211.380.981, conforme definição documentada. Todos permanecem locais.

7. **Publicação compacta e ancestry.** A base d8887ef é ancestral do reviewed HEAD. Os commits 043e8e811d6cf6d301ff7aa94869b085928823e4 e dce5b1dc0a2e010fdd0d9f4c4330254fd51ad48f existem localmente e nenhum é ancestral deste HEAD. O worktree original continua em dce5b1d. git diff --numstat base–HEAD identifica exatamente um novo binário: contact-sheets/lote-pernas-final.jpg, 1.431.730 bytes, SHA-256 `de5a444474a4b4a5e6318c330fdee4065fdafde1079742b69869e0df09920606`. Nenhum PNG selecionado, tentativa ou histórico completo foi versionado no diff.

8. **Folha final e validações.** Inspeção visual documental da folha final confirma nove linhas de três fases e Sissy somente com 01, acompanhado de TECHNIQUE SEQUENCE DEFERRED fora da imagem, sem frames substitutos. Conferidos validation-final.json, GOAL_127_CHECKS.json e os logs locais: media:inventory:check PASS (184 exercícios, 59 sem mídia, dois vídeos aprovados e 10 sequências runtime existentes), media:validate PASS (10 testes) e build PASS. Esses comandos foram executados pela implementação; nesta revisão seus registros foram inspecionados, sem repetição desnecessária. git diff --check base–HEAD foi executado independentemente e passou.

## Conclusão e limite

A condição de revisão independente exigida pelo pedido humano foi satisfeita: **P0=0 / P1=0 / P2=0**; também P3=0. O reviewed HEAD está apto à publicação documental compacta dentro desse escopo. CI verde continua requisito separado antes do merge; este relatório não certifica CI remoto nem autoriza integração de mídia no app. Novo lote ou regeneração requer GOAL/autorização futura.
