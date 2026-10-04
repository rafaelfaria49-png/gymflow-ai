# GOAL-128 — QA dos derivados locais

Data: 2026-10-04, America/Sao_Paulo. Autoridade de publicação: pedido humano explícito nesta conversa; hash e escopo em `publication.json`. Seleção: decisões canônicas dos GOALs 125 e 127, verificadas contra a proveniência essencial. A inspeção desta etapa avalia a compressão dos derivados; julgamentos anteriores do agente e ressalvas humanas permanecem preservados.

35 PNGs originais: 74.648.957 bytes. 35 JPEGs progressivos: 10.049.579 bytes (9,584 MiB), qualidade 92, mozjpeg, chroma 4:4:4, 1024×1536. Nenhum resize, crop, rotação indevida ou dependência runtime nova. Relação source/runtime: 7,428:1. Todos os hashes fonte foram conferidos antes da escrita; fontes e cópias do arquivo local permanecem imutáveis.

[Contact sheet dos JPEGs de runtime](./runtime-contact-sheet.jpg): 12 linhas, 35 derivados, máquina com dois frames e terceira coluna vazia. A folha foi inspecionada em três páginas de quatro exercícios. Comparações ampliadas, PNG fonte à esquerda / JPEG runtime à direita, foram inspecionadas em resolução nativa para a fase final de cada um dos 12 exercícios. Essas comparações e métricas ficam no arquivo local `goal128` da conversa, fora do APK e da entrega Git.

| exerciseId | Frames runtime | Compressão / geometria |
|---|---:|---|
| triceps_frances_unilateral_cabo | 3 | PASS; rosto, mãos, cabo e margem superior preservados |
| triceps_testa_cabo | 3 | PASS; mãos, corda, cotovelos e banco preservados |
| triceps_maquina | 2 | PASS; mãos, pivôs e alavancas preservados; somente 01/03 |
| legs_leg_press_90 | 3 | PASS; rosto, joelhos, pés, plataforma e trilhos preservados |
| legs_agachamento_pendulo | 3 | PASS; apoios, pivô, joelhos e pés preservados |
| legs_afundo_smith | 3 | PASS; mãos, barra, joelhos e apoios preservados |
| legs_agachamento_bulgaro_smith | 3 | PASS; barra, banco, joelho e pés preservados |
| legs_flexora_em_pe_maquina | 3 | PASS; mãos, eixo, rolo e joelhos preservados |
| legs_flexora_articulada | 3 | PASS; transmissão, pivôs, rolo e joelhos preservados |
| legs_stiff_smith | 3 | PASS; rosto, mãos, barra e joelhos preservados |
| legs_aducao_cabo | 3 | PASS; rosto, mão de apoio, cabo e tornozeleira preservados |
| legs_agachamento_sumo_smith | 3 | PASS; rosto, mãos, barra, joelhos e pés preservados |

Não foram observados artefatos fortes novos nem degradação material nessas inspeções. PSNR auxiliar de todos os 35 pares decodificados: mínimo 42,013 dB; a métrica complementa a inspeção visual. As diferenças biomecânicas/geométricas já aceitas pertencem às fontes e não foram retocadas ou reclassificadas.

Ressalvas de origem: francês (cotovelo/braço superior na posição final), pêndulo (geometria/apoios), flexora articulada (pivô/transmissão) e stiff (pés/base). Textos integrais e decisões humanas constam por asset em `publication.json`; o guia apresenta essas observações em linguagem de uso. Máquina: `TWO_FRAME_EXCEPTION_01_03`, `MIDPOINT_FAILED_BOUNDED_ATTEMPTS`, intermediária preservada no histórico e excluída. Sissy: `NO_MEDIA / DEFERRED`, sem capa nem sequência publicada.

Cards dos 12 publicados preservam a foto inteira com `contain` e começam em `0.jpg`. Guias usam imagens próprias, cues coerentes com a direção selecionada e labels inicial/meio/final, ou inicial/execução-final na máquina. As dez sequências antigas mantêm cinco frames; os 50 JPEGs originais estão protegidos por hashes em `preservation-baseline.json`.

QA físico no Galaxy S22 e resultados de build, budget do APK, Git e CI são rastreados separadamente em `GOAL_128_CHECKS.json`. Esta inspeção local não preenche os gates físicos ainda pendentes.
