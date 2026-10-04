# GYMFLOW-RUNTIME-MEDIA-PUBLISH-128

Estado: validação local e QA físico final S22 concluídos com PASS no candidato corrigido. Snapshot anterior à entrega Git/CI; o recibo pós-merge registra os identificadores e checks efetivos. Os 12 exercícios e os 35 frames foram observados no aparelho, com regressões e persistência aprovadas.

A autorização humana desta conversa limita a publicação a 12 exerciseIds / 35 frames finais dos GOALs 125 e 127. [Proveniência por asset](./publication.json), [checks](./GOAL_128_CHECKS.json), [QA de compressão](./QA_LOCAL.md), [QA físico S22](./QA_S22.md), [evidências físicas](./S22_EVIDENCE.json), [folha runtime](./runtime-contact-sheet.jpg) e [baseline de preservação](./preservation-baseline.json) são as fontes canônicas deste fechamento. Os PNGs e tentativas originais permanecem no arquivo local, fora do APK e da nova entrega Git.

| Campo | Resultado do candidato |
|---|---|
| BASE_SHA | `0a27bb89c2d53fc28f4864e42da8c9c1fff75e2d` |
| Branch | `codex/goal-128-runtime-media-publish` |
| HEAD_FINAL / PR_NUMBER / MERGE_SHA / ORIGIN_MASTER_AFTER | Registrados no recibo pós-merge; este snapshot contém os gates locais/físicos anteriores ao commit |
| RUNTIME_EXERCISES_PUBLISHED / RUNTIME_FRAMES_PUBLISHED | 12 / 35 |
| TRICEPS_FRAMES / LEGS_FRAMES | 8 / 27 |
| THREE_FRAME_EXERCISES / TWO_FRAME_EXERCISES | 11 / 1 |
| SOURCE_TOTAL_BYTES | 74.648.957 |
| RUNTIME_MEDIA_TOTAL_BYTES | 10.049.579 (9,584 MiB; limite preferido 12 MiB, obrigatório 15 MiB: PASS) |
| COMPRESSION_RATIO | 7,428068:1; source/runtime |
| Codec e geometria | JPEG progressivo, mozjpeg, qualidade 92, chroma 4:4:4, 1024×1536, sem crop/resize |
| APK_BEFORE_BYTES | 28.122.019 |
| APK_AFTER_BYTES | 38.183.370 |
| APK_DELTA_BYTES | 10.061.351 (9,595 MiB; limite 18 MiB: PASS) |
| APK_SHA256 | `b20f73c524602bb9a6ed6524f4be1b279cf85f259c97ed41fca3559daec7300d` |
| Package / assinatura | `com.gymflowai.app`; release interno verificado, certificado igual ao APK baseline |
| ASSET_DIRECTORIES_BEFORE / AFTER | 125 / 137 |
| NO_MEDIA_BEFORE / AFTER | 59 / 47 |
| RUNTIME_CATALOG | 184 IDs preservados |
| TRICEPS_MAQUINA_RESULT | somente 01 → 0.jpg e 03 → 1.jpg; labels inicial / execução-final; sem 2.jpg |
| FRANCES_CAVEAT_PRESERVED | YES; texto de origem integral no JSON, ressalva legível nos players |
| SISSY_STATUS | NO_MEDIA / DEFERRED; nenhuma capa nem sequência |
| Preservação | 35 fontes / 70 cópias locais e 310 arquivos protegidos intactos; 300 assets anteriores também idênticos dentro do APK |
| RUNTIME_MEDIA_CHANGED | YES |
| APPROVAL_STATUS_CHANGED | LOCAL_STILL_RUNTIME_PUBLICATION_ONLY |
| CDN_CHANGED / PLAY_STORE_CHANGED | NO / NO |
| READY_FOR_NEXT_MEDIA_BATCH | NO; nenhum novo lote autorizado ou iniciado neste GOAL |

| Runtime publication IDs | Fases fonte | Paths locais |
|---|---|---|
| triceps_frances_unilateral_cabo | 01 / 02 / 03 | 0.jpg / 1.jpg / 2.jpg |
| triceps_testa_cabo | 01 / 02 / 03 | 0.jpg / 1.jpg / 2.jpg |
| triceps_maquina | 01 / 03 | 0.jpg / 1.jpg |
| legs_leg_press_90 | 01 / 02 / 03 | 0.jpg / 1.jpg / 2.jpg |
| legs_agachamento_pendulo | 01 / 02 / 03 | 0.jpg / 1.jpg / 2.jpg |
| legs_afundo_smith | 01 / 02 / 03 | 0.jpg / 1.jpg / 2.jpg |
| legs_agachamento_bulgaro_smith | 01 / 02 / 03 | 0.jpg / 1.jpg / 2.jpg |
| legs_flexora_em_pe_maquina | 01 / 02 / 03 | 0.jpg / 1.jpg / 2.jpg |
| legs_flexora_articulada | 01 / 02 / 03 | 0.jpg / 1.jpg / 2.jpg |
| legs_stiff_smith | 01 / 02 / 03 | 0.jpg / 1.jpg / 2.jpg |
| legs_aducao_cabo | 01 / 02 / 03 | 0.jpg / 1.jpg / 2.jpg |
| legs_agachamento_sumo_smith | 01 / 02 / 03 | 0.jpg / 1.jpg / 2.jpg |

Os arquivos ficam em `public/assets/exercises/<exerciseId>/`. `publishedLocalMedia.ts` centraliza contagem, decisão, cues e caveats. `withLocalImages` usa esse contrato; o guia resolve somente mídia própria. Cards começam em 0.jpg e preservam a imagem inteira. Labels de três frames: Posição inicial → Meio da execução → Posição final. Máquina mantém Posição inicial → Execução / posição final. Os 50 JPEGs e as labels das dez sequências antigas de cinco permanecem preservados, assim como os dois manifests ativos e os dois vídeos approved.

Validação automatizada: suíte completa final PASS, 3.730 testes em 170 arquivos; typecheck, build web e build mobile PASS. Inventário reproduzível: 15 testes PASS, check PASS e validação de manifest com 10 testes PASS. iOS: 17 testes PASS. Testes focados de técnica/mídia/catálogo/player/seletor e diff check constam nos checks. O APK contém exatamente os 35 novos hashes de runtime e nenhum PNG fonte, frame intermediário da máquina ou asset da Sissy. Uma segunda encodificação confirmou bytes idênticos.

A baseline APK corresponde ao candidato físico do GOAL-124, commit `8408a29c2507ddd3e5440bd8d7bd7e53f55478fe`, SHA-256 `ee41413f65f0cb2ecf2d729a57c246b7c6deaf50f315218f81ba85dbb22a5a4e`. O diff desse commit à base esperada contém apenas `docs/**`; fontes runtime, dependências e inputs de build são equivalentes. Certificado SHA-256 de ambos: `a3273a11a7c932f1397911ad02d62a8789522564f3ac6f7ff8d918dc1ade547c`. O APK efetivamente instalado no S22 foi extraído antes da atualização e corresponde exatamente à baseline, com esse certificado.

QA local adicional: francês em 360×780 carregou capa 0.jpg e os três frames próprios, com labels/contador 1/3 → 2/3 → 3/3, contain, ressalva legível, sem overflow horizontal e controles de 44×44 px. As verificações físicas finais confirmam os 12 exercícios e todos os estágios no S22.

O primeiro smoke físico identificou a faixa sobre a foto encobrindo parte da mão do francês em 03. O candidato corrigido exibe status/contador acima das fotos dos 12 publicados e força contain nos dois players. Suíte completa, TypeScript, builds web/mobile e APK assinado passaram novamente. O reteste físico final deste mesmo APK passou nos 12 exercícios, todos os 35 frames e nas regressões obrigatórias.

| Gate físico / entrega | Estado |
|---|---|
| S22_INSTALL_RESULT | PASS, adb install -r Success; hash instalado e assinatura conferidos |
| S22_12_OF_12_MEDIA_RESULT | PASS, 12 capas próprias e 35 estágios |
| OLD_5_FRAME_REGRESSION | PASS, Supino Reto com Barra de 1/5 a 5/5 |
| APPROVED_VIDEO_REGRESSION | PASS, Pulley e Remada com movimento, pausa e retomada |
| NO_MEDIA_FALLBACK_REGRESSION / Sissy | PASS, fallback honesto; Sissy sem capa/frames |
| Android Back / safe area / Recents + cold reopen | PASS |
| PERSISTENCE_RESULT | PASS, planejador 69/69 e evolução 144/144 sem diferenças; perfil/XP/streak e firstInstallTime preservados |
| FATAL_EXCEPTION / ANR | 0 / 0, captura contínua final de 18:58:05Z a 19:41:01Z |
| CI_STATUS / PR_STATE | Apurados após este snapshot no recibo de entrega |

A entrega autorizada segue com commit/push/PR, todos os checks existentes incluindo media-catalog-integrity, merge commit sem admin/force/rebase/squash, fetch e conferência dos SHAs finais. O recibo pós-merge contém o relatório final completo. Não houve geração nova, CDN, Play Store, AI-Guard/Nutrição ou próximo lote.
