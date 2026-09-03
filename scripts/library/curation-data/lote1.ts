import { Exercise } from '../../../src/types';

export const LOTE_1_CURATION: Record<string, Partial<Exercise>> = {
  chest_supino_reto: {
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['triceps', 'shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['barbell', 'flat_bench'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Evite amplitude excessiva se houver histórico de luxação glenoumeral ou síndrome do impacto subacromial.',
      'Mantenha apoio lombar natural sem hiperlordose descontrolada para proteger a coluna.'
    ],
    substitutionsHint: 'Se o banco ou a barra estiverem ocupados, substitua por Supino Reto com Halteres ou Supino Reto Articulado mantendo a mesma trajetória.',
    searchTerms: ['supino reto', 'bench press', 'supino com barra', 'peito reto', 'peitoral com barra']
  },
  chest_supino_haltere: {
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['triceps', 'shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['dumbbells', 'flat_bench'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Cuidado ao posicionar e largar os halteres para evitar sobrecarga súbita nos tendões do manguito rotador.',
      'Evite descer além da linha confortável do tórax em caso de instabilidade anterior do ombro.'
    ],
    substitutionsHint: 'Excelente alternativa ao supino com barra para maior liberdade articular. Se não houver halteres livres, use a máquina articulada ou supino com barra.',
    searchTerms: ['supino halteres', 'dumbbell bench press', 'supino com halteres', 'peito haltere']
  },
  chest_supino_inclinado_haltere: {
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['shoulders', 'triceps'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['dumbbells', 'incline_bench'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Ajuste o banco em inclinação de 30° a 45°; ângulos superiores a 45° transferem excesso de carga para o deltoide anterior.',
      'Evite hiperextensão cervical ao empurrar as cargas.'
    ],
    substitutionsHint: 'Para enfatizar a porção clavicular do peitoral. Pode ser substituído por Supino Inclinado com Barra ou Supino Inclinado Articulado.',
    searchTerms: ['supino inclinado', 'supino inclinado halteres', 'incline dumbbell press', 'peito superior haltere']
  },
  chest_supino_inclinado_barra: {
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['shoulders', 'triceps'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['barbell', 'incline_bench'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Não toque a barra na garganta; a descida deve mirar a linha da clavícula/parte superior do esterno.',
      'Contraindicado em fase aguda de tendinite do bíceps braquial ou bursite subacromial.'
    ],
    substitutionsHint: 'Se o banco inclinado de barra estiver ocupado, faça Supino Inclinado com Halteres ou no Smith Machine com banco ajustável.',
    searchTerms: ['supino inclinado barra', 'incline barbell bench press', 'supino 45 barra', 'peito superior']
  },
  chest_crucifixo_polia: {
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['cable_crossover', 'flat_bench'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Mantenha ligeira flexão fixa dos cotovelos (15° a 20°) durante toda a amplitude para proteger a articulação do cotovelo.',
      'Não permita que a tensão do cabo tracione os ombros além da amplitude anatômica segura.'
    ],
    substitutionsHint: 'Mantém tensão constante durante todo o arco. Pode ser substituído pelo Crucifixo no Peck Deck ou Crossover na polia alta.',
    searchTerms: ['crucifixo cabo', 'crucifixo polia', 'flat bench cable fly', 'crucifixo no cabo banco reto']
  },
  chest_peck_deck: {
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['pec_deck_machine'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Ajuste o assento para que as manoplas fiquem na altura do peito médio; cotovelos muito altos sobrecarregam o manguito.',
      'Não projete a cabeça para a frente na contração de pico.'
    ],
    substitutionsHint: 'Excelente isolamento para quem precisa poupar tríceps. Substitutos diretos com kit livre: Crucifixo com Halteres no banco reto ou Crossover na polia.',
    searchTerms: ['peck deck', 'voador', 'maquina voador', 'voador peitoral', 'butterfly', 'crucifixo maquina']
  },
  chest_paralelas: {
    primaryMuscleGroupId: 'chest',
    secondaryMuscleGroupIds: ['triceps', 'shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['parallel_bars', 'bodyweight'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'hanging',
    restrictions: [
      'Contraindicado para praticantes com frouxidão ligamentar de ombro ou histórico de luxação acromioclavicular.',
      'Evite descer além de 90° de flexão dos cotovelos caso sinta desconforto no esterno.'
    ],
    substitutionsHint: 'Incline o tronco à frente para focar no peitoral inferior. Se não conseguir sustentar o peso corporal, use o Graviton ou Supino Declinado com barra.',
    searchTerms: ['paralelas', 'dips', 'mergulho nas paralelas', 'paralela peito', 'peito nas paralelas']
  },
  back_barra_fixa: {
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'forearms'],
    movementPatternIds: ['vertical_pull'],
    equipmentIds: ['pull_up_bar', 'bodyweight'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'hanging',
    restrictions: [
      'Evite balanços bruscos (kipping) para não gerar estresse cisalhante nos labrum glenoidais.',
      'Pessoas com dor medial no cotovelo (epitrocleíte) devem preferir pegada neutra.'
    ],
    substitutionsHint: 'Exercício padrão ouro de puxada vertical. Se o praticante não tiver força suficiente, substitua por Puxada Alta no Pulley ou use elástico de assistência.',
    searchTerms: ['barra fixa', 'pull up', 'puxada na barra', 'barra fixa pronada', 'barra costas']
  },
  back_puxada_pulley: {
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'shoulders', 'forearms'],
    movementPatternIds: ['vertical_pull'],
    equipmentIds: ['high_cable_station', 'straight_bar_attachment'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Puxe a barra sempre na frente do peito (nunca atrás da nuca, evitando sobrecarga na coluna cervical e manguito).',
      'Evite inclinar o tronco excessivamente para trás transformando o movimento em remada.'
    ],
    substitutionsHint: 'Exercício fundamental de dorsais. Se a polia estiver lotada, substitua por Barra Fixa na máquina graviton ou Puxada com pegada neutra articulada.',
    searchTerms: ['puxada pulley', 'puxada alta', 'pulldown', 'lat pulldown', 'puxador costas', 'puxada frente']
  },
  back_remada_curvada: {
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'lower_back', 'forearms'],
    movementPatternIds: ['horizontal_pull'],
    equipmentIds: ['barbell', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Exige estabilidade da cadeia posterior; contraindicado em crise aguda de hérnia discal lombar.',
      'Mantenha a curvatura lombar neutra e joelhos semiflexionados durante todo o exercício.'
    ],
    substitutionsHint: 'Se sentir fadiga excessiva na lombar, substitua pela Remada no Banco Inclinado com Apoio no Peito ou Remada Baixa na Polia.',
    searchTerms: ['remada curvada', 'bent over row', 'remada com barra', 'remada pronada barra']
  },
  back_remada_baixa: {
    primaryMuscleGroupId: 'back',
    secondaryMuscleGroupIds: ['biceps', 'forearms'],
    movementPatternIds: ['horizontal_pull'],
    equipmentIds: ['low_cable_station', 'triangle_handle'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Não hiperestenda a coluna lombar na fase final do movimento.',
      'Evite projetar os ombros para a frente na fase excêntrica com relaxamento total das escápulas.'
    ],
    substitutionsHint: 'Excelente para espessura de dorsais com pouca exigência estabilizadora da lombar. Substitua por Remada no Serrote com Haltere ou Remada Máquina Sentada.',
    searchTerms: ['remada baixa', 'seated cable row', 'remada sentada cabo', 'remada triangulo', 'low row']
  },
  shoulder_desenvolvimento_haltere: {
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['triceps', 'traps'],
    movementPatternIds: ['vertical_push'],
    equipmentIds: ['dumbbells', 'upright_bench'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Trabalhe no plano escapular (cotovelos ligeiramente à frente do tronco, cerca de 30°) para prevenir impacto subacromial.',
      'Não arqueie a lombar descolando as costas do encosto do banco.'
    ],
    substitutionsHint: 'Se faltarem halteres na carga alvo, substitua por Desenvolvimento na Máquina ou Desenvolvimento Militar com Barra.',
    searchTerms: ['desenvolvimento halteres', 'dumbbell shoulder press', 'desenvolvimento ombro', 'press haltere']
  },
  shoulder_elevecao_lateral: {
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['traps'],
    movementPatternIds: ['shoulder_abduction'],
    equipmentIds: ['dumbbells'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Não eleve os braços acima da linha dos ombros (90°) se houver dor ou pinçamento no manguito rotador.',
      'Evite rotação interna forçada (posição de despejar jarra), mantendo o polegar ligeiramente acima do mindinho.'
    ],
    substitutionsHint: 'Exercício rei para largura dos deltoides laterais. Pode ser substituído por Elevação Lateral na Polia Baixa ou Elevação Lateral na Máquina.',
    searchTerms: ['elevacao lateral', 'lateral raise', 'abducao de ombro', 'ombro lateral haltere']
  },
  shoulder_elevecao_posterior: {
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['back', 'traps'],
    movementPatternIds: ['horizontal_pull'],
    equipmentIds: ['dumbbells', 'flat_bench'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Mantenha o pescoço alinhado com a coluna dorsal sem forçar a cervical para cima.',
      'Evite utilizar impulso do tronco (gangorra) para levantar as cargas.'
    ],
    substitutionsHint: 'Foco no deltoide posterior. Pode ser substituído pelo Crucifixo Invertido no Peck Deck ou Face Pull na Polia Alta.',
    searchTerms: ['elevacao posterior', 'crucifixo invertido haltere', 'rear delt raise', 'deltoide posterior']
  },
  biceps_rosca_direta: {
    primaryMuscleGroupId: 'biceps',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['barbell', 'weight_plates'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Se sentir dor no punho com a barra reta, mude imediatamente para a Barra W (EZ) para respeitar o ângulo de carregar.',
      'Não balance o tronco para iniciar o movimento (roubo excessivo sobrecarrega a lombar).'
    ],
    substitutionsHint: 'Exercício básico de hipertrofia de bíceps. Se os punhos reclamarem, faça Rosca Direta com Barra W ou Rosca Alternada com Halteres.',
    searchTerms: ['rosca direta', 'barbell curl', 'biceps barra', 'rosca com barra reta']
  },
  biceps_rosca_martelo: {
    primaryMuscleGroupId: 'biceps',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['dumbbells'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Mantenha os punhos neutros e firmes, evitando flexão ou extensão excessiva sob carga.',
      'Não projete os cotovelos para a frente no topo do movimento.'
    ],
    substitutionsHint: 'Excelente para braquial e braquiorradial com grande conforto articular de punho. Pode ser substituído por Rosca Martelo na Polia com Corda.',
    searchTerms: ['rosca martelo', 'hammer curl', 'martelo halteres', 'biceps braquial']
  },
  triceps_polia_corda: {
    primaryMuscleGroupId: 'triceps',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['elbow_extension'],
    equipmentIds: ['high_cable_station', 'rope_attachment'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Fixe os cotovelos nas laterais das costelas sem deixá-los oscilar para frente e para trás.',
      'Pessoas com tendinopatia do tríceps distal devem controlar rigorosamente a fase excêntrica.'
    ],
    substitutionsHint: 'Permite rotação externa e maior contração lateral do tríceps. Se a corda estiver ocupada, use barra reta ou barra V na mesma polia.',
    searchTerms: ['triceps corda', 'triceps pulley', 'triceps polia corda', 'triceps na polia', 'pulley corda']
  },
  triceps_testa: {
    primaryMuscleGroupId: 'triceps',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['elbow_extension'],
    equipmentIds: ['ez_bar', 'flat_bench'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Contraindicado em crise de dor no tendão do tríceps ou epicondilite.',
      'Recomenda-se direcionar a barra ligeiramente atrás da cabeça (e não exatamente na testa) para reduzir a pressão articular no cotovelo.'
    ],
    substitutionsHint: 'Grande ênfase na cabeça longa do tríceps. Se os cotovelos incomodarem, substitua por Tríceps Testa no Cabo com Corda ou Tríceps Francês.',
    searchTerms: ['triceps testa', 'skull crusher', 'testa barra w', 'triceps com barra ez']
  },
  legs_agachamento_barra: {
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes', 'hamstrings', 'calves', 'core'],
    movementPatternIds: ['squat'],
    equipmentIds: ['barbell', 'power_rack', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Exige boa mobilidade de tornozelo e quadril; reduza a profundidade caso ocorra retroversão pélvica acentuada (butt wink).',
      'Pessoas com osteoartrite patelofemoral avançada devem monitorar o grau de flexão dos joelhos.'
    ],
    substitutionsHint: 'Exercício rei para membros inferiores. Se a gaiola estiver ocupada ou houver desconforto lombar, substitua por Leg Press 45° ou Agachamento Hack.',
    searchTerms: ['agachamento livre', 'back squat', 'agachamento com barra', 'agachamento costas']
  },
  legs_leg_press: {
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: ['glutes', 'hamstrings'],
    movementPatternIds: ['squat'],
    equipmentIds: ['leg_press_machine'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Não descole a lombar/glúteos do encosto na fase de descida máxima para não sobrecarregar as vértebras lombares.',
      'Nunca trave os joelhos em hiperextensão completa ao empurrar a plataforma.'
    ],
    substitutionsHint: 'Permite sobrecarga de quadríceps com segurança e sem peso sobre a coluna. Substitutos: Leg Press 45°, Agachamento Hack ou Agachamento Goblet.',
    searchTerms: ['leg press', 'leg press maquina', 'aparelho leg press', 'leg press horizontal']
  },
  legs_cadeira_extensora: {
    primaryMuscleGroupId: 'quadriceps',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['knee_extension'],
    equipmentIds: ['leg_extension_machine'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Em portadores de condromalácia patelar grave, restrinja a amplitude entre 90° e 45° de flexão para diminuir a pressão retropatelar.',
      'Ajuste o apoio da canela logo acima dos maléolos do tornozelo, alinhando o eixo da máquina com o côndilo do joelho.'
    ],
    substitutionsHint: 'Isolamento puro de quadríceps. Se a máquina estiver ocupada, use Sissy Squat com apoio corporal ou Agachamento Búlgaro com halteres.',
    searchTerms: ['cadeira extensora', 'extensora', 'leg extension', 'extensora de pernas']
  },
  legs_mesa_flexora: {
    primaryMuscleGroupId: 'hamstrings',
    secondaryMuscleGroupIds: ['calves'],
    movementPatternIds: ['knee_flexion'],
    equipmentIds: ['lying_leg_curl_machine'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'prone',
    restrictions: [
      'Mantenha o quadril pressionado contra o banco para não compensar o movimento com a musculatura lombar.',
      'Cuidado com estiramento agudo de isquiotibiais ao retornar a carga.'
    ],
    substitutionsHint: 'Isolamento dos isquiotibiais em posição deitada. Se a mesa estiver ocupada, substitua por Cadeira Flexora Sentada ou Stiff com Halteres.',
    searchTerms: ['mesa flexora', 'flexora deitada', 'lying leg curl', 'flexora mesa']
  },
  legs_stiff: {
    primaryMuscleGroupId: 'hamstrings',
    secondaryMuscleGroupIds: ['glutes', 'lower_back'],
    movementPatternIds: ['hip_hinge'],
    equipmentIds: ['barbell', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Contraindicado arquear a coluna torácica e lombar; a flexão ocorre estritamente no quadril (padrão hinge).',
      'Pessoas com encurtamento severo de posteriores devem limitar a descida até a linha dos joelhos.'
    ],
    substitutionsHint: 'Padrão hinge de excelência para posteriores e glúteos em alongamento. Pode ser substituído por Stiff com Halteres ou Levantamento Terra Romeno.',
    searchTerms: ['stiff', 'stiff com barra', 'stiff deadlift', 'posterior stiff']
  },
  glutes_elevacao_pelvica: {
    primaryMuscleGroupId: 'glutes',
    secondaryMuscleGroupIds: ['hamstrings', 'core'],
    movementPatternIds: ['hip_extension'],
    equipmentIds: ['barbell', 'flat_bench', 'hip_thrust_setup'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Use estofamento (pad/almofada) na barra para proteger as cristas ilíacas da pelve contra hematomas e dor por compressão.',
      'Na contração máxima no topo, faça retroversão pélvica e aperte os glúteos sem hiperestender a lombar.'
    ],
    substitutionsHint: 'Exercício com maior ativação de glúteo máximo. Se a barra for difícil de montar, use Elevação Pélvica na Máquina ou Ponte de Glúteos no solo com anilha.',
    searchTerms: ['elevacao pelvica', 'hip thrust', 'elevacao de quadril', 'gluteo barra banco']
  },
  glutes_gluteo_cabo: {
    primaryMuscleGroupId: 'glutes',
    secondaryMuscleGroupIds: ['hamstrings'],
    movementPatternIds: ['hip_extension'],
    equipmentIds: ['low_cable_station', 'ankle_weights'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Incline o tronco levemente à frente e mantenha o abdômen contraído para evitar compensar a extensão do quadril com a lombar.',
      'Não gire a pelve lateralmente durante o chute para manter o foco no glúteo da perna ativa.'
    ],
    substitutionsHint: 'Trabalho unilateral de glúteo máximo com tensão contínua. Pode ser substituído por Glúteo 4 Apoios no solo ou Glúteo na Máquina de Coice.',
    searchTerms: ['gluteo cabo', 'coice no cabo', 'cable glute kickback', 'gluteo na polia']
  }
};
