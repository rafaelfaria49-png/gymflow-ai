---
name: gymflow-media-generation
description: Gerar e revisar sequências candidatas de exercícios GymFlow a partir do catálogo canônico e das referências oficiais, com limites de tentativas e aprovação humana separada da publicação no runtime.
---

# Contrato canônico de geração de mídia GymFlow

Use em um GOAL autorizado de geração/revisão de mídia GymFlow. Este contrato não autoriza geração, custos, upload, CDN ou integração por si só. A ferramenta pode variar entre agentes: use a ferramenta de imagem explicitamente autorizada/disponível e registre suas capacidades reais.

## Entrada e saída

INPUT obrigatório: exerciseId, nome, equipamento, executionSteps, personalReference, environmentReference. Confira exerciseId/nome/equipamento/passos em src/mock/exercises.ts#RUNTIME_CATALOG e o inventário atual; nunca invente IDs, acessórios ou exercícios substitutos. Referências devem apontar para arquivos acessíveis, preservados e identificados por hash quando possível. A referência de ambiente define estilo; o exercício retratado nela não substitui os executionSteps.

OUTPUT padrão: 01_inicial, 02_intermediaria, 03_final, em ordem do início real ao final real da amplitude. Defina e registre a direção do movimento antes de gerar. Convenção local padrão: PNG 1024×1536, sem texto, marcas, logos ou outras pessoas; um GOAL pode especificar outro formato. Produza em PILOT/STAGING fora de public e do runtime, com manifest isolado, referências e proveniência. 3 frames continuam sendo o padrão.

## Locks obrigatórios

| Regra | Contrato dentro de cada exercício |
| --- | --- |
| IDENTITY_LOCK | Mesmos rosto, cabelo, barba, proporções atléticas e roupa: camiseta cinza escura, shorts preto, tênis preto. Use a referência oficial, sem trocar o personal silenciosamente. |
| CAMERA_LOCK | Mesma posição/altura/perspectiva, lado do atleta, distância, escala aparente e crop entre fases. Entre exercícios o ângulo pode variar para mostrar a biomecânica. |
| ENVIRONMENT_LOCK | Parede cinza neutra, piso de borracha escuro, equipamentos pretos, iluminação neutra, academia limpa, sem marcas nem outras pessoas. Cenário e luz estáveis entre fases. |
| EQUIPMENT_LOCK | Mesmo chassi, acessórios, montagem, apoios, pivôs, alavancas, pegadores e dimensões aparentes. Movimento mecânico plausível sem encurtar peças, mudar pivôs, criar peças ou flutuar. |

Consulte GYMFLOW_PERSONAL_REFERENCE_INTAKE.md para paths e hashes oficiais. Se arquivo/identidade/roupa forem ausentes ou ambíguos, pare no gate de referência; não reconstrua o personal de texto. Preserve originais sem crop/retoque. Inspecione referências antes da chamada e novas saídas antes de selecionar.

Articulações que devem permanecer fixas precisam de coordenadas visuais consistentes. Para extensão de cotovelo, mantenha ombro, cotovelo e braço superior conforme a técnica; não compense um crop difícil movendo o corpo/câmera ou mudando comprimento aparente do braço. Mãos, pegadores e conexões precisam caber com margem e anatomia plausível.

## MIDPOINT_50_PERCENT_RULE

01 = início real; 02 = aproximadamente 50% da amplitude entre 01 e 03; 03 = final real. 02 deve ser claramente distinta dos dois extremos. Quando possível, gere 02 usando simultaneamente 01 + 03 como referências, com EQUIPMENT_LOCK e CAMERA_LOCK explícitos. Escolha como lock o frame que preserva a geometria correta; um frame defeituoso não deve impor seu defeito aos seguintes.

Compare obrigatoriamente 01 | 02 | 03 antes de selecionar: distance(01→02) deve ser visualmente semelhante a distance(02→03), pela rotação articular/mecânica, não só pela altura da mão. Não alegue medição clínica exata sem medição. Inspecione também detalhes ampliados de mãos, cotovelos, pivôs e barras: um ponto médio melhor com aparelho deformado deve ser rejeitado.

## Tentativas e TWO_FRAME_EXCEPTION

Por frame, no máximo 3 tentativas automáticas ao todo, contando a primeira geração. Registre o contador cumulativo; uma chamada que gerou uma nova saída conta mesmo se ela for descartada. Ao atingir o limite, HUMAN_REVIEW_GATE: pare sem resetar contador nem tentar novos prompts indefinidamente. Uma rodada extra exige autorização humana explícita, vinculada aos alvos e ao limite novo; registre separadamente attempt cumulativo e attempt da rodada autorizada. A autorização para um alvo não se estende a outros.

Se a intermediária continuar biomecanicamente ruim, deformar anatomia/equipamento ou repetir início/final após até 3 tentativas automáticas, marque MIDPOINT_FAILED_BOUNDED_ATTEMPTS e solicite revisão humana. Preserve a melhor existente quando uma nova saída não a superar claramente. Não escolha automaticamente uma saída pior ao esgotar o limite.

Somente com aprovação humana explícita para aquele exercício/lote, TWO_FRAME_EXCEPTION permite [01_inicial, 03_final]. Registre evidência, escopo, motivo e decisão no manifest. Marque 02 como EXCLUDED_FROM_FINAL_SEQUENCE, retire-a da lista final selecionada e preserve seu arquivo/hash/proveniência no histórico. Nunca apague a tentativa nem autoative a exceção. Falhas de 01 ou 03 não são resolvidas por esta exceção.


## DEFERRED_SEQUENCE_POLICY

Se 01 ou 03 continuarem inadequadas após bounded attempts, TWO_FRAME_EXCEPTION não resolve o problema. Preserve todas as tentativas e a proveniência; marque TECHNIQUE_SEQUENCE_STATUS=DEFERRED, DEFER_REASON=ENDPOINT_OR_BIOMECHANICS_NOT_RELIABLE e REGENERATION_REQUIRED_FUTURE=YES, sem selecionar uma técnica incompleta como sequência final.

Um frame correto pode permanecer somente COVER_CANDIDATE_ONLY (GALLERY_COVER_CANDIDATE_ONLY no manifest), sem aprovação runtime. Retire as fases inadequadas de FINAL_SELECTED; nunca invente uma sequência completa para preencher o catálogo. Novo round exige GOAL/autorização humana futura. Mantenha agentReview original e registre humanDecision separadamente.

## Inspeção e aprovação

Avalie IDENTITY_CONSISTENCY, CAMERA_CONSISTENCY, ANATOMY, EQUIPMENT, BIOMECHANICS e PHASE_DISTINCTION. Cada critério: PASS ou NEEDS_HUMAN_REVIEW; resultado CANDIDATE_OK somente com os seis PASS, caso contrário NEEDS_HUMAN_REVIEW. A validação estrutural e a inspeção do agente não concedem aprovação humana.

Nunca autoatribua APPROVED nem promova draft. Uma decisão humana pode aceitar uma ressalva sem converter o julgamento anterior do agente em PASS: preserve agentReview, adicione a decisão/caveat humana e seu escopo. HUMAN_APPROVED_PILOT_STANDARD / PILOT_VISUAL_STANDARD_ONLY aprova apenas o padrão do piloto; não aprova mídia runtime, publicação ou todas as futuras gerações. Cada lote futuro exige revisão própria.

## Proveniência e verificação

Por tentativa, preserve prompt, referências reais, número, source/output, motivo de rejeição ou escolha, candidate escolhido, modelo divulgado e hashes quando disponíveis. Prefira capturar SHA256 das referências antes da geração e do output depois; mantenha snapshots imutáveis. Se hashes históricos forem reconstruídos, identifique essa origem sem inventar captura no momento da chamada. Referência original e todos os outputs rejeitados permanecem intactos.

Se a ferramenta não revelar o modelo efetivo: MODEL_GENERATOR_EFFECTIVE=NOT_DISCLOSED_BY_TOOL. Não converta um modelo solicitado ou nome de ferramenta em modelo comprovadamente usado; não alegue controles de qualidade indisponíveis.

Valide IDs/equipamentos/passos, ordem e quantidade final (3, ou 2 com evidência humana explícita), hashes/decodificação/dimensões, duplicatas e integridade das referências. Gere contact sheet somente com frames finais selecionados, mostrando a exceção quando houver. Conte arquivos selecionados separadamente de tentativas e excluídos. Heurísticas visuais e checks de arquivos não certificam biomecânica.

## Preservação e publicação

Proibido sobrescrever mídia approved, promover draft automaticamente, usar mídia de outro exercício como fallback, inventar equipamento/ID, trocar o personal silenciosamente ou alterar CDN sem GOAL próprio. Preserve manifests ativos, public assets, vídeos e aprovações existentes; publicação/integração precisa de escopo e aprovação próprios.

Meça bytes do lote, PNGs selecionados e histórico antes de push. Não publique automaticamente commits pesados de tentativas. Para entrega documental compacta, leve fechamento, manifest final, referências necessárias, contact sheet final, metadados essenciais e este contrato; mantenha outputs grandes localmente com paths/hashes e plano posterior. A versão compacta precisa distinguir arquivos versionados de referências LOCAL_ONLY_NOT_VERSIONED, sem fingir que a mídia está no clone ou pronta para runtime.

O piloto de tríceps é o exemplo de referência: HUMAN_REVIEW_FINAL.md registra 9 sequências de 3 + máquina com 2 = 29 frames, francês aceito com ressalva. Essa decisão não pré-autoriza exceções em outros exercícios. Pare ao completar o lote/limite definido; não inicie outro grupo muscular sem pedido.
