import { Exercise } from '../../../src/types';

export const LOTE_4_CURATION: Record<string, Partial<Exercise>> = {
  triceps_polia_v: {
    primaryMuscleGroupId: 'triceps',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['elbow_extension'],
    equipmentIds: ['high_cable_station', 'v_bar_attachment'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'O pegador em V diminui a pronação dos punhos; mantenha os punhos alinhados com o antebraço.',
      'Controle a subida sem deixar os ombros se moverem para frente.'
    ],
    substitutionsHint: 'Excelente pegada anatômica intermediária entre barra reta e corda. Substitutos: Tríceps Polia com Barra ou Tríceps com Corda.',
    searchTerms: ['triceps v', 'triceps barra v', 'triceps pushdown v bar', 'triceps polia v', 'pulley barra v']
  },
  triceps_frances_corda_polia: {
    primaryMuscleGroupId: 'triceps',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['elbow_extension'],
    equipmentIds: ['low_cable_station', 'rope_attachment'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Incline o tronco levemente à frente com base dividida para neutralizar o puxão do cabo para trás.',
      'Evite abrir excessivamente os cotovelos para não perder o foco na cabeça longa do tríceps.'
    ],
    substitutionsHint: 'Tensão contínua sobre a cabeça longa em posição estirada. Substitutos: Tríceps Francês com Haltere ou Tríceps Testa na Polia.',
    searchTerms: ['triceps frances corda', 'cable overhead triceps', 'frances no cabo', 'frances polia']
  },
  legs_agachamento_frontal: {
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes', 'core', 'calves'],
    movementPatternIds: ['squat'],
    equipmentIds: ['barbell', 'power_rack', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Apoie a barra sobre os deltoides anteriores (pegada olímpica ou braços cruzados); mantenha cotovelos altos.',
      'Exige grande mobilidade torácica; não permita que o peito colapse para frente sob risco de perder a barra.'
    ],
    substitutionsHint: 'Maior ênfase em quadríceps e menor compressão lombar em relação ao agachamento livre. Substitutos: Agachamento Goblet, Hack Squat ou Front Squat na máquina.',
    searchTerms: ['front squat', 'agachamento frontal', 'agachamento frente', 'front barbell squat']
  },
  legs_agachamento_goblet: {
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes', 'core'],
    movementPatternIds: ['squat'],
    equipmentIds: ['dumbbells'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Segure o haltere colado ao peito; não deixe o peso afastar do corpo para não sobrecarregar a coluna lombar.',
      'Mantenha os joelhos alinhados com a ponta dos pés durante a descida.'
    ],
    substitutionsHint: 'Melhor exercício introdutório ao agachamento com profundidade limpa. Substitutos: Agachamento com Barra, Leg Press 45° ou Agachamento no Smith.',
    searchTerms: ['goblet squat', 'agachamento goblet', 'agachamento com halter no peito', 'goblet']
  },
  legs_agachamento_corporal: {
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes', 'calves'],
    movementPatternIds: ['squat'],
    equipmentIds: ['bodyweight', 'exercise_mat'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Mantenha os calcanhares no solo durante toda a amplitude; calcanhares subindo indicam rigidez no tornozelo.',
      'Não curve a coluna torácica na tentativa de alcançar maior profundidade.'
    ],
    substitutionsHint: 'Excelente para aquecimento, iniciantes ou treinos rápidos em qualquer lugar. Para aumentar a intensidade, evolua para Goblet Squat ou Agachamento com Barra.',
    searchTerms: ['agachamento corporal', 'air squat', 'agachamento livre peso corporal', 'bodyweight squat']
  },
  legs_agachamento_hack: {
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes'],
    movementPatternIds: ['squat'],
    equipmentIds: ['hack_squat_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Mantenha as costas e a pelve firmemente apoiadas contra o encosto durante todo o curso.',
      'Pessoas com sensibilidade patelar devem posicionar os pés ligeiramente mais à frente na plataforma.'
    ],
    substitutionsHint: 'Aparelho icônico em academias BR para isolar quadríceps com suporte dorsal total. Substitutos: Leg Press 45°, Agachamento Pêndulo ou Agachamento no Smith.',
    searchTerms: ['hack', 'hack squat', 'agachamento hack', 'maquina hack', 'hack machine']
  },
  legs_agachamento_smith: {
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes', 'hamstrings'],
    movementPatternIds: ['squat'],
    equipmentIds: ['smith_machine', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Posicione os pés de modo que as tíbias fiquem verticais ou levemente inclinadas para trás na flexão, sem sobrecarregar a articulação do joelho.',
      'Destrave a barra com os punhos neutros e use as travas de segurança ajustadas.'
    ],
    substitutionsHint: 'Trajetória guiada que poupa a estabilização lateral. Substitutos: Agachamento Livre com Barra, Agachamento Hack ou Leg Press 45°.',
    searchTerms: ['agachamento smith', 'smith machine squat', 'agachamento barra guiada', 'smith squat']
  },
  legs_agachamento_sumo_halter: {
    primaryMuscleGroupId: 'glutes',
    secondaryMuscleGroupIds: ['adductors', 'quadriceps', 'hamstrings'],
    movementPatternIds: ['squat'],
    equipmentIds: ['dumbbells', 'step_platform'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Pés afastados em abdução (cerca de 30° a 45°); os joelhos DEVEM acompanhar a direção dos dedos dos pés.',
      'Se os joelhos colapsarem para dentro (valgo dinâmico), reduza a carga ou o afastamento dos pés.'
    ],
    substitutionsHint: 'Grande foco em glúteos e adutores da coxa. Pode ser feito com 2 steps para aumentar amplitude. Substitutos: Cadeira Adutora ou Levantamento Terra Sumô.',
    searchTerms: ['agachamento sumo', 'sumo squat', 'sumo com halter', 'agachamento adutores']
  },
  legs_afundo_halteres: {
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes', 'hamstrings', 'calves'],
    movementPatternIds: ['squat'],
    equipmentIds: ['dumbbells'],
    mechanics: 'compound',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Mantenha o joelho da perna dianteira estável sem oscilar lateralmente.',
      'O joelho de trás deve descer suavemente em direção ao solo sem colidir com força no piso.'
    ],
    substitutionsHint: 'Desenvolve estabilidade unilateral e corrige assimetrias de força entre as pernas. Substitutos: Passada com Barra, Agachamento Búlgaro ou Afundo no Smith.',
    searchTerms: ['afundo', 'afundo halteres', 'lunges', 'dumbbell lunge', 'afundo unilateral']
  },
  legs_passada_barra: {
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes', 'hamstrings', 'calves', 'core'],
    movementPatternIds: ['squat', 'locomotion'],
    equipmentIds: ['barbell', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'alternating',
    bodyPosition: 'dynamic',
    restrictions: [
      'Exige corredor livre e bom equilíbrio dinâmico; cuidado ao caminhar com a barra nas costas perto de outros alunos.',
      'Mantenha o tronco firme e olhar fixo no horizonte sem inclinar o pescoço para baixo.'
    ],
    substitutionsHint: 'Exercício de caminhada carregada com alto gasto energético. Substitutos: Afundo Estacionário com Halteres ou Agachamento Búlgaro.',
    searchTerms: ['passada', 'walking lunge', 'passada com barra', 'passada em movimento']
  },
  legs_agachamento_bulgaro: {
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes', 'hamstrings'],
    movementPatternIds: ['squat'],
    equipmentIds: ['dumbbells', 'flat_bench'],
    mechanics: 'compound',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Apoie o peito do pé de trás no banco; a perna de trás serve apenas para equilíbrio, todo o empurrão é da perna dianteira.',
      'Incline o tronco levemente à frente para maior ênfase em glúteo ou mantenha mais reto para foco em quadríceps.'
    ],
    substitutionsHint: 'Exercício padrão ouro de hipertrofia unilateral para pernas e glúteos. Substitutos: Afundo com Halteres, Agachamento Búlgaro no Smith ou Leg Press Unilateral.',
    searchTerms: ['agachamento bulgaro', 'bulgarian split squat', 'bulgaro', 'split squat', 'bulgaro halteres']
  },
  legs_terra_romeno: {
    primaryMuscleGroupId: 'hamstrings',
    secondaryMuscleGroupIds: ['glutes', 'lower_back', 'forearms'],
    movementPatternIds: ['hip_hinge'],
    equipmentIds: ['barbell', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'A barra deve descer raspando as coxas e canelas, com os joelhos mantendo flexão fixa de cerca de 15° a 20°.',
      'Não desça além do ponto em que a lombar consiga permanecer estritamente neutra.'
    ],
    substitutionsHint: 'Foco no estiramento excêntrico potente dos isquiotibiais e glúteos. Substitutos: Stiff com Halteres ou Mesa Flexora.',
    searchTerms: ['terra romeno', 'romanian deadlift', 'rdl', 'stiff romeno', 'rdl barra']
  },
  legs_terra_sumo: {
    primaryMuscleGroupId: 'glutes',
    secondaryMuscleGroupIds: ['adductors', 'quadriceps', 'hamstrings', 'lower_back'],
    movementPatternIds: ['hip_hinge', 'squat'],
    equipmentIds: ['barbell', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Base bem aberta com ponta dos pés apontada para fora; mantenha os joelhos empurrados para fora na linha dos pés.',
      'O tronco permanece mais vertical que no terra convencional, poupando a coluna lombar.'
    ],
    substitutionsHint: 'Excelente alternativa ao terra convencional para pessoas com tronco longo ou restrição lombar. Substitutos: Levantamento Terra Convencional ou Agachamento Sumô.',
    searchTerms: ['terra sumo', 'sumo deadlift', 'levantamento terra sumo', 'terra sumo barra']
  },
  legs_stiff_halteres: {
    primaryMuscleGroupId: 'hamstrings',
    secondaryMuscleGroupIds: ['glutes', 'lower_back'],
    movementPatternIds: ['hip_hinge'],
    equipmentIds: ['dumbbells'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Mantenha os halteres alinhados às pernas sem deixá-los oscilar para frente.',
      'O movimento é de empurrar o quadril para trás (como se quisesse tocar a parede com os glúteos).'
    ],
    substitutionsHint: 'Oferece pegada mais anatômica e livre que a barra reta. Substitutos: Stiff com Barra, Terra Romeno ou Cadeira Flexora.',
    searchTerms: ['stiff halteres', 'dumbbell stiff deadlift', 'stiff com halter', 'stiff haltere']
  },
  legs_cadeira_adutora: {
    primaryMuscleGroupId: 'adductors',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['hip_adduction'],
    equipmentIds: ['hip_adductor_machine'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Controle a abertura da máquina para não provocar estiramento violento nos músculos grácil e adutores.',
      'Mantenha as costas totalmente apoiadas no encosto durante a aproximação das coxas.'
    ],
    substitutionsHint: 'Fortalecimento específico da parte interna da coxa (adutores). Substitutos: Adução no Cabo com Tornozeleira ou Agachamento Sumô.',
    searchTerms: ['cadeira adutora', 'adutora', 'adutora maquina', 'maquina adutora', 'aparelho adutor']
  },
  legs_cadeira_abdutora: {
    primaryMuscleGroupId: 'abductors',
    secondaryMuscleGroupIds: ['glutes'],
    movementPatternIds: ['hip_abduction'],
    equipmentIds: ['hip_abductor_machine'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Mantenha os joelhos firmes contra os apoios laterais e evite girar as pontas dos pés para dentro.',
      'Para variar o recrutamento de glúteo médio e fibras superiores do glúteo máximo, pode-se inclinar o tronco ligeiramente à frente.'
    ],
    substitutionsHint: 'Isolamento de glúteo médio e mínimo para estabilização pélvica. Substitutos: Abdução no Cabo com Tornozeleira ou Elevação Lateral de Perna no solo.',
    searchTerms: ['cadeira abdutora', 'abdutora', 'abdutora maquina', 'maquina abdutora', 'gluteo medio maquina']
  },
  legs_flexora_sentado: {
    primaryMuscleGroupId: 'hamstrings',
    secondaryMuscleGroupIds: ['calves'],
    movementPatternIds: ['knee_flexion'],
    equipmentIds: ['seated_leg_curl_machine'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Trave a almofada superior firmemente sobre as coxas para impedir que as pernas subam durante a flexão.',
      'Mantenha os pés em posição neutra ou dorsiflexão sem rodá-los exageradamente para fora.'
    ],
    substitutionsHint: 'Excelente por colocar os isquiotibiais em estiramento prévio no quadril fletido a 90°. Substitutos: Mesa Flexora Deitada ou Stiff com Barra.',
    searchTerms: ['flexora sentado', 'cadeira flexora', 'seated leg curl', 'flexora sentada', 'flexora maquina']
  },
  legs_subida_banco: {
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes', 'calves'],
    movementPatternIds: ['squat'],
    equipmentIds: ['dumbbells', 'flat_bench', 'step_platform'],
    mechanics: 'compound',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Não tome impulso com o pé de baixo; a força para erguer o corpo deve provir exclusivamente da perna de cima apoiada no banco.',
      'Verifique se o banco ou caixa está estável e antiderrapante antes de carregar peso.'
    ],
    substitutionsHint: 'Exercício funcional unilateral com foco em quadríceps e glúteos. Substitutos: Afundo com Halteres ou Agachamento Búlgaro.',
    searchTerms: ['subida no banco', 'step up', 'step com halteres', 'subida banco haltere']
  },
  glutes_coice_quatro_apoios: {
    primaryMuscleGroupId: 'glutes',
    secondaryMuscleGroupIds: ['hamstrings'],
    movementPatternIds: ['hip_extension'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'kneeling',
    restrictions: [
      'Mantenha a coluna lombar alinhada e estática; evite arquear as costas quando o calcanhar subir.',
      'Distribua o peso igualmente entre os apoios dos braços no colchonete.'
    ],
    substitutionsHint: 'Ótima opção com peso corporal ou caneleira para isolamento de glúteos. Substitutos: Glúteo no Cabo ou Elevação Pélvica.',
    searchTerms: ['coice 4 apoios', 'gluteo 4 apoios', 'glute kickback solo', 'quatro apoios gluteo']
  },
  glutes_ponte_solo: {
    primaryMuscleGroupId: 'glutes',
    secondaryMuscleGroupIds: ['hamstrings', 'core'],
    movementPatternIds: ['hip_extension'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Empurre o solo com os calcanhares e eleve o quadril até formar uma linha reta entre joelhos, quadril e ombros.',
      'Não jogue o esforço para a lombar; contraia ativamente os glúteos no topo.'
    ],
    substitutionsHint: 'Versão de solo acessível da elevação pélvica. Para aumentar intensidade, adicione anilha sobre a pelve ou evolua para Elevação Pélvica com Barra.',
    searchTerms: ['ponte solo', 'glute bridge', 'ponte de gluteos', 'elevacao pelvica solo']
  },
  glutes_ponte_unilateral: {
    primaryMuscleGroupId: 'glutes',
    secondaryMuscleGroupIds: ['hamstrings', 'core'],
    movementPatternIds: ['hip_extension'],
    equipmentIds: ['exercise_mat', 'bodyweight'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Mantenha os dois lados da pelve nivelados horizontalmente durante a subida (sem deixar o lado sem apoio cair).',
      'Pessoas com câimbras frequentes em posteriores devem puxar os calcanhares um pouco mais perto dos glúteos.'
    ],
    substitutionsHint: 'Excelente para corrigir assimetrias de força e ativar glúteo médio/máximo sem sobrecarga na coluna. Substitutos: Glúteo no Cabo ou Ponte com Barra.',
    searchTerms: ['ponte unilateral', 'single leg glute bridge', 'ponte de gluteo unilateral', 'elevacao pelvica unilateral']
  },
  glutes_bom_dia_barra: {
    primaryMuscleGroupId: 'hamstrings',
    secondaryMuscleGroupIds: ['glutes', 'lower_back'],
    movementPatternIds: ['hip_hinge'],
    equipmentIds: ['barbell', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Exige técnica avançada de dobradiça de quadril; contraindicado para pessoas com instabilidade lombar ou hérnia discal.',
      'Mantenha a barra travada no trapézio médio (posição de agachamento low bar) e joelhos semiflexionados.'
    ],
    substitutionsHint: 'Fortalece toda a cadeia posterior (isquiotibiais, glúteos e eretores da espinha). Substitutos: Stiff com Barra ou Hiperextensão Lombar no Banco Romano.',
    searchTerms: ['bom dia', 'good morning', 'good morning barra', 'bom dia costas']
  },
  calves_panturrilha_em_pe: {
    primaryMuscleGroupId: 'calves',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['calf_raise'],
    equipmentIds: ['standing_calf_raise_machine'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Mantenha os joelhos quase estendidos (com mínima semiflexão de 5°) para focar no gastrocnêmio.',
      'Apoie as almofadas sobre os ombros mantendo a coluna ereta sem flexionar o pescoço para a frente.'
    ],
    substitutionsHint: 'Principal construtor de gastrocnêmio em academias. Substitutos: Panturrilha no Leg Press ou Panturrilha no Step com Haltere.',
    searchTerms: ['panturrilha em pe', 'standing calf raise', 'panturrilha maquina em pe', 'gemeos em pe']
  },
  calves_panturrilha_sentado: {
    primaryMuscleGroupId: 'calves',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['calf_raise'],
    equipmentIds: ['seated_calf_raise_machine', 'weight_plates'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Com os joelhos flexionados a 90°, o músculo sóleo assume quase a totalidade da carga; desça até o alongamento máximo do tendão calcâneo com calma.',
      'Não faça repetições curtas e quicadas no fundo da amplitude.'
    ],
    substitutionsHint: 'Isola o músculo sóleo dando largura e espessura lateral à panturrilha. Se a máquina estiver ocupada, faça Panturrilha Sentado com Halteres nos Joelhos.',
    searchTerms: ['panturrilha sentado', 'seated calf raise', 'gemeos sentado', 'soleo maquina']
  },
  calves_panturrilha_leg_press: {
    primaryMuscleGroupId: 'calves',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['calf_raise'],
    equipmentIds: ['leg_press_45', 'weight_plates'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Mantenha SEMPRE as travas de segurança do leg press engatadas para evitar que a plataforma despenque caso os pés escorreguem.',
      'Apoie a bola dos pés na borda inferior da plataforma sem tirar os metatarsos do apoio.'
    ],
    substitutionsHint: 'Permite sobrecarga pesada e amplitude livre sem compressão axial nos ombros. Substitutos: Panturrilha em Pé na Máquina ou no Step.',
    searchTerms: ['panturrilha no leg', 'calf press on leg press', 'panturrilha leg 45', 'gemeos no leg']
  }
};
