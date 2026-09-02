import { Exercise } from '../../../src/types';

export const LOTE_5_CURATION: Record<string, Partial<Exercise>> = {
  calves_panturrilha_halter: {
    primaryMuscleGroupId: 'calves',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['calf_raise'],
    equipmentIds: ['dumbbells', 'step_platform'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Segure-se com uma mão em um ponto fixo estável para não desequilibrar durante o pico de flexão plantar.',
      'Desça o calcanhar até sentir alongamento agradável sem forçar a fáscia plantar.'
    ],
    substitutionsHint: 'Excelente opção unilateral executável em qualquer step ou degrau. Substitutos: Panturrilha em Pé na Máquina ou no Leg Press.',
    searchTerms: ['panturrilha halter', 'standing dumbbell calf raise', 'panturrilha unilateral halter', 'panturrilha degrau']
  },
  calves_panturrilha_burro: {
    primaryMuscleGroupId: 'calves',
    secondaryMuscleGroupIds: ['hamstrings'],
    movementPatternIds: ['calf_raise'],
    equipmentIds: ['donkey_calf_machine'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'supported',
    restrictions: [
      'Com o quadril fletido a 90°, o gastrocnêmio é colocado em estiramento adicional; não permita que a lombar fique excessivamente arqueada.',
      'Apoie o peso sobre o sacro/pelve e mantenha os joelhos com semiflexão de 5°.'
    ],
    substitutionsHint: 'Exercício lendário dos tempos dourados de Arnold para gastrocnêmio. Substitutos: Panturrilha no Leg Press 45° ou Panturrilha em Pé na Máquina.',
    searchTerms: ['panturrilha burro', 'donkey calf raise', 'panturrilha donkey', 'gemeos burro']
  },
  abs_abdominal_supra: {
    primaryMuscleGroupId: 'core',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['trunk_flexion'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Não puxe o pescoço com as mãos (mantenha um punho de distância entre queixo e peito) para evitar dor cervical.',
      'O movimento é de enrolamento das costelas em direção ao umbigo, e não de elevação do tronco todo.'
    ],
    substitutionsHint: 'Exercício clássico de flexão de tronco. Para maior intensidade, faça no Banco Declinado ou com carga (anilha sobre o peito).',
    searchTerms: ['abdominal supra', 'crunch', 'abdominal no solo', 'abdominal tradicional']
  },
  abs_abdominal_declinado: {
    primaryMuscleGroupId: 'core',
    secondaryMuscleGroupIds: ['quadriceps'],
    movementPatternIds: ['trunk_flexion'],
    equipmentIds: ['decline_bench', 'bodyweight'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Prenda os tornozelos com segurança antes de iniciar a descida do tronco.',
      'Ao descer, mantenha o abdômen tensionado e não hiperextenda as costas ao tocar o banco.'
    ],
    substitutionsHint: 'Aumenta a resistência pela ação da gravidade no banco inclinado. Substitutos: Abdominal na Polia Alta ou Abdominal Supra com Carga.',
    searchTerms: ['abdominal declinado', 'decline crunch', 'abdominal banco declinado', 'crunch declinado']
  },
  abs_abdominal_polia: {
    primaryMuscleGroupId: 'core',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['trunk_flexion'],
    equipmentIds: ['high_cable_station', 'rope_attachment', 'exercise_mat'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'kneeling',
    restrictions: [
      'Ajoelhe-se sobre o colchonete e trave a pelve; o movimento não é de sentar nos calcanhares, mas sim de enrolar a coluna toracolombar.',
      'Mantenha as mãos presas junto às têmporas sem puxar o cabo com os braços.'
    ],
    substitutionsHint: 'Permite sobrecarga progressiva com placas para o reto abdominal. Substitutos: Abdominal na Máquina com Placas ou Abdominal Declinado com Anilha.',
    searchTerms: ['abdominal polia', 'rope crunch', 'abdominal no cabo', 'abdominal ajoelhado polia', 'cable crunch']
  },
  abs_abdominal_maquina: {
    primaryMuscleGroupId: 'core',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['trunk_flexion'],
    equipmentIds: ['abdominal_machine'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Ajuste a altura do assento para que a almofada de peito/ombro fique bem posicionada sem comprimir o pescoço.',
      'Não utilize impulso dos braços ou pernas para mover o bloco de pesos.'
    ],
    substitutionsHint: 'Isolamento com resistência guiada para o abdômen. Substitutos: Abdominal na Polia Alta com Corda ou Abdominal Declinado.',
    searchTerms: ['abdominal maquina', 'machine crunch', 'aparelho abdominal', 'abdominal sentado maquina']
  },
  abs_abdominal_infra: {
    primaryMuscleGroupId: 'core',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['trunk_flexion'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Mantenha a lombar colada ao solo ao descer as pernas; se a lombar descolar (hiperlordose), limite a descida.',
      'Não balance as pernas para ganhar inércia.'
    ],
    substitutionsHint: 'Foco na porção subumbilical do reto abdominal. Substitutos: Elevação de Pernas na Barra Fixa ou Elevação de Pernas na Cadeira Romana.',
    searchTerms: ['abdominal infra', 'reverse crunch', 'abdominal pernas', 'elevacao de pernas solo']
  },
  abs_elevacao_pernas_barra: {
    primaryMuscleGroupId: 'core',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['trunk_flexion'],
    equipmentIds: ['pull_up_bar', 'bodyweight'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'hanging',
    restrictions: [
      'Evite balançar o corpo em pêndulo; inicie cada repetição a partir da imobilidade completa.',
      'Para ativar o reto abdominal e não apenas os flexores de quadril, curve a pelve para cima (retroversão) no topo.'
    ],
    substitutionsHint: 'Exercício potente de calistenia para o core. Se for muito pesado, faça com joelhos flexionados (joelhos ao peito suspenso).',
    searchTerms: ['elevacao de pernas barra', 'hanging leg raise', 'infra na barra', 'elevacao pernas suspenso']
  },
  abs_prancha_lateral: {
    primaryMuscleGroupId: 'core',
    secondaryMuscleGroupIds: ['glutes', 'shoulders'],
    movementPatternIds: ['anti_extension'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'supported',
    restrictions: [
      'Alinhe o cotovelo de apoio diretamente abaixo da articulação do ombro para evitar sobrecarga na cápsula.',
      'Não permita que a pelve gire para a frente ou despenque em direção ao chão.'
    ],
    substitutionsHint: 'Excelente para quadrado lombar, oblíquos e glúteo médio. Substitutos: Pallof Press na Polia ou Abdominal Russo.',
    searchTerms: ['prancha lateral', 'side plank', 'isometria lateral', 'obliquos prancha']
  },
  abs_abdominal_obliquo: {
    primaryMuscleGroupId: 'core',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['trunk_rotation', 'trunk_flexion'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'isolation',
    laterality: 'alternating',
    bodyPosition: 'lying',
    restrictions: [
      'Não torça o pescoço em direção ao joelho oposto; a rotação deve originar-se na caixa torácica e no abdômen.',
      'Mantenha as pernas firmes e a pelve estável no colchonete.'
    ],
    substitutionsHint: 'Trabalho rotacional de oblíquos internos e externos. Substitutos: Russian Twist com Anilha ou Woodchopper na Polia.',
    searchTerms: ['abdominal obliquo', 'oblique crunch', 'abdominal cruzado', 'abdominal lateral']
  },
  abs_russian_twist: {
    primaryMuscleGroupId: 'core',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['trunk_rotation'],
    equipmentIds: ['exercise_mat', 'dumbbells', 'weight_plates'],
    mechanics: 'isolation',
    laterality: 'alternating',
    bodyPosition: 'seated',
    restrictions: [
      'Contraindicado em pessoas com hérnia de disco lombar sintomática em fase aguda devido à combinação de flexão com torção.',
      'Mantenha o peito aberto e a coluna alinhada durante as rotações.'
    ],
    substitutionsHint: 'Exercício dinâmico para os músculos rotadores do tronco. Pode ser feito sem peso ou segurando uma anilha. Substitutos: Pallof Press ou Prancha Lateral.',
    searchTerms: ['russian twist', 'giro russo', 'abdominal russo', 'torcao russa']
  },
  cardio_caminhada_esteira: {
    primaryMuscleGroupId: 'cardio',
    secondaryMuscleGroupIds: ['calves', 'quadriceps'],
    movementPatternIds: ['locomotion'],
    equipmentIds: ['treadmill'],
    mechanics: 'cardio',
    laterality: 'alternating',
    bodyPosition: 'dynamic',
    restrictions: [
      'Não se apoie com força nos corrimãos laterais da esteira (isso reduz o gasto calórico e distorce o alinhamento corporal).',
      'Para aumentar a intensidade sem impacto articular, aumente a inclinação (incline walk).'
    ],
    substitutionsHint: 'Excelente para queima de gordura em zona 2 e reabilitação. Substitutos: Bicicleta Ergométrica, Elíptico ou Caminhada ao ar livre.',
    substitutions: ['cardio_bicicleta', 'cardio_eliptico', 'cardio_pular_corda'],
    searchTerms: ['caminhada esteira', 'incline walk', 'caminhada inclinada', 'esteira caminhada', 'cardio leve']
  },
  cardio_bicicleta: {
    primaryMuscleGroupId: 'cardio',
    secondaryMuscleGroupIds: ['quadriceps', 'calves'],
    movementPatternIds: ['locomotion'],
    equipmentIds: ['stationary_bike'],
    mechanics: 'cardio',
    laterality: 'alternating',
    bodyPosition: 'seated',
    restrictions: [
      'Ajuste o selim na altura do osso ilíaco para que o joelho fique com leve semiflexão de 10° a 15° no ponto mais baixo do pedal.',
      'Evite pedalar com resistência quase nula em cadência descontrolada para poupar os meniscos.'
    ],
    substitutionsHint: 'Zero impacto articular ideal para recuperação ativa e treinos cardiorrespiratórios. Substitutos: Elíptico ou Simulador de Escada.',
    substitutions: ['cardio_caminhada_esteira', 'cardio_eliptico', 'cardio_pular_corda'],
    searchTerms: ['bicicleta ergometrica', 'bike indoor', 'spinning', 'bike ergometrica', 'cardio bicicleta']
  },
  cardio_eliptico: {
    primaryMuscleGroupId: 'cardio',
    secondaryMuscleGroupIds: ['quadriceps', 'glutes', 'calves'],
    movementPatternIds: ['locomotion'],
    equipmentIds: ['elliptical'],
    mechanics: 'cardio',
    laterality: 'alternating',
    bodyPosition: 'dynamic',
    restrictions: [
      'Mantenha a planta dos pés em contato com os pedais para não pedalar apenas na ponta dos pés.',
      'Utilize as hastes móveis para envolver membros superiores de forma coordenada.'
    ],
    substitutionsHint: 'Trabalho global de membros superiores e inferiores sem impacto contra o solo. Substitutos: Esteira Inclinada ou Bicicleta Ergométrica.',
    substitutions: ['cardio_bicicleta', 'cardio_caminhada_esteira', 'cardio_pular_corda'],
    searchTerms: ['eliptico', 'transport', 'cross trainer', 'cardio eliptico', 'aparelho eliptico']
  },
  cardio_pular_corda: {
    primaryMuscleGroupId: 'cardio',
    secondaryMuscleGroupIds: ['calves', 'forearms'],
    movementPatternIds: ['locomotion'],
    equipmentIds: ['jump_rope', 'bodyweight'],
    mechanics: 'cardio',
    laterality: 'bilateral',
    bodyPosition: 'dynamic',
    restrictions: [
      'Pessoas com tendinopatia patelar ou calcânea recente devem evitar saltos repetitivos de alto impacto.',
      'Pule apenas o suficiente para a corda passar (cerca de 2 a 3 cm do chão) e amorteça na ponta dos pés com joelhos macios.'
    ],
    substitutionsHint: 'Condicionamento de alta intensidade, agilidade e coordenação motora. Substitutos: Corrida na Esteira ou Polichinelos.',
    searchTerms: ['pular corda', 'jump rope', 'corda', 'salto com corda', 'cardio corda']
  },
  cardio_remo_ergometro: {
    primaryMuscleGroupId: 'cardio',
    secondaryMuscleGroupIds: ['back', 'quadriceps', 'glutes', 'forearms'],
    movementPatternIds: ['full_body_conditioning'],
    equipmentIds: ['rowing_ergometer'],
    mechanics: 'cardio',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Siga a ordem biomecânica rigorosa: pernas -> tronco -> braços na puxada; braços -> tronco -> pernas no retorno.',
      'Não arredonde a coluna lombar no início da remada (fase catch).'
    ],
    substitutionsHint: 'Ativa mais de 85% dos grupos musculares do corpo com alta demanda aeróbica. Substitutos: Air Bike ou Simulador de Escada.',
    substitutions: ['cardio_eliptico', 'cardio_bicicleta', 'cardio_pular_corda'],
    searchTerms: ['remo ergometro', 'rowing machine', 'remo indoor', 'remo seco', 'ergometro']
  },
  cardio_escada: {
    primaryMuscleGroupId: 'cardio',
    secondaryMuscleGroupIds: ['glutes', 'quadriceps', 'calves'],
    movementPatternIds: ['locomotion'],
    equipmentIds: ['stair_climber'],
    mechanics: 'cardio',
    laterality: 'alternating',
    bodyPosition: 'dynamic',
    restrictions: [
      'Pise com o pé inteiro em cada degrau em vez de apoiar somente a ponta dos dedos.',
      'Não descanse o peso do corpo sobre os apoios de mão, mantendo a postura ereta durante toda a subida.'
    ],
    substitutionsHint: 'Equipamento favorito nas academias brasileiras para alto gasto calórico com foco em glúteos e pernas. Substitutos: Esteira Inclinada ou Step.',
    substitutions: ['cardio_caminhada_esteira', 'cardio_eliptico', 'cardio_pular_corda'],
    searchTerms: ['simulador de escada', 'escada ergometrica', 'stair climber', 'escada academia', 'cardio escada']
  },
  functional_kettlebell_swing: {
    primaryMuscleGroupId: 'glutes',
    secondaryMuscleGroupIds: ['hamstrings', 'lower_back', 'core', 'shoulders'],
    movementPatternIds: ['hip_hinge'],
    equipmentIds: ['kettlebells'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'O movimento é de explosão do quadril (padrão hinge) e NÃO um agachamento ou elevação de ombros com os braços.',
      'Contraindicado em pessoas com instabilidade lombar que não dominam o padrão do Stiff.'
    ],
    substitutionsHint: 'Desenvolve potência de cadeia posterior e condicionamento metabólico. Substitutos: Stiff com Halteres ou Hiperextensão Lombar.',
    searchTerms: ['kettlebell swing', 'swing com kettlebell', 'balanco kettlebell', 'swing']
  },
  functional_escalador: {
    primaryMuscleGroupId: 'core',
    secondaryMuscleGroupIds: ['shoulders', 'quadriceps'],
    movementPatternIds: ['anti_extension'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'functional',
    laterality: 'alternating',
    bodyPosition: 'prone',
    restrictions: [
      'Mantenha as mãos alinhadas com os ombros e a pelve baixa na linha do tronco.',
      'Não deixe o quadril subir em demasia formando uma pirâmide.'
    ],
    substitutionsHint: 'Combina prancha isométrica com dinamismo cardiovascular. Substitutos: Prancha Abdominal Tradicional ou Corrida Estacionária.',
    searchTerms: ['escalador', 'mountain climbers', 'mountain climber', 'escalada no solo']
  },
  functional_farmer_walk: {
    primaryMuscleGroupId: 'forearms',
    secondaryMuscleGroupIds: ['traps', 'core', 'calves', 'glutes'],
    movementPatternIds: ['locomotion'],
    equipmentIds: ['dumbbells'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Mantenha o peito estufado, escápulas para trás e abdômen rígido para impedir oscilações laterais da coluna.',
      'Cuidado ao largar os pesos no chão ao final do trajeto (use técnica de agachamento).'
    ],
    substitutionsHint: 'Desenvolve pegada de aço, estabilidade do core e trapézio. Substitutos: Encolhimento com Halteres ou Prancha com Peso.',
    searchTerms: ['farmer walk', 'caminhada do fazendeiro', 'farmers walk', 'passada com peso']
  },
  functional_battle_rope: {
    primaryMuscleGroupId: 'cardio',
    secondaryMuscleGroupIds: ['shoulders', 'forearms', 'core'],
    movementPatternIds: ['full_body_conditioning'],
    equipmentIds: ['battle_rope'],
    mechanics: 'functional',
    laterality: 'alternating',
    bodyPosition: 'standing',
    restrictions: [
      'Mantenha base estável de meio agachamento com tronco ligeiramente à frente e lombar firme.',
      'Pessoas com tendinite crônica de bíceps ou punho devem moderar a intensidade dos chicotes.'
    ],
    substitutionsHint: 'Excelente para potência de tronco e capacidade anaeróbica láctica. Substitutos: Pular Corda ou Kettlebell Swing.',
    searchTerms: ['battle rope', 'corda naval', 'ondulacao de corda', 'treino corda naval']
  },
  mobility_alongamento_posterior: {
    primaryMuscleGroupId: 'mobility',
    secondaryMuscleGroupIds: ['hamstrings', 'calves'],
    movementPatternIds: ['mobility'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'mobility',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Não force a cabeça em direção aos joelhos arredondando exageradamente a cervical.',
      'O alongamento deve ser progressivo e confortável sem dor em pontada.'
    ],
    substitutionsHint: 'Melhora o comprimento funcional dos isquiotibiais para permitir agachamentos e terras com boa postura. Substitutos: Alongamento de Posteriores em Pé.',
    searchTerms: ['alongamento posterior', 'alongamento isquiotibiais', 'hamstring stretch', 'flexibilidade posterior']
  },
  mobility_alongamento_quadriceps: {
    primaryMuscleGroupId: 'mobility',
    secondaryMuscleGroupIds: ['quadriceps'],
    movementPatternIds: ['mobility'],
    equipmentIds: ['bodyweight'],
    mechanics: 'mobility',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Apoie uma das mãos em parede ou suporte para manter o equilíbrio estável.',
      'Mantenha os joelhos juntos e encaixe a pelve (retroversão) para alongar o reto femoral sem hiperlordose lombar.'
    ],
    substitutionsHint: 'Alivia tensão na patela e no quadril após treinos pesados de pernas. Substitutos: Alongamento de Quadríceps no Solo deitado de lado.',
    searchTerms: ['alongamento quadriceps', 'quadriceps stretch', 'alongamento coxa', 'alongamento perna']
  },
  mobility_gato_coluna: {
    primaryMuscleGroupId: 'mobility',
    secondaryMuscleGroupIds: ['core', 'lower_back'],
    movementPatternIds: ['mobility'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'mobility',
    laterality: 'bilateral',
    bodyPosition: 'kneeling',
    restrictions: [
      'Realize o movimento de forma lenta e sincronizada com a respiração (inspire na extensão, expire na flexão).',
      'Não faça trancos nem force amplitudes dolorosas na coluna.'
    ],
    substitutionsHint: 'Mobilização articular de toda a coluna vertebral para aquecimento ou descompressão lombar. Substitutos: Descompressão Pendurado na Barra Fixa.',
    searchTerms: ['gato e camelo', 'cat cow', 'mobilidade de coluna', 'alongamento gato coluna']
  },
  mobility_alongamento_peitoral: {
    primaryMuscleGroupId: 'mobility',
    secondaryMuscleGroupIds: ['chest', 'shoulders'],
    movementPatternIds: ['mobility'],
    equipmentIds: ['bodyweight'],
    mechanics: 'mobility',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Apoie o antebraço em uma coluna ou batente a 90° e gire o tronco suavemente para o lado oposto.',
      'Não force caso haja histórico de frouxidão ou instabilidade anterior no ombro.'
    ],
    substitutionsHint: 'Abre a caixa torácica e combate a postura cifótica de ombros caídos para frente. Substitutos: Alongamento de Peitoral no Colchão ou com Elástico.',
    searchTerms: ['alongamento peitoral', 'chest stretch', 'alongamento peito', 'alongamento ombro anterior']
  },
  mobility_flexores_quadril: {
    primaryMuscleGroupId: 'mobility',
    secondaryMuscleGroupIds: ['glutes', 'quadriceps'],
    movementPatternIds: ['mobility'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'mobility',
    laterality: 'unilateral',
    bodyPosition: 'kneeling',
    restrictions: [
      'Posição semi-ajoelhada (afundo); contraia o glúteo do lado do joelho de trás e projete a pelve suavemente para a frente.',
      'Não arqueie a lombar para compensar rigidez nos flexores do quadril (ilíaco e psoas).'
    ],
    substitutionsHint: 'Alivia sobrecarga na coluna lombar causada pelo hábito de passar muitas horas sentado. Substitutos: Alongamento de Flexores no Banco.',
    searchTerms: ['alongamento flexores quadril', 'alongamento psoas', 'hip flexor stretch', 'mobilidade quadril']
  },
  triceps_maquina: {
    primaryMuscleGroupId: 'triceps',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['elbow_extension'],
    equipmentIds: ['triceps_extension_machine'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Ajuste o assento e a almofada de braço para que os cotovelos coincidam rigorosamente com o eixo de giro da máquina.',
      'Não utilize o peito para empurrar as almofadas ou manoplas.'
    ],
    substitutionsHint: 'Isolamento guiado com carga estável para o tríceps. Se a máquina estiver ocupada, use o Tríceps na Polia com Barra ou Tríceps Corda.',
    searchTerms: ['triceps maquina', 'extensao de triceps na maquina', 'triceps na maquina', 'triceps maquina sentado', 'maquina de triceps', 'triceps pulley maquina']
  }
};
