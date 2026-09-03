import { Exercise } from '../../../src/types';

export const LOTE_6_EXPANSION: Exercise[] = [
  {
    id: 'legs_leg_press_90',
    name: 'Leg Press 90° (Horizontal)',
    thumbnail: '🦵 Leg 90',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes'],
    equipment: 'Aparelho Leg Press 90°',
    level: 'intermediate',
    executionSteps: [
      'Deite-se completamente sob o carrinho com as costas e a lombar bem apoiadas no estofado.',
      'Posicione os pés na plataforma na largura dos ombros com pontas ligeiramente para fora.',
      'Destrave a trava de segurança e desça o peso flexionando os joelhos e quadris em direção ao peito.',
      'Empurre a plataforma para cima estendendo as pernas sem travar os joelhos no topo.'
    ],
    postureTips: [
      'Mantenha o sacro e a lombar colados ao encosto; não permita retroversão da pelve na flexão máxima.',
      'Segure com firmeza nas manoplas laterais para manter o tronco travado no banco.'
    ],
    breathing: 'Inspire ao descer a plataforma em direção ao tronco; expire ao empurrar o peso para cima.',
    commonErrors: [
      'Tirar a lombar do estofado na descida máxima para aumentar a amplitude.',
      'Hiperextender e travar bruscamente os joelhos no ponto alto da repetição.'
    ],
    errorCorrections: [
      'Limite a descida até o ponto em que sua lombar permaneça completamente neutra.',
      'Mantenha os joelhos com leve flexão no topo preservando a tensão contínua no quadríceps.'
    ],
    variations: ['Leg Press 45°', 'Leg Press Horizontal com Placas'],
    substitutions: ['legs_legpress_45', 'legs_agachamento_hack', 'legs_agachamento_goblet'],
    safetyWarnings: [
      'Nunca solte as travas de segurança sem antes testar a posição dos pés.',
      'Evite descer além da flexão de 90° dos joelhos se houver histórico de dor patelofemoral.'
    ],
    restrictions: [
      'Pessoas com hérnia discal lombar devem evitar amplitudes extremas de descida que descolam o quadril.',
      'Monitore a compressão retropatelar caso sinta estalos com dor.'
    ],
    substitutionsHint: 'Se o Leg 90° estiver ocupado, faça Leg Press 45° com posicionamento médio dos pés ou Agachamento Hack.',
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes'],
    movementPatternIds: ['squat'],
    equipmentIds: ['leg_press_90'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    searchTerms: ['leg 90', 'leg press 90', 'leg press 90 graus', 'leg horizontal', 'leg press reto'],
    images: []
  },
  {
    id: 'legs_agachamento_pendulo',
    name: 'Agachamento Pêndulo',
    thumbnail: '⚡ Agachamento Pêndulo',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes'],
    equipment: 'Máquina de Agachamento Pêndulo',
    level: 'intermediate',
    executionSteps: [
      'Apoie as costas e os ombros nas almofadas do pêndulo com a coluna neutra.',
      'Posicione os pés no centro da plataforma inclinada com largura dos ombros.',
      'Destrave o equipamento e flexione os joelhos e quadris em movimento arqueado e contínuo.',
      'Empurre o piso com os calcanhares e meio do pé até retornar à posição inicial.'
    ],
    postureTips: [
      'A trajetória pendular reduz a compressão lombar no fundo; aproveite o alongamento limpo dos quadríceps.',
      'Mantenha os joelhos alinhados com a ponta dos pés sem oscilar em valgo.'
    ],
    breathing: 'Inspire profundamente durante a descida; expire com força ao empurrar a plataforma.',
    commonErrors: [
      'Tirar os calcanhares da plataforma durante a fase excêntrica.',
      'Deixar os joelhos fecharem para dentro ao iniciar a subida.'
    ],
    errorCorrections: [
      'Empurre os joelhos ativamente para fora na linha dos dedos dos pés.',
      'Apoie o pé inteiro e distribua a pressão uniformemente.'
    ],
    variations: ['Agachamento Hack', 'Leg Press 45°'],
    substitutions: ['legs_agachamento_hack', 'legs_legpress_45', 'legs_agachamento_barra'],
    safetyWarnings: [
      'Ajuste o batente inferior de segurança antes de colocar cargas pesadas de anilhas.',
      'Mantenha as mãos firmes nas manoplas de travamento.'
    ],
    restrictions: [
      'Indicado para quem tem desconforto lombar no agachamento livre, mas exige joelhos saudáveis.',
      'Evite amplitude máxima se houver tendinopatia patelar em fase aguda.'
    ],
    substitutionsHint: 'Máquina favorita no treino de pernas BR. Se ocupada, substitua por Hack Squat ou Leg Press 45°.',
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes'],
    movementPatternIds: ['squat'],
    equipmentIds: ['pendulum_squat_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    searchTerms: ['pendulo', 'agachamento pendulo', 'pendulum squat', 'maquina pendulo', 'squat pendular'],
    images: []
  },
  {
    id: 'legs_agachamento_frontal_maquina',
    name: 'Agachamento Frontal na Máquina',
    thumbnail: '🏋️ Front Squat Máquina',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'core'],
    equipment: 'Máquina Front Squat',
    level: 'intermediate',
    executionSteps: [
      'Posicione os ombros sob as almofadas dianteiras com os braços confortavelmente apoiados.',
      'Ajuste os pés na plataforma ligeiramente à frente do eixo do corpo.',
      'Destrave o mecanismo e desça com o tronco totalmente vertical até flexão profunda dos joelhos.',
      'Empurre o piso com força e estenda as pernas controladamente.'
    ],
    postureTips: [
      'O vetor frontal enfatiza o reto femoral e vastos com mínima sobrecarga na coluna lombar.',
      'Mantenha o peito aberto e cabeça alinhada com a coluna.'
    ],
    breathing: 'Puxe o ar na descida controlada; solte o ar na extensão das pernas.',
    commonErrors: [
      'Inclinar o tronco excessivamente à frente perdendo o foco do apoio frontal.',
      'Tirar a sola dos pés da plataforma na parte mais baixa.'
    ],
    errorCorrections: [
      'Concentre o movimento na flexão dos joelhos mantendo o tronco o mais vertical possível.',
      'Mantenha os calcanhares cravados na plataforma.'
    ],
    variations: ['Agachamento Frontal com Barra', 'Agachamento Goblet'],
    substitutions: ['legs_agachamento_frontal', 'legs_agachamento_goblet', 'legs_agachamento_hack'],
    safetyWarnings: [
      'Certifique-se de que a trava de liberação foi totalmente acionada antes de descer.',
      'Use calçado com sola firme e antiderrapante.'
    ],
    restrictions: [
      'Excelente alternativa para quem não consegue segurar a barra livre no ombro devido a rigidez no punho.',
      'Cuidado com compressão patelar profunda em portadores de condromalácia.'
    ],
    substitutionsHint: 'Se a academia não tiver esta máquina, faça Agachamento Frontal com Barra ou Agachamento Goblet com haltere pesado.',
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes', 'core'],
    movementPatternIds: ['squat'],
    equipmentIds: ['front_squat_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    searchTerms: ['front squat maquina', 'agachamento frontal maquina', 'front squat guiado', 'maquina de agachamento frontal'],
    images: []
  },
  {
    id: 'legs_agachamento_hack_invertido',
    name: 'Hack Squat Invertido',
    thumbnail: '🔥 Hack Invertido',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: 'Máquina Hack',
    level: 'advanced',
    executionSteps: [
      'Posicione-se de frente para o encosto do Hack com o peito apoiado no estofado.',
      'Apoie os ombros sob as almofadas e posicione os pés na parte superior da plataforma.',
      'Destrave a máquina e desça projetando o quadril para trás como em um agachamento livre profundo.',
      'Empurre o piso com os calcanhares e estenda os quadris e joelhos com foco nos glúteos.'
    ],
    postureTips: [
      'A posição invertida permite maior flexão de quadril com foco brutal em glúteos e posteriores.',
      'Mantenha a coluna lombar rígida e não permita arredondamento da pelve.'
    ],
    breathing: 'Inspire ao descer empurrando os quadris para trás; expire na subida explosiva.',
    commonErrors: [
      'Descolar o tórax da almofada e sobrecarregar a lombar.',
      'Colocar os pés muito baixos forçando os joelhos para a frente sem necessidade.'
    ],
    errorCorrections: [
      'Mantenha o peito sempre encostado e use a plataforma alta.',
      'Foque o movimento no quadril (padrão de agachamento com hinge).'
    ],
    variations: ['Hack Squat Tradicional', 'Agachamento Sumô no Smith'],
    substitutions: ['legs_agachamento_hack', 'glutes_elevacao_pelvica', 'legs_agachamento_barra'],
    safetyWarnings: [
      'Exige força e consciência corporal; não tente cargas máximas sem dominar a pegada e o destravamento.',
      'Mantenha as travas de emergência reguladas.'
    ],
    restrictions: [
      'Contraindicado em pessoas com lombalgia crônica ou dificuldade de manter a coluna estável sob compressão axial invertida.',
      'Evite se houver desconforto nos deltoides pelo apoio da almofada invertida.'
    ],
    substitutionsHint: 'Excelente para glúteo e cadeia posterior. Substitutos: Agachamento Livre com Barra ou Elevação Pélvica com Barra.',
    primaryMuscleGroupId: 'glutes',
    secondaryMuscleGroupIds: ['quadriceps', 'hamstrings'],
    movementPatternIds: ['squat', 'hip_extension'],
    equipmentIds: ['hack_squat_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    searchTerms: ['hack invertido', 'reverse hack squat', 'agachamento hack invertido', 'hack de costas'],
    images: []
  },
  {
    id: 'legs_hack_sentado',
    name: 'Hack Sentado na Máquina',
    thumbnail: '🪑 Hack Sentado',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes'],
    equipment: 'Máquina Hack Sentado',
    level: 'intermediate',
    executionSteps: [
      'Sente-se no aparelho com a coluna totalmente apoiada e pés posicionados na plataforma frontal.',
      'Segure as manoplas laterais e destrave o sistema de segurança.',
      'Desça o peso flexionando os joelhos em ângulo de 90° com total estabilidade lombar.',
      'Empurre a plataforma até a extensão quase completa dos joelhos.'
    ],
    postureTips: [
      'O ângulo sentado isola os quadríceps com suporte ergonômico completo para as costas.',
      'Não tire os quadris do assento durante o ponto de inversão do movimento.'
    ],
    breathing: 'Inspire na flexão controlada dos joelhos; expire ao empurrar a carga.',
    commonErrors: [
      'Tirar a lombar do apoio ao tentar descer além da amplitude natural da máquina.',
      'Empurrar o peso apenas na ponta dos dedos.'
    ],
    errorCorrections: [
      'Apoie o pé inteiro com foco na pressão do calcanhar.',
      'Mantenha as costas coladas ao banco durante todo o tempo.'
    ],
    variations: ['Leg Press 45°', 'Agachamento Hack Tradicional'],
    substitutions: ['legs_agachamento_hack', 'legs_legpress_45', 'legs_agachamento_goblet'],
    safetyWarnings: [
      'Verifique o travamento do assento antes de carregar peso.',
      'Não bloqueie as articulações dos joelhos na extensão máxima.'
    ],
    restrictions: [
      'Ideal para quem tem restrição lombar severa e não tolera agachamento com carga sobre os ombros.',
      'Mantenha joelhos protegidos com cadência de descida de 2 a 3 segundos.'
    ],
    substitutionsHint: 'Se o Hack Sentado estiver ocupado, substitua pelo Leg Press 45° ou Agachamento Goblet.',
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes'],
    movementPatternIds: ['squat'],
    equipmentIds: ['seated_hack_squat_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    searchTerms: ['hack sentado', 'seated hack squat', 'hack machine sentado', 'agachamento hack sentado'],
    images: []
  },
  {
    id: 'legs_agachamento_sissy',
    name: 'Agachamento Sissy (Sissy Squat)',
    thumbnail: '🦵 Sissy Squat',
    muscleGroup: 'legs',
    secondaryMuscles: ['core'],
    equipment: 'Apoio de Sissy Squat / Peso Corporal',
    level: 'advanced',
    executionSteps: [
      'Prenda os tornozelos e apoie a parte posterior da panturrilha na almofada do banco Sissy.',
      'Mantenha o tronco e as coxas em linha reta contínua com abdômen contraído.',
      'Incline o tronco para trás flexionando os joelhos e levando o corpo em descida controlada.',
      'Empurre contra o suporte estendendo os joelhos pela contração máxima dos quadríceps.'
    ],
    postureTips: [
      'Isola o quadríceps e o reto femoral em posição de estiramento máximo sem compressão na coluna.',
      'Mantenha a pelve encaixada sem dobrar os quadris para trás.'
    ],
    breathing: 'Inspire ao descer inclinando o tronco para trás; expire ao retornar à vertical.',
    commonErrors: [
      'Quebrar a linha do quadril flexionando o tronco para a frente.',
      'Fazer o movimento rápido e quicar na articulação do joelho.'
    ],
    errorCorrections: [
      'Mantenha linha reta da coxa ao ombro com glúteos e abdômen ativados.',
      'Execute a descida de forma lenta e cadenciada.'
    ],
    variations: ['Cadeira Extensora', 'Agachamento Búlgaro'],
    substitutions: ['legs_cadeira_extensora', 'legs_agachamento_bulgaro', 'legs_agachamento_corporal'],
    safetyWarnings: [
      'Exige articulações dos joelhos saudáveis; não recomendado para iniciantes sem preparação articular prévia.',
      'Pode segurar em um suporte ou haltere leve para modular a carga.'
    ],
    restrictions: [
      'Contraindicado em pessoas com tendinite patelar aguda ou histórico de cirurgia de ligamento cruzado sem liberação médica.',
      'Suspenda caso sinta dor aguda na patela.'
    ],
    substitutionsHint: 'Isolamento brutal de quadríceps sem máquina pesada. Se não houver banco Sissy, substitua pela Cadeira Extensora.',
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['core'],
    movementPatternIds: ['knee_extension'],
    equipmentIds: ['bodyweight', 'flat_bench'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    searchTerms: ['sissy squat', 'agachamento sissy', 'sissy banco', 'quadriceps sissy'],
    images: []
  },
  {
    id: 'legs_afundo_smith',
    name: 'Afundo no Smith',
    thumbnail: '👣 Afundo no Smith',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: 'Máquina Smith',
    level: 'intermediate',
    executionSteps: [
      'Posicione a barra do Smith sobre os trapézios com pegada firme.',
      'Dê um passo à frente com uma perna e posicione o pé de trás apoiado na ponta dos dedos.',
      'Destrave a barra e desça verticalmente flexionando ambos os joelhos em 90°.',
      'Empurre o piso com o calcanhar dianteiro para retornar à posição inicial.'
    ],
    postureTips: [
      'A barra guiada elimina o desequilíbrio lateral permitindo foco total na contração muscular.',
      'Mantenha o joelho da frente apontado para a frente e o tronco levemente inclinado para proteger a patela.'
    ],
    breathing: 'Inspire ao descer suavemente; expire ao empurrar o solo para subir.',
    commonErrors: [
      'Colocar o pé dianteiro muito próximo do pé traseiro sobrecarregando o joelho.',
      'Bater o joelho traseiro no chão com impacto.'
    ],
    errorCorrections: [
      'Ajuste a distância dos pés para que ambas as pernas atinjam 90° de flexão.',
      'Controle a descida e pare a 2 cm do chão.'
    ],
    variations: ['Afundo com Halteres', 'Agachamento Búlgaro no Smith'],
    substitutions: ['legs_afundo_halteres', 'legs_agachamento_bulgaro', 'legs_legpress_45'],
    safetyWarnings: [
      'Regule as travas de segurança do Smith ligeiramente abaixo da sua amplitude de descida.',
      'Não faça giros com os joelhos durante a subida.'
    ],
    restrictions: [
      'Ideal para quem tem instabilidade de equilíbrio no afundo livre com halteres.',
      'Cuidado com amplitude excessiva se houver desconforto nos flexores de quadril da perna de trás.'
    ],
    substitutionsHint: 'Se o Smith estiver ocupado, faça Afundo com Halteres ou Passada com Halteres com mesmo estímulo unilateral.',
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes', 'hamstrings'],
    movementPatternIds: ['squat'],
    equipmentIds: ['smith_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    searchTerms: ['afundo smith', 'lunge smith', 'afundo na barra guiada', 'afundo no smith'],
    images: []
  },
  {
    id: 'legs_agachamento_bulgaro_smith',
    name: 'Agachamento Búlgaro no Smith',
    thumbnail: '🔥 Búlgaro no Smith',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: 'Máquina Smith e Banco Reto',
    level: 'advanced',
    executionSteps: [
      'Coloque um banco reto atrás da barra do Smith e apoie o peito de um dos pés no banco.',
      'Posicione o pé dianteiro firme à frente com a barra do Smith apoiada nos trapézios.',
      'Destrave a barra e desça flexionando o joelho dianteiro e levando o quadril para baixo e para trás.',
      'Empurre o chão com o calcanhar da frente até estender a perna quase que totalmente.'
    ],
    postureTips: [
      'O Smith estabiliza a barra permitindo maior intensidade e carga no glúteo e quadríceps da perna ativa.',
      'Incline o tronco cerca de 15° à frente para maximizar o braço de momento do glúteo máximo.'
    ],
    breathing: 'Inspire descendo controladamente; expire com vigor ao empurrar o piso.',
    commonErrors: [
      'Pressionar o pé de trás contra o banco fazendo força com a perna errada.',
      'Deixar o joelho dianteiro colapsar em valgo para dentro.'
    ],
    errorCorrections: [
      'A perna de trás é apenas ponto de apoio; 95% do esforço deve vir da perna da frente.',
      'Empurre o joelho da frente ligeiramente para fora na direção do quarto dedo do pé.'
    ],
    variations: ['Agachamento Búlgaro com Halteres', 'Afundo no Smith'],
    substitutions: ['legs_agachamento_bulgaro', 'legs_afundo_halteres', 'legs_legpress_45'],
    safetyWarnings: [
      'Ajuste os limitadores de segurança mecânicos do Smith para evitar prender-se sob a barra.',
      'Treine primeiro sem anilhas para calibrar a distância ideal do banco.'
    ],
    restrictions: [
      'Exige flexibilidade dos flexores de quadril da perna apoiada no banco.',
      'Se houver dor patelofemoral, aumente o avanço do pé dianteiro para reduzir a flexão do joelho.'
    ],
    substitutionsHint: 'Excelente para glúteo e perna sem oscilação lateral. Substitutos: Agachamento Búlgaro com Halteres ou Leg Press Unilateral.',
    primaryMuscleGroupId: 'glutes',
    secondaryMuscleGroupIds: ['quadriceps', 'hamstrings'],
    movementPatternIds: ['squat'],
    equipmentIds: ['smith_machine', 'flat_bench', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    searchTerms: ['bulgaro smith', 'agachamento bulgaro smith', 'bulgarian split squat smith', 'bulgaro na barra guiada'],
    images: []
  },
  {
    id: 'legs_flexora_em_pe_maquina',
    name: 'Cadeira Flexora em Pé Unilateral',
    thumbnail: '🦵 Flexora em Pé',
    muscleGroup: 'legs',
    secondaryMuscles: ['calves'],
    equipment: 'Máquina Flexora em Pé',
    level: 'intermediate',
    executionSteps: [
      'Apoie o tronco no encosto frontal e posicione a parte posterior do tornozelo sob a almofada do braço mecânico.',
      'Alinhe o joelho da perna ativa com o eixo de rotação da máquina.',
      'Flexione o joelho elevando o calcanhar em direção ao glúteo em contração máxima.',
      'Retorne de forma controlada até o alongamento completo dos isquiotibiais.'
    ],
    postureTips: [
      'O trabalho unilateral corrige discrepâncias de força entre a perna direita e esquerda.',
      'Mantenha o quadril fixo no apoio frontal sem empinar as nádegas para compensar a carga.'
    ],
    breathing: 'Expire ao flexionar o joelho contraindo o posterior; inspire na descida lenta.',
    commonErrors: [
      'Girar a pelve para o lado para conseguir puxar o peso.',
      'Deixar a perna estender com solavanco no final da repetição.'
    ],
    errorCorrections: [
      'Mantenha o abdômen contraído e a bacia colada no estofamento.',
      'Freie a descida em 2 segundos sentindo a fase excêntrica.'
    ],
    variations: ['Mesa Flexora', 'Cadeira Flexora Sentada'],
    substitutions: ['legs_mesa_flexora', 'legs_flexora_sentado', 'legs_stiff_halteres'],
    safetyWarnings: [
      'Regule a almofada do tornozelo na altura correta (logo acima do calcanhar, sobre o tendão de Aquiles).',
      'Não use cargas que provoquem arqueamento da lombar.'
    ],
    restrictions: [
      'Excelente para quem sente dor lombar na mesa flexora deitada.',
      'Cuidado com câimbras na panturrilha; mantenha o tornozelo relaxado ou em leve dorsiflexão.'
    ],
    substitutionsHint: 'Se a máquina estiver ocupada, faça Mesa Flexora Unilateral ou Cadeira Flexora Sentada.',
    primaryMuscleGroupId: 'hamstrings',
    secondaryMuscleGroupIds: ['calves'],
    movementPatternIds: ['knee_flexion'],
    equipmentIds: ['standing_leg_curl_machine'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    searchTerms: ['flexora em pe', 'standing leg curl', 'flexora unilateral em pe', 'maquina flexora em pe', 'flexora vertical'],
    images: []
  },
  {
    id: 'legs_flexora_articulada',
    name: 'Flexora Articulada',
    thumbnail: '⚡ Flexora Articulada',
    muscleGroup: 'legs',
    secondaryMuscles: ['calves'],
    equipment: 'Máquina Flexora Articulada (Plate Loaded)',
    level: 'intermediate',
    executionSteps: [
      'Deite-se no estofado angulado e posicione os rolos atrás dos calcanhares.',
      'Segure com firmeza nas manoplas e mantenha a pelve apoiada no banco.',
      'Puxe os calcanhares em direção aos glúteos flexionando os joelhos contra a carga das anilhas.',
      'Desça de maneira contínua até estender as pernas sob controle.'
    ],
    postureTips: [
      'A biomecânica articulada com anilhas entrega curva de força convergente que respeita o comprimento dos isquiotibiais.',
      'Mantenha a cabeça relaxada e olhar apontado para o colchonete.'
    ],
    breathing: 'Expire na subida dos calcanhares; inspire na fase excêntrica de descida.',
    commonErrors: [
      'Arquear as costas e tirar a barriga do banco para puxar o peso.',
      'Fazer repetições incompletas por excesso de anilhas.'
    ],
    errorCorrections: [
      'Aperte o abdômen e pressione o púbis contra o estofamento.',
      'Utilize uma carga que permita flexão completa de joelhos.'
    ],
    variations: ['Mesa Flexora Convencional', 'Stiff com Barra'],
    substitutions: ['legs_mesa_flexora', 'legs_flexora_sentado', 'legs_stiff'],
    safetyWarnings: [
      'Use anilhas bem presas com travas de segurança.',
      'Não solte o peso de uma vez ao término da série.'
    ],
    restrictions: [
      'Pessoas com estiramento prévio de isquiotibiais devem evitar repetições balísticas.',
      'Monitore a pressão lombar mantendo o abdômen travado.'
    ],
    substitutionsHint: 'Comum em academias com maquinário pesado de anilhas. Substitutos: Mesa Flexora na polia/placas ou Stiff com Halteres.',
    primaryMuscleGroupId: 'hamstrings',
    secondaryMuscleGroupIds: ['calves'],
    movementPatternIds: ['knee_flexion'],
    equipmentIds: ['articulated_leg_curl_machine', 'weight_plates'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'prone',
    searchTerms: ['flexora articulada', 'plate loaded leg curl', 'mesa flexora articulada', 'flexora anilhas'],
    images: []
  },
  {
    id: 'legs_stiff_smith',
    name: 'Stiff no Smith',
    thumbnail: '🏋️ Stiff no Smith',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'lower_back'],
    equipment: 'Máquina Smith',
    level: 'intermediate',
    executionSteps: [
      'Posicione a barra do Smith na altura das coxas com os pés na largura dos ombros.',
      'Segure a barra com pegada pronada e destrave a barra girando os punhos.',
      'Empurre o quadril para trás mantendo os joelhos com semiflexão de 15° e coluna lombar totalmente neutra.',
      'Desça a barra rente às pernas até sentir forte alongamento nos isquiotibiais.',
      'Retorne estendendo os quadris e contraindo glúteos no topo.'
    ],
    postureTips: [
      'A barra guiada do Smith impede que a carga balance para a frente, diminuindo o braço de alavanca na coluna lombar.',
      'Mantenha o peito aberto e escápulas aduzidas durante toda a descida.'
    ],
    breathing: 'Inspire profundamente descendo a barra; expire ao estender o quadril no topo.',
    commonErrors: [
      'Arredondar a coluna lombar para tentar tocar a barra no chão.',
      'Flexionar os joelhos como se fosse um agachamento perdendo a dobradiça de quadril.'
    ],
    errorCorrections: [
      'Mantenha o peito alto e os olhos focados a 2 metros à frente no solo.',
      'A flexão ocorre no quadril empurrando os glúteos para trás, com os joelhos estáveis.'
    ],
    variations: ['Stiff com Barra Livre', 'Stiff com Halteres'],
    substitutions: ['legs_stiff', 'legs_stiff_halteres', 'legs_terra_romeno'],
    safetyWarnings: [
      'Regule as travas do Smith na altura das canelas para segurança absoluta.',
      'Use pegada firme ou straps caso a pegada abra antes da fadiga dos posteriores.'
    ],
    restrictions: [
      'Excelente para praticantes que sentem insegurança no stiff livre.',
      'Contraindicado em crise aguda de lombalgia ou hérnia discal com dor ciática.'
    ],
    substitutionsHint: 'Se o Smith estiver ocupado, faça Stiff com Barra Livre ou com Halteres mantendo o mesmo padrão hinge.',
    primaryMuscleGroupId: 'hamstrings',
    secondaryMuscleGroupIds: ['glutes', 'lower_back'],
    movementPatternIds: ['hip_hinge'],
    equipmentIds: ['smith_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    searchTerms: ['stiff smith', 'stiff no smith', 'smith stiff deadlift', 'stiff barra guiada'],
    images: []
  },
  {
    id: 'glutes_elevacao_pelvica_maquina',
    name: 'Elevação Pélvica na Máquina',
    thumbnail: '🍑 Pélvica na Máquina',
    muscleGroup: 'glutes',
    secondaryMuscles: ['hamstrings', 'core'],
    equipment: 'Máquina de Elevação Pélvica (Hip Thrust Machine)',
    level: 'intermediate',
    executionSteps: [
      'Sente-se no aparelho e ajuste o cinto acolchoado ou a barra mecânica sobre a linha dos quadris.',
      'Apoie as costas no encosto móvel e posicione os pés na plataforma na largura dos ombros.',
      'Destrave a alavanca lateral e desça a pelve alongando os glúteos.',
      'Empurre com os calcanhares estendendo a pelve até o alinhamento com as coxas e contraia forte no topo.'
    ],
    postureTips: [
      'Elimina o desconforto de montar barra pesada e anilhas sobre o osso da bacia.',
      'No topo do movimento, faça retroversão da pelve e aperte os glúteos sem hiperextender a coluna lombar.'
    ],
    breathing: 'Inspire ao descer os quadris; expire com vigor ao elevar a carga e apertar os glúteos.',
    commonErrors: [
      'Hiperestender a coluna lombar no topo descolando as costas do apoio.',
      'Posicionar os pés muito perto dos glúteos sobrecarregando o quadríceps em vez do glúteo.'
    ],
    errorCorrections: [
      'Olhe para a frente durante toda a repetição para travar a pelve no alinhamento correto.',
      'Mantenha as tíbias na vertical no pico de contração.'
    ],
    variations: ['Elevação Pélvica com Barra', 'Ponte de Glúteos no Solo'],
    substitutions: ['glutes_elevacao_pelvica', 'glutes_ponte_solo', 'legs_agachamento_sumo_halter'],
    safetyWarnings: [
      'Prenda o cinto com firmeza e confira se a trava lateral engata perfeitamente ao final da série.',
      'Não despenque com o peso no descanso.'
    ],
    restrictions: [
      'Muito mais confortável e segura para quem tem sensibilidade nas cristas ilíacas da bacia.',
      'Monitore a pressão lombar mantendo o abdômen acionado.'
    ],
    substitutionsHint: 'Aparelho presente na maioria das academias modernas BR. Se ocupada, use Elevação Pélvica com Barra e banco ou Ponte com Anilha.',
    primaryMuscleGroupId: 'glutes',
    secondaryMuscleGroupIds: ['hamstrings', 'core'],
    movementPatternIds: ['hip_extension'],
    equipmentIds: ['hip_thrust_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    searchTerms: ['elevacao pelvica maquina', 'hip thrust machine', 'maquina de elevacao pelvica', 'pelvica maquina', 'hip thrust aparelho'],
    images: []
  },
  {
    id: 'glutes_coice_maquina',
    name: 'Glúteo na Máquina (Coice)',
    thumbnail: '🦵 Glúteo Máquina',
    muscleGroup: 'glutes',
    secondaryMuscles: ['hamstrings'],
    equipment: 'Máquina de Glúteo (Glute Kickback Machine)',
    level: 'beginner',
    executionSteps: [
      'Apoie o peito e os antebraços nos estofados da máquina.',
      'Posicione a sola do pé ativo na placa de empurrão da alavanca articulada.',
      'Empurre a placa para trás e para cima através da extensão potente do quadril.',
      'Retorne de forma controlada até sentir o alongamento do glúteo sem perder a tensão.'
    ],
    postureTips: [
      'Concentre todo o empurrão na musculatura do glúteo máximo sem rodar o quadril para o lado.',
      'Mantenha a coluna neutra e o abdômen contraído durante todo o percurso.'
    ],
    breathing: 'Expire ao empurrar a placa para trás; inspire ao retornar a perna à posição inicial.',
    commonErrors: [
      'Arquear a coluna lombar a cada chute para fingir maior amplitude.',
      'Empurrar o peso apenas com a ponta dos pés.'
    ],
    errorCorrections: [
      'Mantenha a coluna imóvel e mova apenas a articulação do quadril.',
      'Empurre com o calcanhar e meio do pé contra a plataforma.'
    ],
    variations: ['Glúteo no Cabo com Caneleira', 'Glúteo Quatro Apoios no Solo'],
    substitutions: ['glutes_gluteo_cabo', 'glutes_coice_quatro_apoios', 'glutes_elevacao_pelvica'],
    safetyWarnings: [
      'Ajuste o apoio peitoral de acordo com a sua estatura.',
      'Não solte a perna rapidamente no final da série.'
    ],
    restrictions: [
      'Excelente para pessoas que não podem ajoelhar no chão por dores na patela.',
      'Se sentir compressão lombar, reduza a carga e diminua ligeiramente o arco final do chute.'
    ],
    substitutionsHint: 'Aparelho de glúteo de fácil execução. Se ocupado, substitua por Glúteo no Cabo com Tornozeleira ou Elevação Pélvica.',
    primaryMuscleGroupId: 'glutes',
    secondaryMuscleGroupIds: ['hamstrings'],
    movementPatternIds: ['hip_extension'],
    equipmentIds: ['glute_kickback_machine'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    searchTerms: ['gluteo maquina', 'maquina gluteo', 'glute kickback machine', 'coice maquina', 'aparelho gluteo'],
    images: []
  },
  {
    id: 'glutes_abducao_cabo',
    name: 'Abdução de Quadril no Cabo',
    thumbnail: '⚡ Abdução no Cabo',
    muscleGroup: 'glutes',
    secondaryMuscles: ['abductors'],
    equipment: 'Polia Baixa e Tornozeleira',
    level: 'intermediate',
    executionSteps: [
      'Prenda a tornozeleira no tornozelo e conecte-a ao mosquetão da polia baixa.',
      'Fique de lado para a torre de cabos segurando o suporte com a mão interna.',
      'Afaste a perna externa lateralmente em movimento de abdução contra a resistência do cabo.',
      'Retorne lentamente controlando a volta sem encostar o peso nas placas.'
    ],
    postureTips: [
      'Incline o tronco cerca de 15° à frente para alinhar o vetor de força com as fibras posteriores do glúteo médio.',
      'A perna de apoio deve manter o joelho ligeiramente destravado para absorver a tensão.'
    ],
    breathing: 'Expire ao afastar a perna lateralmente; inspire ao retornar a perna ao centro.',
    commonErrors: [
      'Girar o tronco ou a pelve para o lado para ajudar na subida da perna.',
      'Deixar a perna voltar rápido desestabilizando o quadril.'
    ],
    errorCorrections: [
      'Mantenha a bacia fixa e perpendicular à torre de cabos.',
      'Execute a fase excêntrica de retorno com cadência controlada de 2 segundos.'
    ],
    variations: ['Cadeira Abdutora', 'Abdução com Caneleira no Solo'],
    substitutions: ['legs_cadeira_abdutora', 'glutes_elevacao_pelvica', 'glutes_gluteo_cabo'],
    safetyWarnings: [
      'Verifique se a tornozeleira está bem presa e com fecho de velcro firme.',
      'Mantenha o cabo desobstruído.'
    ],
    restrictions: [
      'Excelente para fortalecimento de glúteo médio e prevenção de joelho em valgo dinâmico.',
      'Cuidado em portadores de bursite trocantérica aguda; regule a carga para nível leve a moderado.'
    ],
    substitutionsHint: 'Alternativa fantástica à cadeira abdutora com amplitude livre. Substitutos: Cadeira Abdutora ou Abdução no solo com caneleira.',
    primaryMuscleGroupId: 'abductors',
    secondaryMuscleGroupIds: ['glutes'],
    movementPatternIds: ['hip_abduction'],
    equipmentIds: ['low_cable_station', 'ankle_weights'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    searchTerms: ['abducao cabo', 'abducao na polia', 'gluteo medio cabo', 'abducao tornozeleira polia'],
    images: []
  },
  {
    id: 'legs_aducao_cabo',
    name: 'Adução de Quadril no Cabo',
    thumbnail: '⚡ Adução no Cabo',
    muscleGroup: 'legs',
    secondaryMuscles: ['adductors'],
    equipment: 'Polia Baixa e Tornozeleira',
    level: 'intermediate',
    executionSteps: [
      'Prenda a tornozeleira na perna interna mais próxima da torre da polia baixa.',
      'Dê um passo lateral para afastar-se ligeiramente da torre e segure-se em um apoio firme.',
      'Puxe a perna para dentro cruzando ligeiramente à frente da perna de apoio.',
      'Retorne controladamente sentindo o alongamento dos músculos adutores da parte interna da coxa.'
    ],
    postureTips: [
      'Mantenha o joelho da perna ativa estendido ou com mínima semiflexão natural.',
      'O tronco permanece estável e na vertical sem balanços.'
    ],
    breathing: 'Expire ao puxar a perna para a linha média corporal; inspire ao abrir a perna de volta.',
    commonErrors: [
      'Usar carga pesada demais que puxe o corpo em direção à máquina desequilibrando o aluno.',
      'Fletir o tronco lateralmente para ajudar a puxar o cabo.'
    ],
    errorCorrections: [
      'Utilize cargas moderadas priorizando a amplitude e contração controlada dos adutores.',
      'Mantenha os ombros alinhados e firmes.'
    ],
    variations: ['Cadeira Adutora', 'Agachamento Sumô'],
    substitutions: ['legs_cadeira_adutora', 'legs_agachamento_sumo_halter', 'legs_legpress_45'],
    safetyWarnings: [
      'Prenda bem o velcro da tornozeleira para não abrir sob tensão.',
      'Fique atento para não tropeçar no cabo com o pé de apoio.'
    ],
    restrictions: [
      'Pessoas com histórico de pubalgia ou estiramento de adutor devem executar com amplitude e carga reduzidas.',
      'Pare se sentir dor na virilha.'
    ],
    substitutionsHint: 'Alternativa funcional à máquina adutora para estabilidade de quadril. Substitutos: Cadeira Adutora ou Agachamento Sumô com halteres.',
    primaryMuscleGroupId: 'adductors',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['hip_adduction'],
    equipmentIds: ['low_cable_station', 'ankle_weights'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    searchTerms: ['aducao cabo', 'aducao na polia', 'adutores cabo', 'aducao tornozeleira'],
    images: []
  },
  {
    id: 'calves_panturrilha_step_haltere',
    name: 'Panturrilha Unilateral no Step com Haltere',
    thumbnail: '🦶 Panturrilha no Step',
    muscleGroup: 'calves',
    secondaryMuscles: [],
    equipment: 'Halteres e Step',
    level: 'intermediate',
    executionSteps: [
      'Apoie o terço anterior de um pé na borda do step e segure um haltere na mão do mesmo lado.',
      'Com a outra mão, apoie-se levemente em uma parede ou barra para manter o equilíbrio.',
      'Desça o calcanhar ao máximo sentindo o alongamento do tendão de Aquiles e panturrilha.',
      'Eleve o calcanhar com força máxima até a ponta do pé e segure a contração por 1 segundo.'
    ],
    postureTips: [
      'O trabalho unilateral garante que cada panturrilha trabalhe com a mesma sobrecarga e amplitude.',
      'Mantenha o joelho da perna ativa com leve semiflexão rígida para atingir o gastrocnêmio.'
    ],
    breathing: 'Expire ao subir na ponta do pé; inspire na descida lenta e profunda.',
    commonErrors: [
      'Realizar repetições rápidas quicando no tendão sem amplitude de alongamento.',
      'Fazer força com a mão de apoio para se puxar para cima.'
    ],
    errorCorrections: [
      'Faça uma pausa de 1 segundo no ponto mais baixo e 1 segundo no ponto mais alto.',
      'A mão de apoio serve exclusivamente para equilíbrio lateral.'
    ],
    variations: ['Panturrilha em Pé na Máquina', 'Panturrilha no Smith'],
    substitutions: ['calves_panturrilha_em_pe', 'calves_panturrilha_leg_press', 'calves_panturrilha_halter'],
    safetyWarnings: [
      'Certifique-se de que o step está posicionado sobre piso antiderrapante e firme.',
      'Não despenque o calcanhar com choque no chão.'
    ],
    restrictions: [
      'Portadores de fascite plantar aguda ou tendinite calcânea devem moderar a descida no step.',
      'Se sentir estiramento doloroso na planta do pé, reduza a profundidade.'
    ],
    substitutionsHint: 'Exercício acessível em qualquer academia brasileira quando as máquinas de panturrilha estiverem ocupadas. Substitutos: Panturrilha na Máquina em Pé ou no Leg Press.',
    primaryMuscleGroupId: 'calves',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['calf_raise'],
    equipmentIds: ['dumbbells', 'step_platform'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    searchTerms: ['panturrilha step', 'panturrilha unilateral step', 'gemeos step haltere', 'panturrilha com halter no step'],
    images: []
  },
  {
    id: 'calves_panturrilha_smith',
    name: 'Panturrilha em Pé no Smith com Step',
    thumbnail: '⚡ Panturrilha no Smith',
    muscleGroup: 'calves',
    secondaryMuscles: [],
    equipment: 'Máquina Smith e Step',
    level: 'intermediate',
    executionSteps: [
      'Posicione um step firme logo abaixo da barra da máquina Smith.',
      'Apoie a barra nos trapézios e posicione as pontas dos pés na borda do step.',
      'Destrave a barra do Smith e desça os calcanhares para baixo da linha do degrau em alongamento total.',
      'Suba na ponta dos pés estendendo os tornozelos em contração máxima.'
    ],
    postureTips: [
      'A guia vertical do Smith confere estabilidade permitindo foco total na flexão plantar sob carga.',
      'Mantenha as pernas esticadas e abdômen contraído sem balançar o quadril.'
    ],
    breathing: 'Expire ao subir na ponta dos pés; inspire na descida controlada.',
    commonErrors: [
      'Flexionar os joelhos durante a subida transformando o exercício em agachamento parcial.',
      'Pisar no step com menos de um terço do pé correndo risco de escorregar.'
    ],
    errorCorrections: [
      'Mantenha os joelhos firmes com flexão constante mínima de 5°.',
      'Apoie com segurança os metatarsos dos pés sobre a plataforma.'
    ],
    variations: ['Panturrilha em Pé na Máquina', 'Panturrilha no Leg Press 45°'],
    substitutions: ['calves_panturrilha_em_pe', 'calves_panturrilha_leg_press', 'calves_panturrilha_step_haltere'],
    safetyWarnings: [
      'Ajuste as travas de emergência do Smith na altura do step para evitar acidentes.',
      'Calçado com boa aderência é obrigatório.'
    ],
    restrictions: [
      'Cuidado com sobrecarga na coluna caso haja histórico de hérnia de disco; prefira panturrilha no leg press nesses casos.',
      'Evite amplitude máxima se houver tendinite de Aquiles.'
    ],
    substitutionsHint: 'Excelente alternativa à máquina de panturrilha em pé. Substitutos: Panturrilha na Máquina em Pé ou Panturrilha no Leg Press 45°.',
    primaryMuscleGroupId: 'calves',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['calf_raise'],
    equipmentIds: ['smith_machine', 'step_platform', 'weight_plates'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    searchTerms: ['panturrilha smith', 'panturrilha no smith', 'gemeos no smith', 'panturrilha barra guiada step'],
    images: []
  },
  {
    id: 'calves_panturrilha_solo_livre',
    name: 'Panturrilha no Solo com Peso Corporal',
    thumbnail: '👣 Panturrilha no Solo',
    muscleGroup: 'calves',
    secondaryMuscles: [],
    equipment: 'Peso Corporal / Colchonete',
    level: 'beginner',
    executionSteps: [
      'Fique em pé no solo com postura ereta e pés afastados na largura do quadril.',
      'Eleve os calcanhares o mais alto possível apoiando-se sobre as pontas dos pés.',
      'Segure o pico de contração no topo por 1 a 2 segundos.',
      'Desça os calcanhares lentamente até encostar suavemente no solo e repita.'
    ],
    postureTips: [
      'Excelente para aquecimento, reabilitação articular e treinos em casa sem equipamento.',
      'Pode ser feito de forma unilateral para dobrar a intensidade.'
    ],
    breathing: 'Expire ao subir na ponta dos pés; inspire ao descer os calcanhares.',
    commonErrors: [
      'Balançar o corpo para frente e para trás para pegar impulso.',
      'Fazer movimentos curtíssimos sem contração real.'
    ],
    errorCorrections: [
      'Suba verticalmente imaginando a cabeça sendo puxada para o teto.',
      'Aperte as panturrilhas com firmeza no topo da repetição.'
    ],
    variations: ['Panturrilha no Step com Haltere', 'Panturrilha em Pé na Máquina'],
    substitutions: ['calves_panturrilha_halter', 'calves_panturrilha_em_pe', 'calves_panturrilha_sentado'],
    safetyWarnings: [
      'Pessoas com histórico de cãibras devem realizar alongamento prévio leve.',
      'Mantenha uma parede próxima para apoio caso sinta perda de equilíbrio.'
    ],
    restrictions: [
      'Sem contraindicações relevantes; ideal para retorno após lesões de tornozelo ou sedentarismo.',
      'Aumente o número de repetições conforme o ganho de resistência muscular.'
    ],
    substitutionsHint: 'Kit zero equipamento para panturrilhas. Para aumentar a intensidade, faça de forma unilateral ou adicione um step.',
    primaryMuscleGroupId: 'calves',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['calf_raise'],
    equipmentIds: ['bodyweight'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    searchTerms: ['panturrilha solo', 'panturrilha peso corporal', 'calves bodyweight', 'gemeos solo'],
    images: []
  },
  {
    id: 'chest_supino_articulado_reto',
    name: 'Supino Reto Articulado',
    thumbnail: '🏋️ Supino Articulado',
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'Máquina de Supino Articulado com Anilhas',
    level: 'intermediate',
    executionSteps: [
      'Sente-se no banco da máquina articulada com os pés firmemente apoiados no chão.',
      'Ajuste o assento para que as manoplas fiquem no nível do peitoral médio.',
      'Empurre as manoplas para a frente estendendo os braços de forma convergente.',
      'Retorne de forma controlada sentindo o alongamento do peito sem bater as travas.'
    ],
    postureTips: [
      'A trajetória convergente dos braços mecânicos respeita a função biomecânica de adução horizontal do peitoral.',
      'Mantenha as escápulas retraídas e encostadas no banco durante todo o exercício.'
    ],
    breathing: 'Inspire na descida das alavancas; expire com força ao empurrar as manoplas à frente.',
    commonErrors: [
      'Descolar os ombros e escápulas do encosto na extensão final dos braços.',
      'Abrir os cotovelos excessivamente desalinhados com o punho.'
    ],
    errorCorrections: [
      'Mantenha o peito estufado e os ombros colados no encosto.',
      'Cotovelos devem manter ângulo de aproximadamente 45° a 60° em relação ao tronco.'
    ],
    variations: ['Supino Reto com Barra', 'Supino Reto com Halteres'],
    substitutions: ['chest_supino_reto', 'chest_supino_haltere', 'chest_supino_maquina'],
    safetyWarnings: [
      'Verifique se as anilhas estão equilibradas em ambos os lados.',
      'Utilize o pedal de apoio (se disponível) para iniciar a primeira repetição com segurança.'
    ],
    restrictions: [
      'Mais seguro para ombros do que a barra livre, pois o movimento unilateral convergente reduz o torque no manguito.',
      'Monitore dor na inserção peitoral se usar amplitudes exageradas de descida.'
    ],
    substitutionsHint: 'Aparelho muito popular em academias brasileiras. Substitutos diretos com kit básico: Supino Reto com Halteres ou Supino Reto com Barra.',
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['triceps', 'shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['flat_chest_press_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    searchTerms: ['supino articulado', 'supino reto articulado', 'chest press articulado', 'supino maquina articulada', 'supino convergente'],
    images: []
  },
  {
    id: 'chest_supino_articulado_inclinado',
    name: 'Supino Inclinado Articulado',
    thumbnail: '⚡ Supino Inclinado Articulado',
    muscleGroup: 'chest',
    secondaryMuscles: ['shoulders', 'triceps'],
    equipment: 'Máquina de Supino Inclinado Articulado',
    level: 'intermediate',
    executionSteps: [
      'Ajuste o assento de modo que as manoplas comecem na altura da clavícula e peito superior.',
      'Segure firme nas pegadas e apoie a cabeça e coluna no encosto inclinado.',
      'Empurre os braços para cima e para frente na trajetória convergente do aparelho.',
      'Retorne lentamente até que sinta o alongamento da porção clavicular do peito.'
    ],
    postureTips: [
      'A trajetória convergente potencializa a contração das fibras superiores do peitoral.',
      'Não permita que os ombros se elevem em direção às orelhas durante a fase de empurrão.'
    ],
    breathing: 'Inspire durante o retorno das manoplas; expire ao empurrar para cima.',
    commonErrors: [
      'Arquear a lombar excessivamente descolando a bacia do assento.',
      'Bater o peso no final de cada repetição perdendo a tensão mecânica.'
    ],
    errorCorrections: [
      'Mantenha as costas e glúteos cravados no banco.',
      'Pare 1 cm antes do descanso mantendo tensão constante nas fibras do peito.'
    ],
    variations: ['Supino Inclinado com Halteres', 'Supino Inclinado com Barra'],
    substitutions: ['chest_supino_inclinado_haltere', 'chest_supino_inclinado_barra', 'chest_peck_deck'],
    safetyWarnings: [
      'Carregue os braços mecânicos com anilhas de mesmo peso em cada lado.',
      'Use o pedal auxiliar de saída para não forçar o manguito na largada.'
    ],
    restrictions: [
      'Excelente escolha para alunos com desconforto articular no supino inclinado livre.',
      'Pessoas com bursite subacromial devem ajustar o assento para amplitude confortável.'
    ],
    substitutionsHint: 'Item essencial nas academias BR. Se a máquina estiver ocupada, use Supino Inclinado com Halteres no banco a 30° ou 45°.',
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['shoulders', 'triceps'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['incline_chest_press_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    searchTerms: ['supino inclinado articulado', 'incline chest press articulado', 'supino 45 articulado', 'supino inclinado anilhas'],
    images: []
  },
  {
    id: 'chest_supino_articulado_vertical',
    name: 'Supino Vertical Articulado',
    thumbnail: '💪 Supino Vertical Articulado',
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'Máquina de Supino Vertical Articulado com Anilhas',
    level: 'intermediate',
    executionSteps: [
      'Sente-se com o tronco totalmente na vertical e apoie as costas no encosto.',
      'Segure nas manoplas pronadas ou neutras na altura do peito médio.',
      'Empurre as manoplas diretamente para a frente estendendo os cotovelos de forma coordenada.',
      'Retorne de forma controlada até sentir o peito alongar confortavelmente.'
    ],
    postureTips: [
      'A postura vertical facilita a respiração e melhora a estabilidade torácica.',
      'Aproveite a pegada neutra (se disponível) para aliviar o estresse no manguito rotador.'
    ],
    breathing: 'Inspire na fase excêntrica; expire na fase concêntrica empurrando as manoplas.',
    commonErrors: [
      'Projetar a cabeça para a frente afastando-a do encosto.',
      'Travar bruscamente os cotovelos em hiperextensão no final.'
    ],
    errorCorrections: [
      'Mantenha a cabeça em contato suave com o apoio cervical do banco.',
      'Deixe uma ligeira microflexão nos cotovelos no ápice da repetição.'
    ],
    variations: ['Supino Reto com Halteres', 'Supino Máquina Tradicional'],
    substitutions: ['chest_supino_haltere', 'chest_supino_maquina', 'chest_supino_reto'],
    safetyWarnings: [
      'Ajuste a profundidade do encosto e assento antes de colocar as anilhas.',
      'Mantenha os pés firmes no chão para base sólida.'
    ],
    restrictions: [
      'Muito tolerado por praticantes com dores na coluna lombar ao deitar.',
      'Evite amplitude excessiva se houver frouxidão ligamentar de ombro.'
    ],
    substitutionsHint: 'Excelente para peitoral sem necessidade de deitar em bancos. Substitutos: Supino Reto com Halteres ou Supino Reto na Máquina de Placas.',
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['triceps', 'shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['vertical_chest_press_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    searchTerms: ['supino vertical articulado', 'vertical chest press', 'supino vertical anilhas', 'supino sentado articulado'],
    images: []
  },
  {
    id: 'chest_supino_articulado_declinado',
    name: 'Supino Declinado Articulado',
    thumbnail: '⚡ Declinado Articulado',
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'Máquina de Supino Declinado Articulado',
    level: 'intermediate',
    executionSteps: [
      'Sente-se com as costas apoiadas e ajuste as manoplas para que comecem na linha inferior do tórax.',
      'Empurre as pegadas para a frente e para baixo acompanhando a trajetória declinada do aparelho.',
      'Contraia vigorosamente as porções inferiores do peitoral.',
      'Retorne lentamente controlando a subida dos pesos até a linha das costelas.'
    ],
    postureTips: [
      'Enfatiza a porção costal e esternal do peitoral com excelente estabilidade sentado.',
      'Mantenha os cotovelos levemente recolhidos junto ao tronco.'
    ],
    breathing: 'Inspire ao deixar as alavancas recuarem; expire ao empurrar para frente e para baixo.',
    commonErrors: [
      'Encolher os ombros na direção das orelhas.',
      'Empurrar o peso com desequilíbrio entre os braços.'
    ],
    errorCorrections: [
      'Mantenha as escápulas deprimidas e retraídas.',
      'Empurre de forma síncrona com ambos os braços.'
    ],
    variations: ['Paralelas', 'Crossover na Polia Alta'],
    substitutions: ['chest_paralelas', 'chest_crossover_polia', 'chest_supino_haltere'],
    safetyWarnings: [
      'Preste atenção à altura das anilhas em relação ao solo.',
      'Não solte os braços repentinamente ao final da série.'
    ],
    restrictions: [
      'Excelente alternativa para quem não pode deitar no banco canadense por labirintite ou refluxo.',
      'Mais suave nos ombros do que supinos retos ou inclinados.'
    ],
    substitutionsHint: 'Ótima opção para a parte inferior do peito. Substitutos: Paralelas com peso corporal ou Crossover na Polia Alta.',
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['triceps', 'shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['decline_chest_press_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    searchTerms: ['supino declinado articulado', 'decline chest press articulado', 'supino inferior articulado', 'declinado na maquina'],
    images: []
  },
  {
    id: 'chest_crucifixo_inclinado_maquina',
    name: 'Crucifixo Inclinado na Máquina',
    thumbnail: '🦅 Crucifixo Inclinado Máquina',
    muscleGroup: 'chest',
    secondaryMuscles: ['shoulders'],
    equipment: 'Máquina de Crucifixo Inclinado (Incline Fly Machine)',
    level: 'intermediate',
    executionSteps: [
      'Ajuste o assento e apoie o peito ou as costas no banco inclinado da máquina.',
      'Segure as manoplas com uma ligeira flexão fixa nos cotovelos.',
      'Feche os braços em arco convergente até que as mãos quase se toquem à frente do peito superior.',
      'Abra os braços lentamente sentindo o alongamento do peitoral sem hiperextender os ombros.'
    ],
    postureTips: [
      'Permite isolar a parte superior do peito com tensão contínua do início ao fim do arco.',
      'Mantenha o peito alto e os ombros colados no estofamento.'
    ],
    breathing: 'Inspire na abertura dos braços; expire ao fechar as manoplas à frente do peito.',
    commonErrors: [
      'Flexionar e estender os cotovelos durante o movimento transformando o exercício em supino.',
      'Projetar a cabeça para frente no fechamento.'
    ],
    errorCorrections: [
      'Mantenha o ângulo dos cotovelos travado durante toda a repetição.',
      'Foque em apertar a parte superior do peito no centro.'
    ],
    variations: ['Crucifixo Inclinado com Halteres', 'Crossover Baixo'],
    substitutions: ['chest_crucifixo_inclinado_haltere', 'chest_crossover_baixo', 'chest_peck_deck'],
    safetyWarnings: [
      'Regule os batentes de amplitude para não sofrer abertura forçada além da sua flexibilidade.',
      'Inicie com cargas moderadas para preservar o manguito.'
    ],
    restrictions: [
      'Contraindicado em crise de lesão no labrum glenoidal ou tendinite do bíceps braquial.',
      'Respeite os limites anatômicos da amplitude posterior.'
    ],
    substitutionsHint: 'Isolamento de peitoral superior guiado. Substitutos: Crucifixo Inclinado com Halteres no banco 30° ou Crossover Baixo na polia.',
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['incline_fly_machine', 'weight_plates'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    searchTerms: ['crucifixo inclinado maquina', 'incline fly machine', 'voador inclinado', 'crucifixo 45 maquina'],
    images: []
  },
  {
    id: 'chest_crossover_medio',
    name: 'Crossover na Polia Média',
    thumbnail: '⚡ Crossover Médio',
    muscleGroup: 'chest',
    secondaryMuscles: ['shoulders'],
    equipment: 'Crossover (Polia Média)',
    level: 'intermediate',
    executionSteps: [
      'Regule as polias do crossover na altura do peito ou metade do tronco.',
      'Segure as manoplas com pegada neutra e dê um passo à frente com base dividida e tronco firme.',
      'Traga os braços para frente em um arco horizontal fechando as mãos à frente do esterno.',
      'Retorne de forma controlada sentindo o alongamento peitoral sem deixar o corpo balançar.'
    ],
    postureTips: [
      'O plano horizontal do crossover médio atinge com perfeição as fibras mediais e esternais do peito.',
      'Mantenha os cotovelos levemente flexionados e travados.'
    ],
    breathing: 'Inspire na abertura excêntrica dos braços; expire ao juntar as mãos na contração máxima.',
    commonErrors: [
      'Balançar o tronco para a frente e para trás para fechar os cabos.',
      'Elevar os ombros na direção das orelhas.'
    ],
    errorCorrections: [
      'Mantenha o abdômen travado e a postura imóvel.',
      'Abaixe as escápulas e foque em esmagar o peitoral no meio.'
    ],
    variations: ['Crucifixo na Polia', 'Peck Deck'],
    substitutions: ['chest_crossover_polia', 'chest_peck_deck', 'chest_crucifixo_haltere'],
    safetyWarnings: [
      'Verifique se os pinos de regulagem de altura da polia estão completamente travados.',
      'Solte os cabos com cuidado ao final da série.'
    ],
    restrictions: [
      'Pessoas com instabilidade anterior de ombro devem evitar abrir os braços excessivamente para trás.',
      'Mantenha o movimento no plano confortável.'
    ],
    substitutionsHint: 'Excelente para contração de pico. Substitutos: Crucifixo Reto com Halteres ou Voador no Peck Deck.',
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['cable_crossover'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    searchTerms: ['crossover medio', 'crossover altura do peito', 'crossover polia media', 'crucifixo polia media'],
    images: []
  },
  {
    id: 'chest_flexao_joelhos',
    name: 'Flexão de Braços com Joelhos Apoiados',
    thumbnail: '🧘 Flexão com Joelhos',
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders', 'core'],
    equipment: 'Colchonete / Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Ajoelhe-se sobre o colchonete e posicione as mãos no solo ligeiramente mais afastadas que os ombros.',
      'Alinhe o corpo formando uma linha reta dos joelhos até os ombros, com abdômen contraído.',
      'Desça o peitoral em direção ao chão flexionando os cotovelos em cerca de 45° em relação ao tronco.',
      'Empurre o chão com as palmas das mãos até retornar à posição inicial.'
    ],
    postureTips: [
      'Reduz a carga do peso corporal em cerca de 50%, sendo ideal para iniciantes desenvolverem força no peitoral.',
      'Não deixe o quadril empinado para trás; mantenha a pelve encaixada.'
    ],
    breathing: 'Inspire ao descer em direção ao colchonete; expire ao empurrar o chão para subir.',
    commonErrors: [
      'Deixar a coluna lombar afundar como uma rede por fraqueza no abdômen.',
      'Abrir os cotovelos em 90° forçando a articulação dos ombros.'
    ],
    errorCorrections: [
      'Contraia glúteos e abdômen mantendo o tronco rígido.',
      'Aponte os cotovelos diagonalmente para trás.'
    ],
    variations: ['Flexão Tradicional no Solo', 'Supino Reto com Halteres'],
    substitutions: ['chest_flexao_bracos', 'chest_supino_haltere', 'chest_supino_maquina'],
    safetyWarnings: [
      'Coloque uma almofada ou colchonete sob os joelhos para evitar atrito contra piso duro.',
      'Se os punhos doerem, use apoios de flexão ou punhos cerrados.'
    ],
    restrictions: [
      'Perfeito para iniciantes, idosos ou quem está retornando de lesão articular.',
      'Progressão natural em direção à flexão completa de braços.'
    ],
    substitutionsHint: 'Exercício acessível em qualquer lugar. Substitutos: Supino na Máquina com carga leve ou Supino com Halteres.',
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['triceps', 'shoulders', 'core'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['bodyweight', 'exercise_mat'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'kneeling',
    searchTerms: ['flexao com joelho', 'flexao joelho apoiado', 'flexao iniciante', 'push up knees'],
    images: []
  },
  {
    id: 'chest_supino_smith_inclinado',
    name: 'Supino Inclinado no Smith',
    thumbnail: '🏋️ Inclinado no Smith',
    muscleGroup: 'chest',
    secondaryMuscles: ['shoulders', 'triceps'],
    equipment: 'Máquina Smith e Banco Inclinado',
    level: 'intermediate',
    executionSteps: [
      'Posicione um banco inclinado (30° a 45°) centralizado sob a barra da máquina Smith.',
      'Deite-se no banco com a barra alinhada à parte superior do peito/clavícula.',
      'Destrave a barra com os punhos retos e desça controladamente até quase tocar o peito superior.',
      'Empurre a barra estendendo os braços com força pela contração do peitoral superior.'
    ],
    postureTips: [
      'A barra guiada do Smith permite focar na intensidade e sobrecarga sem se preocupar em equilibrar a barra livre.',
      'Mantenha as escápulas aduzidas contra o encosto do banco.'
    ],
    breathing: 'Inspire na descida lenta; expire ao empurrar a barra para cima.',
    commonErrors: [
      'Posicionar o banco muito à frente ou muito atrás fazendo a barra descer na garganta ou no queixo.',
      'Descolar os glúteos do banco para aumentar o impulso.'
    ],
    errorCorrections: [
      'Alinhe o banco para que a descida ocorra precisamente na linha da clavícula.',
      'Mantenha os pés cravados no chão e glúteos apoiados.'
    ],
    variations: ['Supino Inclinado com Halteres', 'Supino Inclinado com Barra Livre'],
    substitutions: ['chest_supino_inclinado_haltere', 'chest_supino_inclinado_barra', 'chest_peck_deck'],
    safetyWarnings: [
      'Regule os pinos limitadores de segurança mecânica logo abaixo do nível do peito.',
      'Mantenha pegada com o polegar envolvendo a barra (nunca pegada falsa).'
    ],
    restrictions: [
      'Muito seguro para treinos pesados sem necessidade de parceiro de treino (spotter).',
      'Pessoas com tendinite bicipital devem limitar a descida a 90° de cotovelo.'
    ],
    substitutionsHint: 'Excelente para peitoral superior guiado. Substitutos: Supino Inclinado com Halteres ou com Barra Livre.',
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['shoulders', 'triceps'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['smith_machine', 'incline_bench', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    searchTerms: ['supino inclinado smith', 'incline bench press smith', 'supino 45 no smith', 'supino inclinado barra guiada'],
    images: []
  },
  {
    id: 'chest_supino_smith_reto',
    name: 'Supino Reto no Smith',
    thumbnail: '⚡ Supino Reto no Smith',
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'Máquina Smith e Banco Reto',
    level: 'intermediate',
    executionSteps: [
      'Coloque o banco reto centralizado abaixo da barra da máquina Smith.',
      'Deite-se no banco de modo que a barra fique alinhada com a linha dos mamilos/esterno médio.',
      'Segure com pegada ligeiramente mais larga que os ombros e destrave a barra.',
      'Desça a barra controlando o peso até quase tocar o peito e empurre estendendo os braços.'
    ],
    postureTips: [
      'Excelente para atingir a falha muscular com segurança graças às travas de retenção giratórias.',
      'Mantenha arco natural na lombar sem descolar as nádegas do banco.'
    ],
    breathing: 'Puxe o ar na descida da barra; solte o ar no empurrão concêntrico.',
    commonErrors: [
      'Bater a barra nas travas de segurança a cada repetição quebrando a tensão muscular.',
      'Girar os punhos antes do ponto de apoio seguro.'
    ],
    errorCorrections: [
      'Regule as travas de segurança a 3 cm do peito para não interromper a repetição livre.',
      'Mantenha os punhos firmes e travados.'
    ],
    variations: ['Supino Reto com Barra Livre', 'Supino Reto com Halteres'],
    substitutions: ['chest_supino_reto', 'chest_supino_haltere', 'chest_supino_maquina'],
    safetyWarnings: [
      'Trave bem os ganchos do Smith ao finalizar a série antes de soltar as mãos.',
      'Use anilhas bem presas.'
    ],
    restrictions: [
      'Ótima alternativa para treinar força quando a gaiola de supino livre estiver ocupada.',
      'Em caso de dor no ombro, reduza a amplitude de descida.'
    ],
    substitutionsHint: 'Substituto direto do supino com barra para dias com academia cheia. Substitutos: Supino Reto com Halteres ou Supino na Máquina.',
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['triceps', 'shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['smith_machine', 'flat_bench', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    searchTerms: ['supino reto smith', 'supino no smith', 'bench press smith', 'supino barra guiada'],
    images: []
  },
  {
    id: 'legs_agachamento_sumo_smith',
    name: 'Agachamento Sumô no Smith',
    thumbnail: '🔥 Sumô no Smith',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'adductors', 'quadriceps'],
    equipment: 'Máquina Smith',
    level: 'intermediate',
    executionSteps: [
      'Posicione a barra do Smith nos trapézios com pegada firme.',
      'Adote base bem ampla com os pés afastados e pontas apontadas para fora a 45°.',
      'Destrave a barra e desça flexionando joelhos e quadris mantendo os joelhos alinhados aos pés.',
      'Empurre o chão com os calcanhares e estenda as pernas contraindo glúteos e adutores no topo.'
    ],
    postureTips: [
      'A barra guiada vertical permite manter o tronco bem ereto potencializando a ativação dos adutores e glúteos.',
      'Não permita que os joelhos entrem em valgo dinâmico.'
    ],
    breathing: 'Inspire profundamente descendo; expire subindo com contração glútea.',
    commonErrors: [
      'Deixar os joelhos fecharem para dentro ao iniciar a subida.',
      'Inclinar o tronco excessivamente para frente.'
    ],
    errorCorrections: [
      'Empurre os joelhos para fora ativamente durante toda a série.',
      'Mantenha o peito alto olhando para a frente.'
    ],
    variations: ['Agachamento Sumô com Halteres', 'Cadeira Adutora'],
    substitutions: ['legs_agachamento_sumo_halter', 'legs_cadeira_adutora', 'glutes_elevacao_pelvica'],
    safetyWarnings: [
      'Ajuste os limitadores de segurança do Smith para a altura máxima de profundidade desejada.',
      'Use calçado com solado firme e estável.'
    ],
    restrictions: [
      'Excelente para pessoas com restrição lombar que não toleram o agachamento livre convencional.',
      'Cuidado com amplitude excessiva se houver desconforto na virilha ou púbis.'
    ],
    substitutionsHint: 'Ótima variação para parte interna da coxa e glúteos. Substitutos: Agachamento Sumô com Haltere ou Cadeira Adutora.',
    primaryMuscleGroupId: 'glutes',
    secondaryMuscleGroupIds: ['adductors', 'quadriceps'],
    movementPatternIds: ['squat'],
    equipmentIds: ['smith_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    searchTerms: ['agachamento sumo smith', 'sumo no smith', 'sumo squat smith', 'agachamento adutores smith'],
    images: []
  },
  {
    id: 'glutes_ponte_elevada_banco',
    name: 'Ponte de Glúteos com Pés Elevados no Banco',
    thumbnail: '🍑 Ponte Pés no Banco',
    muscleGroup: 'glutes',
    secondaryMuscles: ['hamstrings', 'core'],
    equipment: 'Banco Reto e Colchonete',
    level: 'intermediate',
    executionSteps: [
      'Deite-se no colchonete com as costas no solo e apoie os calcanhares na borda do banco.',
      'Mantenha os joelhos flexionados a cerca de 90° e braços estendidos ao lado do corpo.',
      'Empurre os calcanhares contra o banco elevando o quadril até formar uma linha reta da coxa ao tronco.',
      'Aperte os glúteos com força no topo e desça controladamente até quase tocar o solo.'
    ],
    postureTips: [
      'A elevação dos pés aumenta significativamente a amplitude de movimento e o braço de alavanca para os glúteos e posteriores.',
      'Faça retroversão da pelve no ápice sem hiperestender a coluna lombar.'
    ],
    breathing: 'Expire ao empurrar o quadril para cima; inspire ao retornar ao colchonete.',
    commonErrors: [
      'Fazer o movimento rápido sem pausar no ponto mais alto.',
      'Sentir dor na lombar por empurrar o umbigo para cima em vez da pelve.'
    ],
    errorCorrections: [
      'Segure 1 a 2 segundos no ponto mais alto em contração isométrica do glúteo.',
      'Mantenha as costelas abaixadas e abdômen rígido.'
    ],
    variations: ['Ponte de Glúteos Tradicional', 'Elevação Pélvica com Barra'],
    substitutions: ['glutes_ponte_solo', 'glutes_elevacao_pelvica', 'glutes_gluteo_cabo'],
    safetyWarnings: [
      'Certifique-se de que o banco está estável e apoiado contra uma parede para não deslizar.',
      'Evite se houver câimbra frequente nos isquiotibiais.'
    ],
    restrictions: [
      'Excelente exercício para quem quer estímulo intenso nos glúteos sem colocar peso sobre as vértebras.',
      'Sem contraindicações graves para a coluna lombar.'
    ],
    substitutionsHint: 'Alternativa excelente e intensa à elevação pélvica de barra. Substitutos: Ponte no Solo com Anilha ou Elevação Pélvica na Máquina.',
    primaryMuscleGroupId: 'glutes',
    secondaryMuscleGroupIds: ['hamstrings', 'core'],
    movementPatternIds: ['hip_extension'],
    equipmentIds: ['flat_bench', 'exercise_mat', 'bodyweight'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    searchTerms: ['ponte pes no banco', 'ponte elevada', 'elevated glute bridge', 'ponte de gluteos banco'],
    images: []
  }
];
