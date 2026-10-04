# QA físico — GOAL-128

Resultado: **PASS em todos os gates físicos**, no Galaxy S22 SM-S901E, Android 16/API 36, em 2026-10-04. [Evidências verificáveis](./S22_EVIDENCE.json) registram arquivos, bytes, SHA-256, contadores e labels observados. Screenshots/XML e logcat permanecem no arquivo local privado.

O candidato corrigido foi instalado com `adb install -r` e retornou Success. O APK extraído do aparelho ao encerrar o smoke tem 38.183.370 bytes e SHA-256 `b20f73c524602bb9a6ed6524f4be1b279cf85f259c97ed41fca3559daec7300d`, idêntico ao candidato testado. Package `com.gymflowai.app`; certificado SHA-256 `a3273a11a7c932f1397911ad02d62a8789522564f3ac6f7ff8d918dc1ade547c`, compatível com a instalação anterior. firstInstallTime permaneceu 2026-09-22 11:17:58; atualização final 2026-10-04 15:59:24. Não foram usados uninstall, clear ou wipe.

| Exercício | Frames | Capa inicial própria | Guia própria | Contador/labels | Qualidade sem crop |
|---|---:|---|---|---|---|
| triceps_frances_unilateral_cabo | 3 | PASS | PASS | PASS | PASS |
| triceps_testa_cabo | 3 | PASS | PASS | PASS | PASS |
| triceps_maquina | 2 | PASS | PASS | PASS | PASS |
| legs_leg_press_90 | 3 | PASS | PASS | PASS | PASS |
| legs_agachamento_pendulo | 3 | PASS | PASS | PASS | PASS |
| legs_afundo_smith | 3 | PASS | PASS | PASS | PASS |
| legs_agachamento_bulgaro_smith | 3 | PASS | PASS | PASS | PASS |
| legs_flexora_em_pe_maquina | 3 | PASS | PASS | PASS | PASS |
| legs_flexora_articulada | 3 | PASS | PASS | PASS | PASS |
| legs_stiff_smith | 3 | PASS | PASS | PASS | PASS |
| legs_aducao_cabo | 3 | PASS | PASS | PASS | PASS |
| legs_agachamento_sumo_smith | 3 | PASS | PASS | PASS | PASS |

Os 12 cards e os 35 estágios foram percorridos no aparelho, pausados para conferir labels/contadores e revisados visualmente contra os frames selecionados. Quatro mosaicos de screenshots físicos foram inspecionados em resolução original; francês/stiff final e a ressalva do francês também foram ampliados separadamente. Nenhuma imagem quebrada, mídia cruzada, deformação, crop ou degradação material de compressão foi observada. As sequências de três exibem Posição inicial → Meio da execução → Posição final; máquina somente 1/2 Posição inicial → 2/2 Execução / posição final, sem midpoint.

A correção do francês passou: status e contador acima da foto, mão inteira em 03, proporção preservada e ressalva aceita legível. Texto: “Há um pequeno deslocamento do cotovelo e do braço superior na posição final. Mantenha o cotovelo estável durante a execução.”

| Regressão | Resultado físico |
|---|---|
| chest_supino_reto, sequência antiga | PASS, 1/5 até 5/5, cinco labels preservadas e mídia própria |
| back_puxada_pulley / back_remada_baixa | PASS, reprodução com movimento visível, pausa e retomada de ambos os vídeos approved |
| chest_supino_smith_reto | PASS, fallback honesto Sem imagens técnicas |
| legs_agachamento_sissy | PASS, nenhuma capa/sequência; fallback honesto, permanece NO_MEDIA/DEFERRED |
| Android Back | PASS, guia de detalhe volta ao dashboard sem travamento |
| Safe area e toque | PASS, conteúdo fora das barras do sistema, controles visíveis com mínimo 44 CSS px (118 px físicos no aparelho) |
| Recents + cold reopen | PASS, somente o card GymFlow foi dispensado; force-stop sem clear e nova abertura preservaram sessão/dados |
| Persistência | PASS, 69 textos únicos do planejador e 144 da evolução idênticos antes/depois; hashes dos conjuntos no JSON, XP 3.150 e sequência de seis dias preservados |
| Logcat final | PASS, FATAL_EXCEPTION=0 e ANR=0 |

A captura contínua final abrangeu 2026-10-04T18:58:05.505Z → 2026-10-04T19:41:01.295Z, 105.650.466 bytes e 521.172 linhas de todos os buffers. A varredura buscou FATAL EXCEPTION:, ANR in e am_anr; mensagens informativas de ANRManager não são eventos de ANR. SHA-256 do log bruto: `0c8f78eb68d4b1cf334c350829ca5fe0b34e4c4cc347f8deb821cbbf6b7a7181`.

A comparação de persistência usa os valores não vazios text/content-desc dos nós do package do app, normalizados como conjuntos ordenados. Planejador: 69 antes / 69 depois; evolução: 144 / 144, sem diferenças. Os XMLs privados permitem revisar os valores originais; o JSON canônico publica apenas contagens e hashes. A preservação também é sustentada por install -r e firstInstallTime inalterado.

P128-001 registra a sobreposição anterior do botão flutuante Iniciar treino com Ver técnica no primeiro card da biblioteca. A rolagem expôs o controle e permitiu concluir todos os testes sem iniciar treino ou alterar dados. O layout da biblioteca não foi alterado neste GOAL.

Este QA e GOAL_128_CHECKS.json são o snapshot de validação anterior ao commit. O recibo final pós-merge registra HEAD, PR, CI, merge SHA e origin/master efetivos, sem autorreferência do hash no próprio commit.
