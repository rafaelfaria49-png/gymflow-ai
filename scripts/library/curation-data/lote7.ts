import { Exercise } from '../../../src/types';

export const LOTE_7_EXPANSION: Exercise[] = [
  {
    id: 'back_puxador_articulado',
    name: 'Puxador Articulado Convergente',
    thumbnail: '💪 Puxador Articulado',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'forearms', 'shoulders'],
    equipment: 'Máquina de Puxador Articulado com Anilhas',
    level: 'intermediate',
    executionSteps: [
      'Ajuste a almofada de coxas para travar as pernas firmemente no assento.',
      'Segure as manoplas articuladas com pegada pronada ou neutra.',
      'Puxe as alavancas para baixo e para trás guiando os cotovelos em direção aos bolsos da calça.',
      'Retorne lentamente estendendo os braços e alongando o grande dorsal no topo.'
    ],
    postureTips: [
      'A trajetória convergente acompanha as fibras anatômicas do latíssimo sem forçar os ombros.',
      'Mantenha o peito aberto e não jogue o tronco para trás além de 15°.'
    ],
    breathing: 'Expire ao puxar as alavancas para baixo; inspire controlando a subida das cargas.',
    commonErrors: [
      'Usar impulso com a coluna lombar para arrancar o peso do topo.',
      'Deixar os ombros subirem desajeitadamente na descida das manoplas.'
    ],
    errorCorrections: [
      'Inicie o movimento deprimindo as escápulas antes de flexionar os cotovelos.',
      'Mantenha o tronco estável contra a almofada de fixação das pernas.'
    ],
    variations: ['Puxada Alta no Pulley', 'Barra Fixa'],
    substitutions: ['back_puxada_pulley', 'back_barra_fixa', 'back_puxada_triangulo'],
    safetyWarnings: [
      'Equilibre o peso das anilhas em ambos os lados.',
      'Não solte as manoplas bruscamente ao término da série.'
    ],
    restrictions: [
      'Mais ergonômico para os ombros que a puxada de barra reta por permitir rotação convergente.',
      'Em caso de dor anterior no ombro, utilize a pegada neutra.'
    ],
    substitutionsHint: 'Aparelho padrão em redes como Smart Fit e Bluefit. Se ocupado, substitua por Puxada Alta no Pulley com Barra ou Barra Fixa.',
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'forearms'],
    movementPatternIds: ['vertical_pull'],
    equipmentIds: ['articulated_lat_pulldown_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    searchTerms: ['puxador articulado', 'puxada articulada', 'articulated lat pulldown', 'puxada alta convergente', 'maquina puxada alta'],
    images: []
  },
  {
    id: 'back_puxador_articulado_unilateral',
    name: 'Puxada Articulada Unilateral',
    thumbnail: '⚡ Puxada Unilateral',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'forearms'],
    equipment: 'Máquina de Puxador Articulado',
    level: 'intermediate',
    executionSteps: [
      'Sente-se no aparelho segurando apenas uma manopla com o braço ativo estendido no topo.',
      'Com a outra mão, segure a almofada de apoio ou estrutura para ancorar o tronco.',
      'Puxe a alavanca para baixo mantendo o cotovelo colado ao corpo para contração do grande dorsal.',
      'Retorne controladamente sentindo o estiramento lateral da dorsal.'
    ],
    postureTips: [
      'O trabalho unilateral permite flexão lateral suave do tronco aumentando o encurtamento das fibras ilíacas do latíssimo.',
      'Evite torção excessiva da coluna torácica.'
    ],
    breathing: 'Expire ao puxar a manopla unilateral; inspire durante o retorno lento.',
    commonErrors: [
      'Girar todo o corpo para o lado para conseguir puxar mais carga.',
      'Fazer repetições curtas sem alongar a dorsal no ponto mais alto.'
    ],
    errorCorrections: [
      'Mantenha o quadril firme no assento e rotacione minimamente o tronco apenas no pico de contração.',
      'Estenda o braço por completo no topo sem perder a tensão.'
    ],
    variations: ['Puxada Pulley Unilateral', 'Remada Unilateral no Serrote'],
    substitutions: ['back_puxada_pulley', 'back_serrote', 'back_remada_baixa'],
    safetyWarnings: [
      'Apoie bem a perna sob a almofada para não ser erguido pelo peso.',
      'Use carga moderada para não descompensar a postura lateral.'
    ],
    restrictions: [
      'Excelente para corrigir assimetrias de força e desenvolvimento dorsal entre os lados.',
      'Sem contraindicações graves para os ombros.'
    ],
    substitutionsHint: 'Alternativa unilateral potente para puxada vertical. Substitutos: Puxada Alta Unilateral no Cabo ou Remada Serrote com Haltere.',
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'forearms'],
    movementPatternIds: ['vertical_pull'],
    equipmentIds: ['articulated_lat_pulldown_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'unilateral',
    bodyPosition: 'seated',
    searchTerms: ['puxada unilateral', 'puxador unilateral articulado', 'one arm lat pulldown', 'puxada articulada unilateral'],
    images: []
  },
  {
    id: 'back_remada_articulada_pronada',
    name: 'Remada Articulada Pegada Pronada',
    thumbnail: '🏋️ Remada Pronada Articulada',
    muscleGroup: 'back',
    secondaryMuscles: ['traps', 'shoulders', 'biceps', 'forearms'],
    equipment: 'Máquina de Remada Articulada (Plate Loaded)',
    level: 'intermediate',
    executionSteps: [
      'Ajuste a altura do banco para que as manoplas fiquem no nível do peito médio.',
      'Apoie o peito firme no encosto frontal e segure as manoplas com pegada pronada (palmas para baixo).',
      'Puxe as alavancas para trás abrindo os cotovelos a cerca de 60° em relação ao corpo.',
      'Aperte as escápulas uma contra a outra no ponto de máxima contração e retorne lentamente.'
    ],
    postureTips: [
      'A pegada pronada com cotovelos mais abertos enfatiza trapézio médio, romboides e deltoide posterior.',
      'Mantenha o peito sempre colado no apoio para neutralizar a exigência lombar.'
    ],
    breathing: 'Inspire ao deixar os pesos descerem; expire ao puxar as manoplas para trás.',
    commonErrors: [
      'Tirar o peito do estofado dando um tranco com as costas para trás.',
      'Encolher os ombros na direção das orelhas ao puxar.'
    ],
    errorCorrections: [
      'Mantenha o esterno encostado no apoio durante todas as repetições.',
      'Abaixe os ombros e foque na adução escapular.'
    ],
    variations: ['Remada Curvada com Barra', 'Remada Baixa com Barra Reta'],
    substitutions: ['back_remada_curvada', 'back_remada_baixa', 'back_remada_maquina'],
    safetyWarnings: [
      'Coloque anilhas de pesos iguais em cada braço mecânico.',
      'Não solte as alavancas bruscamente.'
    ],
    restrictions: [
      'Ideal para quem tem dor lombar crônica e não tolera remadas livres sem apoio.',
      'Pessoas com lesão labral posterior de ombro devem manter amplitude confortável.'
    ],
    substitutionsHint: 'Equipamento essencial de dorsal com apoio de peito. Substitutos: Remada Curvada com Barra ou Remada Baixa na Polia.',
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['traps', 'shoulders', 'biceps'],
    movementPatternIds: ['horizontal_pull'],
    equipmentIds: ['articulated_row_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    searchTerms: ['remada articulada pronada', 'remada pronada maquina', 'plate loaded row pronated', 'remada peito apoiado anilhas'],
    images: []
  },
  {
    id: 'back_remada_articulada_neutra',
    name: 'Remada Articulada Pegada Neutra',
    thumbnail: '⚡ Remada Neutra Articulada',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'forearms'],
    equipment: 'Máquina de Remada Articulada',
    level: 'intermediate',
    executionSteps: [
      'Ajuste o assento de modo que o peito fique confortável contra a almofada frontal.',
      'Segure as pegadas verticais/neutras (palmas voltadas uma para a outra).',
      'Puxe as alavancas para trás trazendo os cotovelos rentes ao tronco.',
      'Sinta a contração potente do grande dorsal e retorne lentamente até alongar as costas.'
    ],
    postureTips: [
      'A pegada neutra e cotovelos próximos às costelas direcionam o trabalho diretamente para as fibras do latíssimo do dorso.',
      'Excelente conforto para articulações dos punhos e cotovelos.'
    ],
    breathing: 'Expire na tração concêntrica; inspire no retorno excêntrico das alavancas.',
    commonErrors: [
      'Abrir os cotovelos para os lados perdendo o foco na dorsal.',
      'Balançar a cabeça para a frente e para trás.'
    ],
    errorCorrections: [
      'Raspe os braços nas laterais do tronco durante todo o trajeto.',
      'Mantenha a cervical alinhada olhando para o centro da máquina.'
    ],
    variations: ['Remada Baixa com Triângulo', 'Remada no Serrote'],
    substitutions: ['back_remada_baixa', 'back_serrote', 'back_remada_maquina'],
    safetyWarnings: [
      'Verifique se os pinos de regulagem do assento estão bem encaixados.',
      'Carregue as anilhas com cuidado.'
    ],
    restrictions: [
      'Muito segura para praticantes com problemas no manguito rotador ou cotovelos sensíveis.',
      'Apoio peitoral elimina compressão discal lombar.'
    ],
    substitutionsHint: 'Aparelho top para largura e densidade de dorsais. Se ocupado, substitua por Remada Baixa com Triângulo ou Serrote com Haltere.',
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'forearms'],
    movementPatternIds: ['horizontal_pull'],
    equipmentIds: ['articulated_row_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    searchTerms: ['remada articulada neutra', 'remada neutra maquina', 'plate loaded row neutral', 'remada articulada fechada'],
    images: []
  },
  {
    id: 'back_remada_peito_apoiado_halteres',
    name: 'Remada no Banco Inclinado com Halteres',
    thumbnail: '💪 Remada com Apoio Peito',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'traps', 'forearms'],
    equipment: 'Halteres e Banco Inclinado',
    level: 'intermediate',
    executionSteps: [
      'Ajuste o banco inclinado em 30° a 45° e deite-se de bruços com o peito apoiado no encosto.',
      'Segure um par de halteres com os braços estendidos para baixo.',
      'Puxe os halteres para cima e para trás dobrando os cotovelos e retraindo as escápulas.',
      'Desça os halteres lentamente controlando o peso até o alongamento completo dos braços.'
    ],
    postureTips: [
      'O apoio do peito no banco anula 100% da carga sobre as vértebras lombares, permitindo foco exclusivo nas costas.',
      'Mantenha o pescoço neutro em relação ao banco sem hiperestender a cabeça para cima.'
    ],
    breathing: 'Inspire descendo os halteres; expire puxando os cotovelos para o teto.',
    commonErrors: [
      'Descolar o tórax do banco para dar impulso na arrancada dos halteres.',
      'Encolher os ombros na subida.'
    ],
    errorCorrections: [
      'Mantenha o esterno colado no estofamento durante toda a repetição.',
      'Puxe os cotovelos para trás e aperte o meio das costas.'
    ],
    variations: ['Remada Cavalinho com Apoio', 'Remada Curvada com Barra'],
    substitutions: ['back_remada_cavalinho', 'back_remada_baixa', 'back_serrote'],
    safetyWarnings: [
      'Posicione os halteres no chão ao alcance das mãos antes de apoiar o corpo no banco inclinado.',
      'Use banco com travas de ângulo firmes.'
    ],
    restrictions: [
      'Exercício de primeira escolha para atletas ou alunos com histórico de hérnia de disco lombar ou dor facetária.',
      'Sem contraindicações importantes.'
    ],
    substitutionsHint: 'Excelente para quem precisa proteger a lombar em qualquer academia com banco regulável e halteres. Substitutos: Remada Baixa no Cabo ou Serrote.',
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'traps'],
    movementPatternIds: ['horizontal_pull'],
    equipmentIds: ['dumbbells', 'incline_bench'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'supported',
    searchTerms: ['remada banco inclinado', 'chest supported dumbbell row', 'remada peito apoiado', 'remada no banco 45'],
    images: []
  },
  {
    id: 'back_pullover_maquina',
    name: 'Pullover na Máquina',
    thumbnail: '🔥 Pullover na Máquina',
    muscleGroup: 'back',
    secondaryMuscles: ['chest', 'triceps', 'core'],
    equipment: 'Máquina de Pullover Articulada (Plate Loaded)',
    level: 'advanced',
    executionSteps: [
      'Sente-se no aparelho, apoie os cotovelos nas almofadas mecânicas e segure a barra superior.',
      'Prenda o cinto de segurança no assento se disponível.',
      'Puxe as almofadas com os cotovelos em arco amplo para frente e para baixo até a linha do abdômen.',
      'Retorne lentamente controlando a subida dos pesos até sentir forte estiramento no grande dorsal.'
    ],
    postureTips: [
      'A máquina mantém resistência em todo o arco de 180° (onde o haltere perde torque mecânico).',
      'Faça a força empurrando com os cotovelos e não puxando com as mãos.'
    ],
    breathing: 'Inspire ao deixar os braços subirem acima da cabeça; expire ao empurrar os cotovelos para baixo.',
    commonErrors: [
      'Descolar as costas do encosto arqueando a lombar excessivamente na subida dos braços.',
      'Fazer força nos punhos em vez de empurrar os cotovelos contra as almofadas.'
    ],
    errorCorrections: [
      'Mantenha a coluna firme contra o banco com abdômen acionado.',
      'Foque a pressão mental no tríceps distal/cotovelo contra o suporte.'
    ],
    variations: ['Pulldown com Braço Reto no Pulley', 'Pullover com Haltere'],
    substitutions: ['back_pulldown_braco_reto', 'chest_pullover_haltere', 'back_puxada_pulley'],
    safetyWarnings: [
      'Use o pedal de acionamento com os pés para trazer as almofadas antes de colocar os braços.',
      'Não solte o peso de uma vez.'
    ],
    restrictions: [
      'Contraindicado em pessoas com síndrome do impacto acromioclavicular severa ou lesão de SLAP no ombro.',
      'Ajuste o assento para amplitude sem pinçamento articular.'
    ],
    substitutionsHint: 'Aparelho lendário consagrado por Dorian Yates. Se a academia não possuir, substitua por Pulldown com Braço Reto na polia alta ou Pullover com Haltere.',
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['chest', 'triceps'],
    movementPatternIds: ['shoulder_extension'],
    equipmentIds: ['pullover_machine', 'weight_plates'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    searchTerms: ['pullover maquina', 'machine pullover', 'maquina pullover', 'dorian pullover', 'pullover articulado'],
    images: []
  },
  {
    id: 'back_remada_cavalinho_apoiada',
    name: 'Remada Cavalinho com Apoio no Peito',
    thumbnail: '⚡ Cavalinho com Apoio',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'traps', 'forearms'],
    equipment: 'Aparelho de Remada Cavalinho com Apoio de Peito',
    level: 'intermediate',
    executionSteps: [
      'Apoie o peito no estofado angulado e posicione os pés nas plataformas inferiores.',
      'Segure as manoplas pronadas ou neutras da alavanca com os braços estendidos.',
      'Puxe a carga em direção ao tronco flexionando os cotovelos e esmagando as escápulas no topo.',
      'Desça as anilhas de forma controlada até estender completamente os braços.'
    ],
    postureTips: [
      'Permite o ganho de massa e espessura do cavalinho tradicional com proteção lombar total pelo apoio torácico.',
      'Apoie o esterno firmemente sem permitir que o peito saia do banco.'
    ],
    breathing: 'Inspire ao descer os pesos; expire puxando as manoplas em direção às costelas.',
    commonErrors: [
      'Usar excesso de peso e levantar o peito dando tranco para puxar a alavanca.',
      'Fazer o movimento rápido sem segurar a contração no ponto mais alto.'
    ],
    errorCorrections: [
      'Mantenha o tórax colado à almofada durante todas as repetições.',
      'Faça uma pausa de 1 segundo no pico de contração.'
    ],
    variations: ['Remada Cavalinho Tradicional', 'Remada Articulada com Anilhas'],
    substitutions: ['back_remada_cavalinho', 'back_remada_curvada', 'back_remada_baixa'],
    safetyWarnings: [
      'Prenda as anilhas firmemente no pino de carga.',
      'Ajuste a altura da base dos pés para o seu tamanho.'
    ],
    restrictions: [
      'Excelente para pessoas com hérnia de disco que não podem fazer cavalinho livre.',
      'Sem contraindicações importantes.'
    ],
    substitutionsHint: 'Se o aparelho com apoio de peito não estiver disponível, faça Remada no Banco Inclinado com Halteres ou Remada Baixa.',
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'traps'],
    movementPatternIds: ['horizontal_pull'],
    equipmentIds: ['t_bar', 'flat_bench', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'supported',
    searchTerms: ['cavalinho com apoio', 'chest supported t bar row', 'remada t bar com apoio', 'cavalinho banco'],
    images: []
  },
  {
    id: 'back_puxada_articulada_invertida',
    name: 'Puxador Invertido Articulado',
    thumbnail: '💪 Puxador Invertido',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'forearms'],
    equipment: 'Máquina de Puxador Invertido Articulado',
    level: 'intermediate',
    executionSteps: [
      'Sente-se no aparelho e trave as coxas sob os rolos acolchoados.',
      'Segure as manoplas com pegada supinada (palmas voltadas para você).',
      'Puxe as alavancas para baixo até que as mãos fiquem na linha da clavícula/peito.',
      'Retorne controladamente estendendo os braços e alongando o grande dorsal.'
    ],
    postureTips: [
      'A pegada supinada favorece o recrutamento das fibras inferiores da grande dorsal e melhora o braço de momento do bíceps.',
      'Mantenha o peito aberto e cabeça reta.'
    ],
    breathing: 'Expire na puxada para baixo; inspire controlando a subida das alavancas.',
    commonErrors: [
      'Inclinar o tronco excessivamente para trás transformando em remada.',
      'Puxar mais forte com o braço dominante desalinhando o peso.'
    ],
    errorCorrections: [
      'Mantenha a coluna quase vertical com leve inclinação de 10° a 15°.',
      'Puxe de forma perfeitamente coordenada entre os dois braços.'
    ],
    variations: ['Puxada Supinada no Pulley', 'Barra Fixa Supinada'],
    substitutions: ['back_puxada_supinada', 'back_barra_fixa_supinada', 'back_puxada_pulley'],
    safetyWarnings: [
      'Confira se os pinos de peso estão bem colocados em ambos os lados.',
      'Não solte as manoplas bruscamente.'
    ],
    restrictions: [
      'Se sentir estresse na face medial do cotovelo, ajuste a pegada para neutra.',
      'Cuidado com amplitude exagerada no ombro caso sinta desconforto no manguito.'
    ],
    substitutionsHint: 'Ótima variação para puxada vertical com grande recrutamento de bíceps. Substitutos: Puxada Supinada no Pulley ou Barra Fixa Supinada.',
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'forearms'],
    movementPatternIds: ['vertical_pull'],
    equipmentIds: ['reverse_grip_pulldown_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    searchTerms: ['puxador invertido', 'reverse grip pulldown machine', 'puxada articulada supinada', 'puxada invertida maquina'],
    images: []
  },
  {
    id: 'back_superman_solo',
    name: 'Extensão Lombar no Solo (Superman)',
    thumbnail: '🧘 Superman no Solo',
    muscleGroup: 'back',
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: 'Colchonete / Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Deite-se de bruços no colchonete com braços estendidos à frente e pernas esticadas.',
      'Contraia os glúteos e os eretores da espinha elevando simultaneamente o peito e as coxas do solo.',
      'Segure a posição no topo por 1 a 2 segundos em contração isométrica segura.',
      'Desça suavemente até encostar novamente no colchonete e repita.'
    ],
    postureTips: [
      'Fortalecimento da musculatura paravertebral lombar e glúteos com kit zero em qualquer lugar.',
      'Olhe para o chão durante o exercício para não hiperextender a coluna cervical.'
    ],
    breathing: 'Expire ao elevar o peito e pernas do solo; inspire ao retornar ao colchonete.',
    commonErrors: [
      'Fazer trancos rápidos jogando a cabeça para trás.',
      'Prender a respiração durante a elevação.'
    ],
    errorCorrections: [
      'Suba de forma suave e contínua mantendo a cabeça alinhada.',
      'Mantenha a respiração fluida e cadenciada.'
    ],
    variations: ['Hiperextensão Lombar no Banco Romano', 'Prancha Abdominal'],
    substitutions: ['back_hiperextensao_lombar', 'glutes_ponte_solo', 'legs_stiff_halteres'],
    safetyWarnings: [
      'Use colchonete confortável para não machucar os ossos do quadril e costelas.',
      'Não force amplitudes que gerem pinçamento agudo na lombar.'
    ],
    restrictions: [
      'Excelente para reabilitação postural e reforço lombar.',
      'Pessoas com espondilolistese devem limitar a altura da elevação para evitar hiperextensão severa.'
    ],
    substitutionsHint: 'Kit zero para a lombar e glúteos. Substitutos: Hiperextensão no Banco Romano ou Ponte de Glúteos no solo.',
    primaryMuscleGroupId: 'lower_back',
    secondaryMuscleGroupIds: ['glutes', 'hamstrings'],
    movementPatternIds: ['trunk_extension'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'prone',
    searchTerms: ['superman', 'extensao lombar solo', 'superman exercicio', 'fortalecimento lombar solo'],
    images: []
  },
  {
    id: 'shoulder_desenvolvimento_articulado',
    name: 'Desenvolvimento Articulado de Ombros',
    thumbnail: '⚡ Desenvolvimento Articulado',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['triceps', 'traps'],
    equipment: 'Máquina de Desenvolvimento Articulado com Anilhas',
    level: 'intermediate',
    executionSteps: [
      'Ajuste o assento para que as manoplas fiquem na altura do topo dos ombros.',
      'Sente-se com a coluna totalmente apoiada no encosto e segure as alavancas.',
      'Empurre as manoplas para cima na trajetória convergente do aparelho até a extensão quase completa dos braços.',
      'Desça os braços lentamente sentindo o trabalho dos deltoides até o nível das orelhas.'
    ],
    postureTips: [
      'O movimento convergente alivia a pressão na bursa subacromial em comparação com a barra reta livre.',
      'Mantenha as escápulas coladas ao banco e o abdômen firme.'
    ],
    breathing: 'Expire ao empurrar as manoplas para cima; inspire na descida controlada.',
    commonErrors: [
      'Tirar a lombar do banco arqueando as costas para usar o peitoral superior.',
      'Bater as alavancas no final de cada repetição.'
    ],
    errorCorrections: [
      'Mantenha a coluna neutra e os pés cravados no piso.',
      'Controle a descida e inverta o movimento suavemente.'
    ],
    variations: ['Desenvolvimento com Halteres', 'Desenvolvimento Militar com Barra'],
    substitutions: ['shoulder_desenvolvimento_haltere', 'shoulder_desenvolvimento_maquina', 'shoulder_desenvolvimento_militar_barra'],
    safetyWarnings: [
      'Certifique-se de que as anilhas estão equilibradas em ambos os lados.',
      'Não bloqueie com força a articulação dos cotovelos no ápice.'
    ],
    restrictions: [
      'Mais tolerado por pessoas com histórico de lesão de ombro do que o desenvolvimento livre com barra.',
      'Ajuste o banco caso sinta pinçamento acromial.'
    ],
    substitutionsHint: 'Aparelho padrão ouro em academias brasileiras para ombros pesados. Substitutos: Desenvolvimento com Halteres ou na Máquina de Placas.',
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['triceps', 'traps'],
    movementPatternIds: ['vertical_push'],
    equipmentIds: ['articulated_shoulder_press_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    searchTerms: ['desenvolvimento articulado', 'articulated shoulder press', 'desenvolvimento anilhas', 'ombro articulado'],
    images: []
  },
  {
    id: 'shoulder_elevacao_lateral_maquina',
    name: 'Elevação Lateral na Máquina',
    thumbnail: '🦅 Elevação Lateral Máquina',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['traps'],
    equipment: 'Máquina de Elevação Lateral de Ombros',
    level: 'intermediate',
    executionSteps: [
      'Sente-se no aparelho e ajuste o banco de modo que os eixos de rotação da máquina coincidam com as articulações dos ombros.',
      'Apoie os braços contra as almofadas laterais com os cotovelos flexionados a cerca de 90°.',
      'Eleve os braços lateralmente até a altura dos ombros sentindo a contração do deltoide lateral.',
      'Retorne lentamente controlando a descida das placas.'
    ],
    postureTips: [
      'Isola o deltoide lateral sem exigir força de preensão manual (elimina fadiga de punho e antebraço).',
      'Não eleve os ombros em direção ao pescoço durante a abdução.'
    ],
    breathing: 'Expire ao elevar os braços; inspire na descida lenta e controlada.',
    commonErrors: [
      'Levantar os cotovelos acima da linha dos ombros provocando impacto no manguito.',
      'Fazer o movimento com trancos usando impulso da coluna.'
    ],
    errorCorrections: [
      'Pare na linha horizontal dos ombros (cerca de 90° de abdução).',
      'Mantenha o tronco colado ao banco e use apenas a força dos deltoides.'
    ],
    variations: ['Elevação Lateral com Halteres', 'Elevação Lateral na Polia Baixa'],
    substitutions: ['shoulder_elevecao_lateral', 'shoulder_elevacao_lateral_polia', 'shoulder_desenvolvimento_haltere'],
    safetyWarnings: [
      'Ajuste o assento com precisão para seu tamanho antes de iniciar.',
      'Não solte o peso de uma vez.'
    ],
    restrictions: [
      'Excelente para quem tem tendinite nos punhos e não consegue segurar halteres pesados.',
      'Pare caso sinta dor aguda no topo do ombro.'
    ],
    substitutionsHint: 'Máquina de isolamento lateral muito procurada. Se ocupada, faça Elevação Lateral com Halteres ou na Polia Baixa.',
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['traps'],
    movementPatternIds: ['shoulder_abduction'],
    equipmentIds: ['shoulder_press_machine'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    searchTerms: ['elevacao lateral maquina', 'maquina de elevacao lateral', 'lateral raise machine', 'ombro maquina lateral'],
    images: []
  },
  {
    id: 'shoulder_elevacao_lateral_inclinada',
    name: 'Elevação Lateral no Banco Inclinado',
    thumbnail: '💪 Elevação Inclinada',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['traps'],
    equipment: 'Halteres e Banco Inclinado',
    level: 'intermediate',
    executionSteps: [
      'Ajuste um banco em inclinação de cerca de 60° a 70° e deite-se de lado com o quadril e tronco apoiados.',
      'Segure um haltere com o braço de cima estendido na frente do corpo.',
      'Eleve o braço lateralmente até a linha do ombro mantendo leve flexão fixa no cotovelo.',
      'Desça o haltere controladamente até próximo da coxa sentindo o alongamento do deltoide lateral.'
    ],
    postureTips: [
      'A inclinação do tronco altera o perfil de resistência colocando maior sobrecarga na fase inicial e média da abdução.',
      'Mantenha o polegar levemente apontado para o teto.'
    ],
    breathing: 'Expire na subida do haltere; inspire na descida controlada.',
    commonErrors: [
      'Girar o tronco para trás para conseguir erguer o haltere.',
      'Lançar o braço com velocidade excessiva.'
    ],
    errorCorrections: [
      'Mantenha o peito de lado perpendicular ao solo.',
      'Execute repetições lentas com cadência de 2 segundos de descida.'
    ],
    variations: ['Elevação Lateral em Pé com Halteres', 'Elevação Lateral na Polia'],
    substitutions: ['shoulder_elevecao_lateral', 'shoulder_elevacao_lateral_polia', 'shoulder_desenvolvimento_haltere'],
    safetyWarnings: [
      'Utilize halteres leves a moderados; a alavanca mecânica fica muito desafiadora nesta posição.',
      'Não despenque o braço no final.'
    ],
    restrictions: [
      'Ótima variação para hipertrofia sem sobrecarregar o trapézio superior.',
      'Evite se houver dor aguda na articulação acromioclavicular.'
    ],
    substitutionsHint: 'Excelente para isolamento extremo do deltoide lateral com haltere. Substitutos: Elevação Lateral Tradicional ou na Polia Baixa.',
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['traps'],
    movementPatternIds: ['shoulder_abduction'],
    equipmentIds: ['dumbbells', 'incline_bench'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'lying',
    searchTerms: ['elevacao lateral inclinada', 'incline lateral raise', 'elevacao lateral no banco', 'lateral deitada banco'],
    images: []
  },
  {
    id: 'shoulder_elevacao_lateral_cabo_unilateral',
    name: 'Elevação Lateral Unilateral no Cabo',
    thumbnail: '⚡ Lateral Unilateral Cabo',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['traps'],
    equipment: 'Polia Baixa',
    level: 'intermediate',
    executionSteps: [
      'Posicione a polia na altura do joelho ou tornozelo e segure o pegador individual.',
      'Fique de lado para a torre de cabos com o cabo passando por trás do tronco (ou pela frente).',
      'Eleve o braço lateralmente até a altura do ombro mantendo tensão contínua das placas.',
      'Retorne de forma suave sem encostar o peso no bloco.'
    ],
    postureTips: [
      'O cabo entrega torque e tensão máxima logo no início da abdução onde o haltere comum não tem resistência.',
      'Incline o corpo ligeiramente para o lado oposto segurando na torre para aumentar o arco de movimento.'
    ],
    breathing: 'Expire ao abduzir o braço; inspire ao retornar o cabo de forma controlada.',
    commonErrors: [
      'Usar impulso com o quadril ou coluna para puxar a carga.',
      'Subir a mão acima da linha do ombro gerando pinçamento.'
    ],
    errorCorrections: [
      'Mantenha o tronco firme e imóvel.',
      'Pare na linha horizontal de 90° de abdução.'
    ],
    variations: ['Elevação Lateral com Halteres', 'Elevação Lateral na Máquina'],
    substitutions: ['shoulder_elevacao_lateral_polia', 'shoulder_elevecao_lateral', 'shoulder_desenvolvimento_haltere'],
    safetyWarnings: [
      'Verifique se o mosquetão do pegador está bem rosqueado.',
      'Use carga moderada priorizando a forma técnica.'
    ],
    restrictions: [
      'Excelente para pessoas com dores no manguito rotador devido à suavidade da resistência do cabo.',
      'Mantenha o punho reto e sem torção.'
    ],
    substitutionsHint: 'Exercício rei de deltoide lateral em polia. Substitutos: Elevação Lateral com Haltere ou Elevação Lateral na Máquina.',
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['traps'],
    movementPatternIds: ['shoulder_abduction'],
    equipmentIds: ['low_cable_station'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    searchTerms: ['elevacao lateral cabo unilateral', 'cable lateral raise unilateral', 'lateral no cabo por tras', 'elevacao lateral polia baixa'],
    images: []
  },
  {
    id: 'shoulder_crucifixo_inverso_halteres_banco',
    name: 'Crucifixo Invertido com Halteres no Banco Inclinado',
    thumbnail: '🦅 Crucifixo Invertido Banco',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['back', 'traps'],
    equipment: 'Halteres e Banco Inclinado',
    level: 'intermediate',
    executionSteps: [
      'Ajuste o banco inclinado em 30° a 45° e deite-se de bruços com o peito apoiado no encosto.',
      'Segure um par de halteres com os braços estendidos abaixo do peito e palmas voltadas uma para a outra.',
      'Abra os braços lateralmente em arco até a linha dos ombros contraindo os deltoides posteriores.',
      'Desça os halteres lentamente até a posição inicial sem relaxar a musculatura.'
    ],
    postureTips: [
      'O apoio do peito no banco impede qualquer roubo ou balanço com o tronco.',
      'Mantenha uma ligeira flexão fixa nos cotovelos durante todo o arco.'
    ],
    breathing: 'Expire na abertura dos braços; inspire na descida lenta dos halteres.',
    commonErrors: [
      'Puxar os cotovelos para trás como se fosse uma remada em vez de abrir os braços em arco.',
      'Levantar a cabeça forçando a coluna cervical.'
    ],
    errorCorrections: [
      'Foque em afastar as mãos para os lados e não em puxar para cima.',
      'Olhe para o chão mantendo o pescoço alinhado com o banco.'
    ],
    variations: ['Crucifixo Invertido no Peck Deck', 'Face Pull na Polia'],
    substitutions: ['shoulder_crucifixo_inverso_maquina', 'shoulder_face_pull', 'shoulder_elevecao_posterior'],
    safetyWarnings: [
      'Use halteres com pesos moderados para não sobrecarregar os pequenos tendões do deltoide posterior.',
      'Mantenha pegada firme.'
    ],
    restrictions: [
      'Excelente escolha para reabilitação postural e reforço de romboides.',
      'Sem contraindicações graves.'
    ],
    substitutionsHint: 'Isolamento de posterior de ombro livre com apoio de peito. Substitutos: Crucifixo Invertido no Peck Deck ou Face Pull.',
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['back', 'traps'],
    movementPatternIds: ['horizontal_pull'],
    equipmentIds: ['dumbbells', 'incline_bench'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'supported',
    searchTerms: ['crucifixo invertido banco inclinado', 'prone incline rear delt fly', 'posterior de ombro no banco', 'crucifixo inverso haltere'],
    images: []
  },
  {
    id: 'shoulder_desenvolvimento_smith',
    name: 'Desenvolvimento Militar no Smith',
    thumbnail: '🏋️ Desenvolvimento no Smith',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['triceps', 'traps'],
    equipment: 'Máquina Smith e Banco com Encosto',
    level: 'intermediate',
    executionSteps: [
      'Posicione um banco com encosto vertical de 75° a 85° sob a barra da máquina Smith.',
      'Sente-se com as costas apoiadas e segure a barra com pegada ligeiramente mais larga que os ombros.',
      'Destrave a barra do Smith e desça controladamente até a altura do queixo ou fúrcula esternal.',
      'Empurre a barra verticalmente estendendo os braços com força pela contração dos deltoides.'
    ],
    postureTips: [
      'A barra guiada do Smith elimina a necessidade de estabilizar o peso no plano anteroposterior.',
      'Mantenha as escápulas aduzidas e o peito estufado.'
    ],
    breathing: 'Inspire na descida controlada da barra; expire ao empurrar para cima.',
    commonErrors: [
      'Descer a barra atrás da nuca sobrecarregando a articulação glenoumeral.',
      'Arquear a lombar descolando as costas do encosto do banco.'
    ],
    errorCorrections: [
      'Desça a barra sempre à frente do rosto na linha do queixo.',
      'Mantenha a lombar firme contra o apoio.'
    ],
    variations: ['Desenvolvimento com Halteres', 'Desenvolvimento Militar Livre'],
    substitutions: ['shoulder_desenvolvimento_haltere', 'shoulder_desenvolvimento_militar_barra', 'shoulder_desenvolvimento_maquina'],
    safetyWarnings: [
      'Regule os batentes mecânicos de segurança do Smith ligeiramente abaixo do queixo.',
      'Gire os punhos com firmeza para travar os ganchos ao final da série.'
    ],
    restrictions: [
      'Muito seguro para quem treina sozinho sem parceiro de treino para auxiliar a erguer os pesos.',
      'Em caso de síndrome do impacto, limite a descida até 90° de cotovelo.'
    ],
    substitutionsHint: 'Excelente opção para ombros pesados e seguros. Substitutos: Desenvolvimento com Halteres ou Desenvolvimento na Máquina.',
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['triceps', 'traps'],
    movementPatternIds: ['vertical_push'],
    equipmentIds: ['smith_machine', 'upright_bench', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    searchTerms: ['desenvolvimento smith', 'militar no smith', 'overhead press smith', 'desenvolvimento barra guiada'],
    images: []
  },
  {
    id: 'shoulder_elevacao_frontal_anilha',
    name: 'Elevação Frontal com Anilha',
    thumbnail: '⚡ Frontal com Anilha',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['chest', 'traps'],
    equipment: 'Anilhas de Peso',
    level: 'beginner',
    executionSteps: [
      'Fique em pé com postura ereta e segure uma anilha com ambas as mãos nas posições de 9h e 3h.',
      'Mantenha os braços estendidos à frente das coxas com leve semiflexão nos cotovelos.',
      'Eleve a anilha diretamente à frente até a linha dos olhos.',
      'Desça a anilha de forma lenta e cadenciada até próximo das coxas sem encostar.'
    ],
    postureTips: [
      'A pegada neutra na anilha alivia a rotação interna dos punhos e do ombro.',
      'Mantenha o abdômen contraído para evitar balanço do tronco.'
    ],
    breathing: 'Expire ao elevar a anilha à frente dos olhos; inspire ao retornar à posição inicial.',
    commonErrors: [
      'Jogar o tronco para trás (gangorra) para subir a anilha.',
      'Elevar a anilha muito acima da linha da cabeça forçando o trapézio em vez do deltoide.'
    ],
    errorCorrections: [
      'Mantenha o tronco ereto e estável com pernas semiflexionadas.',
      'Pare na linha horizontal dos olhos mantendo foco no deltoide anterior.'
    ],
    variations: ['Elevação Frontal com Halteres', 'Elevação Frontal com Barra'],
    substitutions: ['shoulder_elevacao_frontal_halteres', 'shoulder_desenvolvimento_haltere', 'chest_supino_inclinado_haltere'],
    safetyWarnings: [
      'Segure a anilha com as duas mãos firmes para evitar que escorregue das mãos.',
      'Não solte a anilha no chão sem controle.'
    ],
    restrictions: [
      'Simples e seguro para qualquer nível de praticante.',
      'Evite se houver tendinite aguda na cabeça longa do bíceps.'
    ],
    substitutionsHint: 'Exercício acessível e clássico com uma anilha comum de academia. Substitutos: Elevação Frontal com Halteres ou com Barra.',
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['chest'],
    movementPatternIds: ['shoulder_flexion'],
    equipmentIds: ['weight_plates'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    searchTerms: ['elevacao frontal anilha', 'plate front raise', 'frontal anilha', 'ombro anilha'],
    images: []
  },
  {
    id: 'biceps_rosca_bayesian',
    name: 'Rosca Bayesian no Cabo (Polia Baixa)',
    thumbnail: '🔥 Rosca Bayesian',
    muscleGroup: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'Polia Baixa e Pegador Individual',
    level: 'advanced',
    executionSteps: [
      'Conecte um pegador individual na polia baixa e fique de costas para a torre de cabos.',
      'Dê um passo à frente com base dividida permitindo que o braço seja tracionado para trás do corpo em estiramento.',
      'Flexione o cotovelo levando a mão em direção ao ombro mantendo o cotovelo atrás da linha do tronco.',
      'Estenda o braço lentamente resistindo à tração contínua do cabo até sentir o estiramento máximo.'
    ],
    postureTips: [
      'A posição de hiperextensão do ombro coloca a cabeça longa do bíceps sob estiramento passivo extremo.',
      'Mantenha o cotovelo fixo apontado para trás e para baixo durante toda a repetição.'
    ],
    breathing: 'Expire ao flexionar o cotovelo contraindo o bíceps; inspire no retorno lento ao estiramento.',
    commonErrors: [
      'Puxar o cotovelo para a frente durante a flexão anulando o estiramento da cabeça longa.',
      'Inclinar o tronco para a frente e para trás para puxar o peso.'
    ],
    errorCorrections: [
      'Trave o braço para trás e mova estritamente a articulação do cotovelo.',
      'Mantenha o tronco estável e firme com o abdômen contraído.'
    ],
    variations: ['Rosca no Banco Inclinado com Halteres', 'Rosca na Polia Baixa'],
    substitutions: ['biceps_rosca_inclinada', 'biceps_rosca_polia', 'biceps_rosca_direta'],
    safetyWarnings: [
      'Comece com cargas leves para adaptar a inserção bicipital ao estiramento sob tensão contínua.',
      'Não dê solavancos no ponto mais baixo de estiramento.'
    ],
    restrictions: [
      'Contraindicado em pessoas com tendinopatia bicipital proximal ou lesão SLAP em fase ativa.',
      'Respeite o limite confortável de estiramento articular do ombro.'
    ],
    substitutionsHint: 'Exercício padrão moderno para a cabeça longa do bíceps. Substitutos: Rosca no Banco Inclinado com Halteres ou Rosca Direta.',
    primaryMuscleGroupId: 'biceps',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['low_cable_station'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    searchTerms: ['rosca bayesian', 'bayesian curl', 'rosca no cabo de costas', 'rosca polia estiramento', 'biceps bayesian'],
    images: []
  },
  {
    id: 'biceps_rosca_aranha',
    name: 'Rosca Aranha no Banco Inclinado (Spider Curl)',
    thumbnail: '🕷️ Rosca Aranha',
    muscleGroup: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'Barra W (EZ) e Banco Inclinado',
    level: 'intermediate',
    executionSteps: [
      'Ajuste o banco inclinado em 45° e deite-se de bruços com o peito apoiado na parte superior do encosto.',
      'Deixe os braços suspensos na vertical segurando a barra W com pegada supinada.',
      'Flexione os cotovelos erguendo a barra em arco em direção à testa sem mover os braços da vertical.',
      'Aperte os bíceps no pico de encurtamento e desça a barra de forma lenta e controlada.'
    ],
    postureTips: [
      'Com os ombros fletidos à frente do tronco, a cabeça curta do bíceps atinge encurtamento máximo e isolamento absoluto.',
      'Elimina 100% de qualquer possibilidade de balanço ou impulso corporal.'
    ],
    breathing: 'Expire ao flexionar os cotovelos contraindo os bíceps; inspire na descida cadenciada.',
    commonErrors: [
      'Puxar os cotovelos para trás ao longo do banco transformando em remada.',
      'Balançar a cabeça para cima ao flexionar os braços.'
    ],
    errorCorrections: [
      'Mantenha os braços rigorosamente perpendiculares ao solo.',
      'Mantenha o peito firme no apoio e pescoço alinhado.'
    ],
    variations: ['Rosca Scott com Barra W', 'Rosca Concentrada com Haltere'],
    substitutions: ['biceps_rosca_scott', 'biceps_rosca_concentrada', 'biceps_rosca_direta'],
    safetyWarnings: [
      'Use travas nas anilhas da barra W.',
      'Coloque a barra em um suporte próximo ou alcance-a com cuidado antes de deitar no banco.'
    ],
    restrictions: [
      'Excelente opção para quem quer treinar bíceps pesado sem nenhuma sobrecarga na coluna lombar.',
      'Sem contraindicações relevantes.'
    ],
    substitutionsHint: 'Excelente para pico de contração de bíceps com banco regulável e barra W. Substitutos: Rosca Scott ou Rosca Concentrada.',
    primaryMuscleGroupId: 'biceps',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['ez_bar', 'incline_bench', 'weight_plates'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'supported',
    searchTerms: ['rosca aranha', 'spider curl', 'rosca spider', 'biceps no banco inclinado de brucos'],
    images: []
  },
  {
    id: 'biceps_rosca_duplo_cabo',
    name: 'Rosca Dupla na Polia Alta (Hércules)',
    thumbnail: '💪 Rosca Hércules',
    muscleGroup: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'Crossover (Polias Altas)',
    level: 'intermediate',
    executionSteps: [
      'Fique no centro do crossover com as polias ajustadas acima da altura da cabeça.',
      'Segure os pegadores individuais com os braços abertos horizontalmente em cruz.',
      'Flexione os cotovelos puxando as manoplas simultaneamente em direção às orelhas (pose de duplo bíceps).',
      'Segure o pico de contração por 1 segundo e estenda os braços controlando o retorno dos cabos.'
    ],
    postureTips: [
      'Coloca o ombro em abdução a 90° permitindo contração de pico perfeita da cabeça curta do bíceps.',
      'Mantenha os cotovelos altos alinhados com os ombros durante toda a repetição.'
    ],
    breathing: 'Expire ao puxar as manoplas para as orelhas; inspire retornando os braços à posição de cruz.',
    commonErrors: [
      'Deixar os cotovelos caírem para baixo durante a puxada.',
      'Balançar o tronco para a frente e para trás para mover o peso.'
    ],
    errorCorrections: [
      'Mantenha os cotovelos congelados na altura dos ombros.',
      'Fique no centro exato do aparelho com postura ereta e abdômen firme.'
    ],
    variations: ['Rosca Concentrada com Haltere', 'Rosca na Polia Baixa'],
    substitutions: ['biceps_rosca_concentrada', 'biceps_rosca_polia', 'biceps_rosca_scott'],
    safetyWarnings: [
      'Selecione cargas iguais em ambas as torres de placas.',
      'Solte os pegadores um a um com cuidado ao final.'
    ],
    restrictions: [
      'Pessoas com dor na articulação acromioclavicular devem ajustar a altura das polias para nível confortável.',
      'Excelente para definição e pico muscular.'
    ],
    substitutionsHint: 'A clássica pose do Hércules em polias cruzadas. Se o crossover estiver ocupado, substitua por Rosca Concentrada com Haltere ou Rosca Scott.',
    primaryMuscleGroupId: 'biceps',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['cable_crossover'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    searchTerms: ['rosca hercules', 'rosca dupla polia alta', 'overhead cable curl', 'rosca duplo biceps', 'crossover biceps'],
    images: []
  },
  {
    id: 'biceps_rosca_punho_barra',
    name: 'Flexão de Punho com Barra no Banco (Antebraço)',
    thumbnail: '✊ Rosca Punho',
    muscleGroup: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'Barra e Banco Reto',
    level: 'beginner',
    executionSteps: [
      'Ajoelhe-se em frente ao banco reto e apoie os antebraços no estofamento com as mãos para fora da borda.',
      'Segure a barra com pegada supinada (palmas para cima) e punhos em extensão neutra.',
      'Desça a barra abrindo levemente os dedos para permitir alongamento completo dos flexores do antebraço.',
      'Feche os dedos e flexione os punhos para cima erguendo a barra em contração máxima.'
    ],
    postureTips: [
      'Isola especificamente os músculos flexores superficiais e profundos dos dedos e do carpo.',
      'Mantenha os antebraços firmemente colados ao banco durante todo o exercício.'
    ],
    breathing: 'Expire ao flexionar os punhos para cima; inspire na descida lenta da barra.',
    commonErrors: [
      'Levantar os cotovelos do banco para ajudar a subir a barra.',
      'Fazer movimentos rápidos e bruscos sob carga pesada.'
    ],
    errorCorrections: [
      'Mantenha os braços colados no banco movendo exclusivamente a articulação do punho.',
      'Utilize cadência controlada e amplitude ampla.'
    ],
    variations: ['Flexão de Punho com Halteres', 'Rosca Punho Inversa'],
    substitutions: ['biceps_rosca_inversa', 'biceps_rosca_martelo', 'functional_farmer_walk'],
    safetyWarnings: [
      'Não use cargas excessivas; a articulação do punho é delicada e exige progressão gradual.',
      'Use anilhas bem presas com presilhas.'
    ],
    restrictions: [
      'Contraindicado em pessoas com síndrome do túnel do carpo ativa ou tendinite flexora aguda.',
      'Pare caso sinta formigamento nas pontas dos dedos.'
    ],
    substitutionsHint: 'Exercício clássico de antebraço para pegada firme e espessura. Substitutos: Rosca Inversa com Barra ou Rosca Martelo.',
    primaryMuscleGroupId: 'forearms',
    secondaryMuscleGroupIds: ['biceps'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['barbell', 'flat_bench', 'weight_plates'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'supported',
    searchTerms: ['rosca punho', 'wrist curl', 'flexao de punho', 'antebraco barra banco', 'rosca punho barra'],
    images: []
  },
  {
    id: 'biceps_rosca_punho_inversa_barra',
    name: 'Extensão de Punho com Barra (Antebraço)',
    thumbnail: '✊ Extensão de Punho',
    muscleGroup: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'Barra e Banco Reto',
    level: 'beginner',
    executionSteps: [
      'Apoie os antebraços no banco reto com as palmas voltadas para baixo (pegada pronada).',
      'Deixe as mãos projetadas para fora da borda do banco segurando a barra.',
      'Desça a barra flexionando os punhos para baixo até sentir alongamento nos extensores.',
      'Estenda os punhos para cima contraindo os músculos extensores do antebraço.'
    ],
    postureTips: [
      'Desenvolve a musculatura da parte superior do antebraço e protege contra epicondilite lateral (cotovelo de tenista).',
      'Mantenha os antebraços imóveis apoiados no banco.'
    ],
    breathing: 'Expire ao estender os punhos para cima; inspire na descida controlada.',
    commonErrors: [
      'Tentar erguer a barra com os cotovelos ou ombros.',
      'Usar carga muito alta e perder a amplitude superior.'
    ],
    errorCorrections: [
      'Mantenha apenas os punhos articulando livremente.',
      'Use uma barra leve ou barra vazia para aperfeiçoar a contração.'
    ],
    variations: ['Extensão de Punho com Halteres', 'Rosca Inversa em Pé'],
    substitutions: ['biceps_rosca_inversa', 'biceps_rosca_martelo', 'functional_farmer_walk'],
    safetyWarnings: [
      'Os extensores do carpo respondem melhor a cargas leves e repetições mais altas.',
      'Evite trancos bruscos.'
    ],
    restrictions: [
      'Pessoas com epicondilite lateral ativa devem consultar fisioterapeuta antes de realizar.',
      'Mantenha o punho em linha com os ossos do antebraço.'
    ],
    substitutionsHint: 'Fortalecimento da porção extensora do antebraço. Substitutos: Rosca Inversa com Barra W ou Rosca Martelo com Halteres.',
    primaryMuscleGroupId: 'forearms',
    secondaryMuscleGroupIds: ['biceps'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['barbell', 'flat_bench', 'weight_plates'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'supported',
    searchTerms: ['extensao de punho', 'reverse wrist curl', 'rosca punho inversa', 'antebraco pronado'],
    images: []
  },
  {
    id: 'triceps_testa_cabo',
    name: 'Tríceps Testa no Cabo com Corda',
    thumbnail: '⚡ Tríceps Testa no Cabo',
    muscleGroup: 'triceps',
    secondaryMuscles: [],
    equipment: 'Polia Baixa, Banco Reto e Corda',
    level: 'intermediate',
    executionSteps: [
      'Coloque um banco reto próximo à polia baixa conectada com a corda.',
      'Deite-se no banco com a cabeça voltada para a torre e segure as extremidades da corda atrás da cabeça.',
      'Mantenha os cotovelos fixos apontados para o teto.',
      'Estenda os cotovelos puxando a corda para cima e abrindo as pontas no pico de contração.',
      'Retorne de forma controlada flexionando os braços sem mover a posição dos cotovelos.'
    ],
    postureTips: [
      'A tensão contínua do cabo protege a articulação do cotovelo do impacto de pico que ocorre com pesos livres.',
      'Ao estender os braços, afaste as pontas da corda para aumentar o encurtamento da cabeça lateral do tríceps.'
    ],
    breathing: 'Expire ao estender os braços esticando a corda; inspire na descida suave.',
    commonErrors: [
      'Deixar os cotovelos abrirem excessivamente para os lados.',
      'Balançar os braços para frente e para trás para usar o grande dorsal.'
    ],
    errorCorrections: [
      'Mantenha os cotovelos paralelos e apontados verticalmente para o teto.',
      'Mova exclusivamente os antebraços.'
    ],
    variations: ['Tríceps Testa com Barra W', 'Tríceps Francês na Polia'],
    substitutions: ['triceps_testa', 'triceps_polia_corda', 'triceps_frances_corda_polia'],
    safetyWarnings: [
      'Posicione o banco a uma distância segura da torre.',
      'Não solte a corda bruscamente ao término.'
    ],
    restrictions: [
      'Muito mais gentil com os cotovelos do que a barra W para praticantes com tendinopatia tricipital crônica.',
      'Sem restrições graves.'
    ],
    substitutionsHint: 'Excelente alternativa ao testa com barra para quem sente estalos nos cotovelos. Substitutos: Tríceps Testa com Barra W ou Tríceps Corda no Pulley.',
    primaryMuscleGroupId: 'triceps',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['elbow_extension'],
    equipmentIds: ['low_cable_station', 'flat_bench', 'rope_attachment'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    searchTerms: ['triceps testa cabo', 'cable skull crusher', 'testa na polia', 'triceps testa com corda'],
    images: []
  },
  {
    id: 'triceps_frances_unilateral_cabo',
    name: 'Tríceps Francês Unilateral no Cabo',
    thumbnail: '💪 Francês Unilateral Cabo',
    muscleGroup: 'triceps',
    secondaryMuscles: [],
    equipment: 'Polia Baixa',
    level: 'intermediate',
    executionSteps: [
      'Fique de costas para a polia baixa segurando a manopla individual com uma mão atrás da cabeça.',
      'Mantenha o cotovelo apontado verticalmente para cima próximo à orelha.',
      'Estenda o braço para cima e para frente em direção ao teto contraindo o tríceps.',
      'Retorne lentamente até o estiramento máximo da cabeça longa atrás da nuca.'
    ],
    postureTips: [
      'O trabalho unilateral permite encontrar a linha de puxada mais confortável para o ombro e cotovelo.',
      'Mantenha o tronco estável e olhar à frente com abdômen firme.'
    ],
    breathing: 'Expire ao estender o cotovelo para cima; inspire na descida controlada.',
    commonErrors: [
      'Arquear a coluna lombar para ajudar a empurrar a carga.',
      'Deixar o cotovelo cair para frente perdendo a posição elevada.'
    ],
    errorCorrections: [
      'Apoie a outra mão nas costelas para verificar a estabilidade do tronco.',
      'Mantenha o cotovelo alto apontado para o teto durante todo o percurso.'
    ],
    variations: ['Tríceps Francês com Haltere', 'Tríceps na Polia com Corda'],
    substitutions: ['triceps_frances_haltere', 'triceps_polia_corda', 'triceps_testa'],
    safetyWarnings: [
      'Cuidado com a proximidade do cabo ao passar atrás da cabeça.',
      'Comece com cargas leves para calibrar a postura.'
    ],
    restrictions: [
      'Excelente para corrigir assimetrias de força e volume entre os tríceps.',
      'Evite caso haja limitação severa de elevação de braço por dor no ombro.'
    ],
    substitutionsHint: 'Isolamento com alongamento máximo de tríceps. Substitutos: Tríceps Francês com Haltere ou Tríceps Polia com Corda.',
    primaryMuscleGroupId: 'triceps',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['elbow_extension'],
    equipmentIds: ['low_cable_station'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    searchTerms: ['triceps frances unilateral cabo', 'one arm cable overhead triceps', 'frances no cabo unilateral', 'triceps polia unilateral'],
    images: []
  },
  {
    id: 'triceps_jm_press',
    name: 'Tríceps JM Press com Barra',
    thumbnail: '⚡ JM Press',
    muscleGroup: 'triceps',
    secondaryMuscles: ['chest', 'shoulders'],
    equipment: 'Barra, Banco Reto e Anilhas',
    level: 'advanced',
    executionSteps: [
      'Deite-se no banco reto segurando a barra com pegada na largura dos ombros.',
      'Retire a barra do suporte mantendo os braços na vertical sobre o peito.',
      'Desça a barra em linha reta em direção à clavícula/pescoço flexionando os cotovelos e deixando-os apontarem ligeiramente à frente e para fora a 45°.',
      'Empurre a barra de volta com explosão estendendo os cotovelos pela ação pura do tríceps.'
    ],
    postureTips: [
      'Movimento híbrido que combina o supino fechado com o tríceps testa consagrado por JM Blakley no powerlifting.',
      'Permite sobrecarga de peso muito maior do que o testa tradicional com menos estresse no cotovelo.'
    ],
    breathing: 'Inspire profundamente na descida controlada; expire ao empurrar a barra para cima.',
    commonErrors: [
      'Transformar o movimento em um supino fechado comum sem flexão direta sobre o pescoço.',
      'Descer a barra rápido demais correndo risco de colisão.'
    ],
    errorCorrections: [
      'Concentre o foco na flexão dos cotovelos mantendo os braços angulados.',
      'Controle a descida em 2 a 3 segundos com extrema atenção.'
    ],
    variations: ['Supino Fechado com Barra', 'Tríceps Testa com Barra W'],
    substitutions: ['triceps_supino_fechado', 'triceps_testa', 'triceps_paralelas'],
    safetyWarnings: [
      'Utilize travas de segurança ou peça ajuda de um parceiro de treino (spotter).',
      'Inicie com cargas moderadas para aprender o caminho único da barra.'
    ],
    restrictions: [
      'Exige cotovelos preparados para cargas pesadas; contraindicado em fase de epicondilite ativa.',
      'Mantenha a pegada firme e envolvente (com o dedão fechando a barra).'
    ],
    substitutionsHint: 'Exercício composto de força máxima para tríceps. Substitutos: Supino Fechado com Barra ou Mergulho nas Paralelas.',
    primaryMuscleGroupId: 'triceps',
    secondaryMuscleGroupIds: ['chest', 'shoulders'],
    movementPatternIds: ['elbow_extension', 'horizontal_push'],
    equipmentIds: ['barbell', 'flat_bench', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    searchTerms: ['jm press', 'triceps jm press', 'jm press barra', 'press jm powerlifting'],
    images: []
  },
  {
    id: 'abs_pallof_press',
    name: 'Pallof Press no Cabo (Anti-Rotação)',
    thumbnail: '🛡️ Pallof Press',
    muscleGroup: 'abs',
    secondaryMuscles: ['shoulders', 'glutes'],
    equipment: 'Crossover (Polia Média)',
    level: 'intermediate',
    executionSteps: [
      'Ajuste a polia na altura do esterno e fique em pé de lado para a torre de cabos.',
      'Segure o pegador com ambas as mãos juntas ao centro do peito com pés na largura dos ombros.',
      'Estenda os braços à frente em linha reta resistindo com o core à força do cabo que tenta girar seu tronco.',
      'Segure os braços estendidos por 2 segundos e retorne as mãos ao peito de forma controlada.'
    ],
    postureTips: [
      'Exercício de anti-rotação padrão ouro para saúde da coluna lombar e estabilidade de tronco.',
      'Mantenha a pelve e os ombros perfeitamente alinhados para a frente sem deixar o cabo torcer o corpo.'
    ],
    breathing: 'Expire ao empurrar as mãos à frente e manter a isometria; inspire ao recolher as mãos ao peito.',
    commonErrors: [
      'Permitir que os ombros girem em direção à máquina de cabos.',
      'Fazer o movimento com pressa sem pausar no pico de extensão dos braços.'
    ],
    errorCorrections: [
      'Ative glúteos e abdômen como se fosse levar um soco no estômago.',
      'Mantenha os braços estendidos de forma firme e imóvel.'
    ],
    variations: ['Prancha Lateral', 'Russian Twist'],
    substitutions: ['abs_prancha_lateral', 'abs_prancha_abdominal', 'abs_abdominal_supra'],
    safetyWarnings: [
      'Comece com carga leve nas placas; a alavanca aumenta brutalmente quando os braços se estendem.',
      'Mantenha base estável com joelhos destravados.'
    ],
    restrictions: [
      'Excelente e recomendado por fisioterapeutas para reabilitação de hérnia de disco e prevenção de dor lombar.',
      'Sem contraindicações de flexão ou torção na coluna.'
    ],
    substitutionsHint: 'Exercício de estabilidade de core fundamental. Substitutos: Prancha Lateral com apoio no antebraço ou Prancha Tradicional.',
    primaryMuscleGroupId: 'core',
    secondaryMuscleGroupIds: ['glutes', 'shoulders'],
    movementPatternIds: ['anti_rotation'],
    equipmentIds: ['cable_crossover'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    searchTerms: ['pallof press', 'anti rotacao', 'pallof no cabo', 'core anti rotacao', 'pallof press polia'],
    images: []
  },
  {
    id: 'abs_woodchopper_cabo',
    name: 'Woodchopper no Cabo (Rotação de Tronco)',
    thumbnail: '🪓 Woodchopper no Cabo',
    muscleGroup: 'abs',
    secondaryMuscles: ['shoulders', 'back', 'glutes'],
    equipment: 'Polia Alta',
    level: 'intermediate',
    executionSteps: [
      'Ajuste a polia alta e fique de lado para a torre segurando a manopla com ambas as mãos.',
      'Gire o tronco puxando o cabo na diagonal de cima para baixo cruzando o corpo até a altura do joelho oposto.',
      'Pivoteie ligeiramente o pé de trás para permitir rotação de quadril coordenada.',
      'Retorne lentamente controlando a subida do cabo até a posição inicial.'
    ],
    postureTips: [
      'Trabalha a transferência de força rotacional dos quadris e oblíquos abdominais para movimentos esportivos.',
      'Mantenha os braços estendidos com leve flexão nos cotovelos e faça a força com o tronco.'
    ],
    breathing: 'Expire com vigor ao puxar na diagonal para baixo; inspire ao retornar controladamente.',
    commonErrors: [
      'Puxar o cabo apenas com os braços sem girar o tronco e os quadris.',
      'Arredondar a coluna lombar bruscamente no final do arco.'
    ],
    errorCorrections: [
      'Inicie a rotação a partir do quadril e da caixa torácica.',
      'Mantenha o peito aberto e postura sólida.'
    ],
    variations: ['Russian Twist com Anilha', 'Abdominal Oblíquo no Solo'],
    substitutions: ['abs_russian_twist', 'abs_abdominal_obliquo', 'abs_prancha_lateral'],
    safetyWarnings: [
      'Use sapatos com boa tração para permitir rotação suave do pé no solo.',
      'Não solte o pegador durante a rotação.'
    ],
    restrictions: [
      'Pessoas com hérnia de disco lombar aguda devem preferir exercícios de anti-rotação (Pallof Press).',
      'Realize o movimento com velocidade controlada e sem trancos.'
    ],
    substitutionsHint: 'Excelente para rotação de tronco e força dos oblíquos. Substitutos: Russian Twist com Anilha ou Abdominal Oblíquo no Colchonete.',
    primaryMuscleGroupId: 'core',
    secondaryMuscleGroupIds: ['shoulders', 'glutes'],
    movementPatternIds: ['trunk_rotation'],
    equipmentIds: ['high_cable_station'],
    mechanics: 'compound',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    searchTerms: ['woodchopper', 'lenhador no cabo', 'rotacao de tronco cabo', 'woodchopper polia alta', 'diagonal core'],
    images: []
  },
  {
    id: 'abs_prancha_lateral_elevacao_quadril',
    name: 'Prancha Lateral com Elevação de Quadril',
    thumbnail: '🔥 Prancha com Elevação',
    muscleGroup: 'abs',
    secondaryMuscles: ['glutes', 'shoulders'],
    equipment: 'Colchonete / Peso Corporal',
    level: 'intermediate',
    executionSteps: [
      'Deite-se de lado no colchonete apoiando o antebraço no solo diretamente abaixo do ombro.',
      'Estenda as pernas com os pés unidos ou um à frente do outro.',
      'Eleve o quadril do chão formando uma linha reta e, em seguida, desça a pelve até quase encostar no solo.',
      'Empurre o solo com o antebraço e erga novamente o quadril contraindo com força os oblíquos inferiores.'
    ],
    postureTips: [
      'Adiciona dinâmica e repetições à prancha lateral estática tradicional.',
      'Mantenha o peito aberto e o cotovelo de apoio alinhado para proteger o ombro.'
    ],
    breathing: 'Expire ao elevar o quadril contraindo o abdômen; inspire ao descer a pelve.',
    commonErrors: [
      'Deixar o corpo tombar para a frente desequilibrando o ombro.',
      'Fazer o movimento rápido e desajeitado.'
    ],
    errorCorrections: [
      'Imagine seu corpo entre duas paredes estreitas sem oscilar para frente.',
      'Controle o movimento sentindo a contração do oblíquo.'
    ],
    variations: ['Prancha Lateral Tradicional', 'Abdominal Oblíquo no Solo'],
    substitutions: ['abs_prancha_lateral', 'abs_abdominal_obliquo', 'abs_prancha_abdominal'],
    safetyWarnings: [
      'Use colchonete para amortecer o cotovelo.',
      'Se o ombro reclamar, apoie o joelho de baixo no solo.'
    ],
    restrictions: [
      'Excelente para reforço do quadrado lombar e estabilidade de pelve.',
      'Cuidado caso haja bursite no ombro de apoio.'
    ],
    substitutionsHint: 'Kit zero dinâmico para oblíquos. Substitutos: Prancha Lateral Estática ou Abdominal Oblíquo no solo.',
    primaryMuscleGroupId: 'core',
    secondaryMuscleGroupIds: ['glutes', 'shoulders'],
    movementPatternIds: ['anti_extension'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'supported',
    searchTerms: ['prancha lateral com elevacao', 'hip dip plank', 'prancha lateral dinamica', 'elevacao de quadril lateral'],
    images: []
  },
  {
    id: 'mobility_quadril_90_90',
    name: 'Mobilidade de Quadril 90/90',
    thumbnail: '🧘 Quadril 90/90',
    muscleGroup: 'mobility',
    secondaryMuscles: ['glutes'],
    equipment: 'Colchonete / Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Sente-se no solo e posicione a perna da frente em ângulo de 90° (coxa à frente e canela paralela à bacia).',
      'Posicione a perna de trás lateralmente também em ângulo de 90° (rotação interna do quadril).',
      'Mantenha o tronco ereto e incline suavemente o peito sobre a coxa dianteira sentindo o alongamento do glúteo.',
      'Retorne e transicione os joelhos para o lado oposto sem tirar os calcanhares do solo.'
    ],
    postureTips: [
      'Trabalha rotação externa no quadril dianteiro e rotação interna no quadril traseiro simultaneamente.',
      'Mantenha as costas o mais neutras possível durante a inclinação.'
    ],
    breathing: 'Respire profunda e suavemente; solte o ar relaxando a musculatura pélvica.',
    commonErrors: [
      'Arredondar a coluna torácica na tentativa de encostar a cabeça no joelho.',
      'Forçar articulação do joelho caso o quadril esteja rígido.'
    ],
    errorCorrections: [
      'Incline o tronco a partir da articulação coxofemoral com o peito aberto.',
      'Apoie as mãos no solo atrás das costas se faltar mobilidade para sentar ereto.'
    ],
    variations: ['Alongamento de Flexores de Quadril', 'Gato e Camelo'],
    substitutions: ['mobility_flexores_quadril', 'mobility_alongamento_posterior', 'glutes_ponte_solo'],
    safetyWarnings: [
      'Não force a rotação caso sinta desconforto no ligamento medial do joelho.',
      'Faça sobre superfície acolchoada.'
    ],
    restrictions: [
      'Fundamental para melhorar a profundidade e estabilidade do agachamento livre.',
      'Pessoas com impacto femoroacetabular devem respeitar a amplitude livre de dor.'
    ],
    substitutionsHint: 'Mobilidade essencial de membros inferiores antes de treinos de pernas. Substitutos: Alongamento de Flexores de Quadril ou Alongamento de Posteriores.',
    primaryMuscleGroupId: 'mobility',
    secondaryMuscleGroupIds: ['glutes'],
    movementPatternIds: ['mobility'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'mobility',
    laterality: 'alternating',
    bodyPosition: 'seated',
    searchTerms: ['mobilidade 90 90', 'quadril 90 90', '90 90 hip mobility', 'rotacao de quadril', 'mobilidade de gluteo'],
    images: []
  },
  {
    id: 'mobility_tornozelo_dorsiflexao',
    name: 'Mobilidade de Tornozelo no Solo',
    thumbnail: '🦶 Mobilidade Tornozelo',
    muscleGroup: 'mobility',
    secondaryMuscles: ['calves'],
    equipment: 'Colchonete / Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Adote posição semi-ajoelhada com um pé à frente apoiado firmemente no colchonete.',
      'Mantenha o calcanhar do pé dianteiro totalmente colado ao solo.',
      'Projete o joelho para a frente passando por cima dos dedos dos pés até sentir o limite de dorsiflexão.',
      'Segure por 2 segundos e retorne à posição inicial repetindo o movimento de forma dinâmica.'
    ],
    postureTips: [
      'A dorsiflexão do tornozelo é o principal limitador anatômico de profundidade no agachamento sem arredondar a lombar.',
      'O calcanhar não pode desencostar nem 1 milímetro do chão.'
    ],
    breathing: 'Expire ao avançar o joelho para a frente; inspire ao recuar.',
    commonErrors: [
      'Tirar o calcanhar do chão simulando ganho falso de mobilidade.',
      'Deixar o joelho colapsar para dentro ao avançar.'
    ],
    errorCorrections: [
      'Mantenha o peso sobre o calcanhar.',
      'Direcione o joelho na linha do quarto dedo do pé.'
    ],
    variations: ['Alongamento de Panturrilha no Step', 'Agachamento Corporal'],
    substitutions: ['calves_panturrilha_solo_livre', 'mobility_alongamento_quadriceps', 'legs_agachamento_corporal'],
    safetyWarnings: [
      'Coloque apoio macio sob o joelho traseiro.',
      'Não force caso sinta pinçamento ósseo na frente do tornozelo.'
    ],
    restrictions: [
      'Essencial para prevenção de lesões em joelho e melhora na técnica do agachamento.',
      'Pessoas com entorse recente devem aguardar cicatrização ligamentar.'
    ],
    substitutionsHint: 'Mobilidade preventiva obrigatória para quem agacha travado. Substitutos: Panturrilha no Solo ou Alongamento de Posterior.',
    primaryMuscleGroupId: 'mobility',
    secondaryMuscleGroupIds: ['calves'],
    movementPatternIds: ['mobility'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'mobility',
    laterality: 'unilateral',
    bodyPosition: 'kneeling',
    searchTerms: ['mobilidade tornozelo', 'dorsiflexao', 'mobilidade de tornozelo no solo', 'ankle mobility'],
    images: []
  }
];
