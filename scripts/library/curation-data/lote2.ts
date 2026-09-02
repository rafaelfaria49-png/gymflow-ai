import { Exercise } from '../../../src/types';

export const LOTE_2_CURATION: Record<string, Partial<Exercise>> = {
  abs_prancha_abdominal: {
    primaryMuscleGroupId: 'core',
    secondaryMuscleGroupIds: ['shoulders', 'glutes'],
    movementPatternIds: ['anti_extension'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'prone',
    restrictions: [
      'Não permita que a pelve caia em direção ao chão (hiperextensão lombar); aperte glúteos e abdômen.',
      'Em caso de dor nos ombros ou punhos, apoie sobre os antebraços e ajuste a distância cotovelo-ombro.'
    ],
    substitutionsHint: 'Exercício isométrico de estabilização do core. Se houver dor lombar, execute com joelhos apoiados ou faça a Prancha com Braços Estendidos.',
    searchTerms: ['prancha', 'plank', 'prancha abdominal', 'isometria abdominal', 'core prancha']
  },
  cardio_corrida_esteira: {
    primaryMuscleGroupId: 'cardio',
    secondaryMuscleGroupIds: ['calves', 'quadriceps', 'hamstrings'],
    movementPatternIds: ['locomotion'],
    equipmentIds: ['treadmill'],
    mechanics: 'cardio',
    laterality: 'alternating',
    bodyPosition: 'dynamic',
    restrictions: [
      'Pessoas com lesões articulares de joelho (menisco, condromalácia) ou quadril devem evitar corrida em alta velocidade com impacto.',
      'Utilize calçado apropriado com amortecimento e respeite os limites cardiorrespiratórios recomendados.'
    ],
    substitutionsHint: 'Excelente para queima calórica e condicionamento. Se precisar de baixo impacto articular, use o Simulador de Escada, Elíptico ou Bicicleta Ergométrica.',
    substitutions: ['cardio_caminhada_esteira', 'cardio_bicicleta', 'cardio_pular_corda'],
    searchTerms: ['esteira', 'corrida na esteira', 'treadmill run', 'cardio esteira', 'corrida']
  },
  legs_levantamento_terra: {
    primaryMuscleGroupId: 'hamstrings',
    secondaryMuscleGroupIds: ['glutes', 'back', 'traps', 'forearms', 'core'],
    movementPatternIds: ['hip_hinge'],
    equipmentIds: ['barbell', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Exige técnica apurada e rigorosa neutralidade da coluna; interrompa imediatamente se a lombar arredondar sob carga.',
      'Contraindicado em quadros agudos de ciatalgia, hérnia lombar sintomática ou espondilolistese descompensada.'
    ],
    substitutionsHint: 'Movimento composto global. Se a sobrecarga axilar for contraindicada, substitua por Stiff com Halteres ou Hiperextensão Lombar no banco romano.',
    searchTerms: ['levantamento terra', 'deadlift', 'terra convencional', 'terra barra']
  },
  legs_legpress_45: {
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes', 'hamstrings', 'calves'],
    movementPatternIds: ['squat'],
    equipmentIds: ['leg_press_45', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Mantenha os calcanhares totalmente colados à plataforma durante toda a fase de descida.',
      'Não permita que os joelhos entrem em valgo (fechem para dentro) sob a carga da plataforma.'
    ],
    substitutionsHint: 'Equipamento essencial de academias brasileiras. Se estiver ocupado, substitua por Agachamento Hack, Leg Press 90° ou Agachamento Búlgaro com halteres.',
    searchTerms: ['leg 45', 'leg press 45', 'leg press 45 graus', 'leg inclinado', 'legpress 45']
  },
  chest_flexao_bracos: {
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['triceps', 'shoulders', 'core'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['bodyweight', 'exercise_mat'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'prone',
    restrictions: [
      'Mantenha o core rígido para o quadril não afundar nem empinar em excesso durante as repetições.',
      'Se houver desconforto nos punhos com a palma no solo, utilize apoios para flexão (push-up bars) ou halteres.'
    ],
    substitutionsHint: 'Exercício de peso corporal versátil. Se ficar muito difícil, faça com joelhos apoiados ou mãos elevadas no banco; se fácil, eleve os pés.',
    searchTerms: ['flexao de bracos', 'push up', 'flexao no solo', 'flexao de peito', 'marinheiro']
  },
  chest_crucifixo_haltere: {
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['dumbbells', 'flat_bench'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Não desça os cotovelos além da linha frontal do tórax para não tensionar excessivamente a cápsula articular anterior do ombro.',
      'Mantenha uma ligeira flexão fixa nos cotovelos para diminuir o braço de momento sobre a articulação do bíceps distal.'
    ],
    substitutionsHint: 'Grande foco no estiramento das fibras peitorais. Substitua por Crucifixo na Polia (Crossover) ou Crucifixo no Peck Deck.',
    searchTerms: ['crucifixo haltere', 'dumbbell flyes', 'crucifixo reto', 'crucifixo banco plano']
  },
  chest_crucifixo_inclinado_haltere: {
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['dumbbells', 'incline_bench'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Banco com inclinação entre 30° e 45°; evite cargas exageradas que induzam rotação interna do úmero.',
      'Contraindicado em crise de bursite subacromial.'
    ],
    substitutionsHint: 'Isolamento da porção clavicular do peitoral. Substitutos: Crucifixo Inclinado na Máquina ou Crossover Baixo na polia.',
    searchTerms: ['crucifixo inclinado', 'incline dumbbell flyes', 'crucifixo 45', 'peitoral superior crucifixo']
  },
  chest_crossover_polia: {
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['cable_crossover'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Mantenha uma postura estável com passada ântero-posterior e abdômen firme para resistir à tração dos cabos.',
      'Não balance o tronco para auxiliar no fechamento dos braços.'
    ],
    substitutionsHint: 'Excelente para contração de pico no feixe inferior e esternal do peitoral. Se o crossover estiver ocupado, use o Peck Deck ou Crucifixo com Halteres.',
    searchTerms: ['crossover', 'cable crossover', 'crossover polia alta', 'crucifixo na polia', 'cruzamento de cabos']
  },
  chest_crossover_baixo: {
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['cable_crossover'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Ao subir as manoplas de baixo para cima, controle o movimento sem elevar os ombros em direção às orelhas.',
      'Evite hiperextensão lombar na fase final do fechamento.'
    ],
    substitutionsHint: 'Trajetória ascendente direcionada à porção superior do peito. Substitutos: Crucifixo Inclinado com Halteres ou Supino Inclinado na máquina.',
    searchTerms: ['crossover baixo', 'low cable crossover', 'crossover polia baixa', 'peito polia baixa']
  },
  chest_supino_declinado_barra: {
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['triceps', 'shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['barbell', 'decline_bench'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Prenda os pés firmemente nas travas do banco antes de retirar a barra do suporte.',
      'Pessoas com hipertensão não controlada ou glaucoma devem ter cautela com a cabeça posicionada abaixo do coração.'
    ],
    substitutionsHint: 'Foco na porção costal e esternal do peitoral. Se o banco declinado não estiver disponível, faça Paralelas ou Crossover na polia alta.',
    searchTerms: ['supino declinado', 'decline bench press', 'supino canadense', 'supino declinado barra']
  },
  chest_supino_maquina: {
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['triceps', 'shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['chest_press_machine'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Ajuste o banco de modo que as manoplas fiquem no alinhamento da linha média do esterno.',
      'Mantenha as escápulas aduzidas contra o encosto durante todo o empurrão.'
    ],
    substitutionsHint: 'Ótima opção para iniciantes ou séries até a falha com segurança total. Substitutos: Supino Reto com Halteres ou Supino Articulado com Anilhas.',
    searchTerms: ['supino maquina', 'machine bench press', 'chest press', 'aparelho supino', 'supino sentado']
  },
  chest_pullover_haltere: {
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['back', 'triceps'],
    movementPatternIds: ['shoulder_extension'],
    equipmentIds: ['dumbbells', 'flat_bench'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Contraindicado em casos de instabilidade articular glenoumeral anterior ou lesão labral (SLAP).',
      'Não permita que a coluna lombar se curve excessivamente ao descer o haltere atrás da cabeça.'
    ],
    substitutionsHint: 'Trabalha a expansão torácica, serrátil e feixe esternal do peitoral. Substitutos: Pulldown com braço reto na polia ou Pullover na máquina.',
    searchTerms: ['pullover', 'pullover haltere', 'dumbbell pullover', 'pull over']
  },
  back_serrote: {
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'forearms'],
    movementPatternIds: ['horizontal_pull'],
    equipmentIds: ['dumbbells', 'flat_bench'],
    mechanics: 'compound',
    laterality: 'unilateral',
    bodyPosition: 'supported',
    restrictions: [
      'Apoie o joelho e a mão firme no banco mantendo as costas paralelas ao solo e a coluna lombar alinhada.',
      'Não gire excessivamente o tronco no final da puxada para simular amplitude.'
    ],
    substitutionsHint: 'Remada unilateral de alto recrutamento de latíssimo do dorso com suporte do banco. Substitutos: Remada Articulada Unilateral ou Remada Baixa Unilateral.',
    searchTerms: ['serrote', 'remada unilateral', 'one arm dumbbell row', 'remada serrote', 'remada com halter']
  },
  back_remada_cavalinho: {
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'traps', 'lower_back', 'forearms'],
    movementPatternIds: ['horizontal_pull'],
    equipmentIds: ['t_bar', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Mantenha os joelhos flexionados e o peito aberto; evite flexão lombar sob a carga das anilhas.',
      'Pessoas com dores lombares crônicas devem preferir o cavalinho com apoio no peito.'
    ],
    substitutionsHint: 'Excelente para densidade e espessura do meio das costas. Se a barra T estiver ocupada, use Remada Curvada com Barra ou Remada Baixa.',
    searchTerms: ['remada cavalinho', 't bar row', 'cavalinho barra t', 'remada t']
  },
  back_puxada_triangulo: {
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'forearms'],
    movementPatternIds: ['vertical_pull'],
    equipmentIds: ['high_cable_station', 'triangle_handle'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Puxe o triângulo até o topo do esterno mantendo os cotovelos apontados para o chão.',
      'Não jogue o tronco para trás além de 15° a 20° para não transformar o movimento em remada.'
    ],
    substitutionsHint: 'Pegada neutra fechada, ideal para conforto nos ombros e punhos. Substitutos: Puxada Pulley Pegada Aberta ou Barra Fixa com Pegada Neutra.',
    searchTerms: ['puxada triangulo', 'v bar pulldown', 'puxador triangulo', 'puxada neutra fechada', 'puxada alta triangulo']
  },
  back_puxada_supinada: {
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'forearms'],
    movementPatternIds: ['vertical_pull'],
    equipmentIds: ['high_cable_station', 'straight_bar_attachment'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Se sentir estresse na parte medial do cotovelo ou nos punhos, reduza a largura da pegada ou adote pegada neutra.',
      'Não desça a barra atrás da nuca; conduza-a à frente do queixo até a fúrcula esternal.'
    ],
    substitutionsHint: 'Maior ativação de bíceps e parte inferior do latíssimo. Substitutos: Barra Fixa Supinada (Chin-Up) ou Puxada com Triângulo.',
    searchTerms: ['puxada supinada', 'underhand pulldown', 'puxador supinado', 'puxada invertida cabo']
  },
  back_puxada_fechada: {
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'forearms'],
    movementPatternIds: ['vertical_pull'],
    equipmentIds: ['high_cable_station', 'straight_bar_attachment'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Mantenha a pegada na largura dos ombros para evitar rotação forçada excessiva dos punhos na descida.',
      'Controle a fase excêntrica sem deixar os ombros subirem desajeitadamente.'
    ],
    substitutionsHint: 'Ótima variação para amplitude completa das fibras inferiores do grande dorsal. Substitutos: Puxada Triângulo ou Puxador Articulado Convergente.',
    searchTerms: ['puxada fechada', 'close grip lat pulldown', 'puxador fechado', 'puxada alta fechada']
  },
  back_barra_fixa_supinada: {
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'forearms'],
    movementPatternIds: ['vertical_pull'],
    equipmentIds: ['pull_up_bar', 'bodyweight'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'hanging',
    restrictions: [
      'Não estenda totalmente e repentinamente os cotovelos na fase mais baixa sob o peso total do corpo (mantenha leve tensão ativa).',
      'Pessoas com dor no tendão bicipital devem realizar a descida com velocidade estritamente controlada.'
    ],
    substitutionsHint: 'Excelente para dorsais e bíceps juntos. Se não conseguir fazer repetições completas, use a máquina Graviton ou Puxada Supinada no Pulley.',
    searchTerms: ['chin up', 'barra fixa supinada', 'barra supinada', 'barra fixa biceps']
  },
  back_pulldown_braco_reto: {
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['triceps', 'core'],
    movementPatternIds: ['shoulder_extension'],
    equipmentIds: ['high_cable_station', 'straight_bar_attachment'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Mantenha os cotovelos com semiflexão rígida para que o tríceps não realize extensão e assuma o esforço da dorsal.',
      'Incline o tronco levemente à frente mantendo a coluna lombar travada e abdômen firme.'
    ],
    substitutionsHint: 'Isolamento perfeito do grande dorsal sem fadigar os flexores de cotovelo (bíceps). Substitutos: Pullover com Haltere ou Pullover na Máquina.',
    searchTerms: ['pulldown braco reto', 'straight arm pulldown', 'pulldown cabo', 'puxada braco estendido']
  },
  back_remada_maquina: {
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'traps', 'forearms'],
    movementPatternIds: ['horizontal_pull'],
    equipmentIds: ['seated_row_machine'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Ajuste o apoio do tórax para que as manoplas sejam alcançadas com alongamento completo sem desencostar o peito do estofado.',
      'Não dê tranco com a coluna para trás ao iniciar a tração.'
    ],
    substitutionsHint: 'Apoio torácico protege a lombar de qualquer fadiga estática. Substitutos: Remada Articulada com Anilhas, Remada Baixa na Polia ou Remada no Serrote.',
    searchTerms: ['remada maquina', 'seated row machine', 'remada articulada', 'remada sentada maquina', 'maquina de remada']
  },
  back_hiperextensao_lombar: {
    primaryMuscleGroupId: 'lower_back',
    secondaryMuscleGroupIds: ['glutes', 'hamstrings'],
    movementPatternIds: ['trunk_extension'],
    equipmentIds: ['roman_chair', 'bodyweight'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'supported',
    restrictions: [
      'Suba o tronco até formar uma linha reta com as pernas; evite hiperextensão forçada da coluna além da linha neutra.',
      'Ajuste o apoio do quadril logo abaixo da crista ilíaca para permitir livre articulação coxofemoral.'
    ],
    substitutionsHint: 'Fortalecimento seguro dos eretores da espinha e glúteos. Se o banco romano não estiver disponível, faça o exercício Superman no solo.',
    searchTerms: ['hiperextensao lombar', 'banco romano', 'hyperextensions', 'extensao lombar', 'lombar banco']
  },
  back_remada_curvada_supinada: {
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'lower_back', 'forearms'],
    movementPatternIds: ['horizontal_pull'],
    equipmentIds: ['barbell', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'A pegada supinada aumenta o torque de bíceps; interrompa se sentir estresse na inserção bicipital.',
      'Mantenha a lordose lombar anatômica travada contra a gravidade durante toda a série.'
    ],
    substitutionsHint: 'Variação clássica estilo Dorian Yates para fibras inferiores da dorsal. Substitutos: Remada Curvada Pronada ou Remada Cavalinho.',
    searchTerms: ['remada curvada supinada', 'reverse grip bent over row', 'remada yates', 'remada supinada barra']
  },
  back_remada_invertida: {
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'core', 'forearms'],
    movementPatternIds: ['horizontal_pull'],
    equipmentIds: ['smith_machine', 'bodyweight'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'supported',
    restrictions: [
      'Mantenha o corpo como uma prancha rígida sem deixar a pelve cair durante a puxada.',
      'Ajuste a altura da barra: quanto mais horizontal o corpo, maior o nível de dificuldade.'
    ],
    substitutionsHint: 'Excelente remada horizontal com peso corporal. Se precisar de substitutos, use Remada Baixa na Polia ou Remada Curvada com Halteres.',
    searchTerms: ['remada invertida', 'inverted row', 'australian pull up', 'remada no smith', 'barra australiana']
  },
  back_encolhimento_halteres: {
    primaryMuscleGroupId: 'traps',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['vertical_pull'],
    equipmentIds: ['dumbbells'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Faça apenas a elevação e depressão vertical das escápulas; NUNCA gire os ombros para trás ou para a frente (desgaste articular inútil).',
      'Evite projetar a cabeça para frente ao encolher os ombros.'
    ],
    substitutionsHint: 'Foco exclusivo na porção superior do trapézio. Se os halteres forem leves, use o Encolhimento com Barra ou na Máquina Smith.',
    searchTerms: ['encolhimento halteres', 'dumbbell shrug', 'trapezio haltere', 'shrug']
  },
  back_encolhimento_barra: {
    primaryMuscleGroupId: 'traps',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['vertical_pull'],
    equipmentIds: ['barbell', 'weight_plates'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Segure a barra à frente das coxas sem rodar a articulação do ombro.',
      'Se a pegada falhar antes do trapézio, use straps para garantir o estímulo completo da musculatura alvo.'
    ],
    substitutionsHint: 'Permite carregar cargas mais elevadas para o trapézio superior. Substitutos: Encolhimento com Halteres ou no Smith Machine.',
    searchTerms: ['encolhimento barra', 'barbell shrug', 'trapezio barra', 'encolhimento de ombro']
  }
};
