# GymFlow — Especificação do pipeline futuro de mídia

Status: especificação documental. O GOAL-123 não chamou modelo de imagem/vídeo, não gerou mídia de exercício e não mudou aprovações.

## Gate de prontidão

READY_FOR_MEDIA_GENERATION_GOAL=NO enquanto não houver no repositório uma referência visual oficial, aprovada e utilizável do personal. KAI_DNA_v1.md, KAI_MOODBOARD_v1.md e GYMFLOW_ART_BIBLE_V1.md registram intenção por texto, mas não fixam visualmente o rosto. As imagens existentes podem ajudar a avaliar composição; não são prova de identidade oficial. Não inventar nem reconstruir o personal a partir de texto.

Antes de uma execução futura, o GOAL deverá:

1. receber/adicionar a referência visual oficial aprovada sem alterar docs/avatar-design neste GOAL;
2. decidir se os 58 IDs extras de LOTE_6/LOTE_7 também entram no escopo, conforme docs/PENDENCIAS.md;
3. revisar as flags objetivas, as capas e os achados do inventário;
4. confirmar os IDs canônicos e os equipamentos de cada lote.

## Fonte e preservação

- Usar src/mock/exercises.ts#BASE_CATALOG_126 como escopo atual acordado e equipment do catálogo como requisito por exercício.
- Consultar o inventário JSON para os paths locais, sequências e estado do manifest. MOCK_VIDEOS não é fonte de disponibilidade ou aprovação.
- Preservar os dois vídeos approved (back_puxada_pulley, back_remada_baixa) e suas evidências de proveniência.
- Preservar as 10 sequências de cinco frames. Não as reescrever nem regenerar automaticamente.
- Para exercício sem vídeo approved e sem sequência de cinco frames a preservar, o alvo padrão é uma sequência coerente de três imagens: posição inicial, meio e posição final. A posição inicial é a candidata de capa.
- Tratar imagens legacy como disponibilidade técnica até revisão humana; não pressupor aprovação por haver dois arquivos.

## Consistência visual por sequência

Todas as imagens de uma sequência devem retratar o mesmo personal e manter:

- a mesma roupa, escolhida e fixada a partir da referência oficial aprovada;
- o mesmo cenário de academia, fundo, iluminação e paleta;
- câmera em ângulo 3/4, com distância, altura, orientação e enquadramento consistentes;
- o equipamento canônico do exercício, com montagem e acessórios corretos;
- pessoa, articulações, pegada, apoio, trajetória e posições biomecanicamente coerentes entre os três frames;
- proporção e resolução adequadas ao uso de galeria e leitura do movimento;
- nenhuma palavra, número, marca, logo, marca d'água, interface ou elemento promocional.

A mudança entre frames deve mostrar somente a progressão do movimento. Não mudar rosto, roupa, cenário, equipamento, lado de câmera ou escala da pessoa durante a sequência.

## Validação automática e aprovação

O validador futuro deve confirmar, pelo menos: ID e path canônicos; quantidade e ordem de frames; arquivos decodificáveis; dimensões/proporções consistentes; duplicatas exatas; correspondência de nome/equipamento declarados; ausência de texto/logo quando detectável; e que nenhum arquivo ou status approved foi substituído. Heurísticas visuais são sinais para revisão, não aprovação de anatomia ou biomecânica.

Cada saída precisa de revisão humana antes de ser ligada ao catálogo, manifest, CDN ou interface. A revisão deve conferir exercício e equipamento, anatomia/biomecânica, clareza/crop, identidade/roupa/cenário e escolha da capa. USABLE_AS_GALLERY_COVER é somente uma candidata; não concede status approved. Não promover draft nem alterar proveniência sem nova evidência e aprovação explícita.

Armazenar novas saídas em paths/versionamento novos, comparar com os hashes existentes e manter os assets aprovados intactos. Upload, CDN e atualização do manifest pertencem a uma etapa/GOAL separado com validação e autorização próprias.