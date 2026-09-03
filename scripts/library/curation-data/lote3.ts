import { Exercise } from '../../../src/types';

export const LOTE_3_CURATION: Record<string, Partial<Exercise>> = {
  shoulder_desenvolvimento_militar_barra: {
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['triceps', 'traps', 'core'],
    movementPatternIds: ['vertical_push'],
    equipmentIds: ['barbell', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Exige estabilização ativa de tronco e glúteos; não hiperestenda a coluna lombar ao empurrar a carga para cima.',
      'Contraindicado em pessoas com síndrome do impacto grave ou compressão cervical sintomática.'
    ],
    substitutionsHint: 'Padrão ouro de força vertical. Se a estabilidade em pé for limitante, faça Desenvolvimento com Barra Sentado ou com Halteres.',
    searchTerms: ['desenvolvimento militar', 'overhead press', 'militar em pe', 'ohp', 'desenvolvimento barra']
  },
  shoulder_desenvolvimento_barra_sentado: {
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['triceps', 'traps'],
    movementPatternIds: ['vertical_push'],
    equipmentIds: ['barbell', 'upright_bench', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Apoie as costas no encosto firme para isolar os deltoides sem oscilações lombares.',
      'Desça a barra até a linha do queixo ou fúrcula esternal de acordo com a flexibilidade individual do ombro.'
    ],
    substitutionsHint: 'Permite maior carga sobre os deltoides sem demandar equilíbrio do corpo todo. Substitutos: Desenvolvimento com Halteres ou na Máquina.',
    searchTerms: ['desenvolvimento sentado barra', 'seated barbell military press', 'militar sentado', 'desenvolvimento barra banco']
  },
  shoulder_desenvolvimento_arnold: {
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['triceps'],
    movementPatternIds: ['vertical_push'],
    equipmentIds: ['dumbbells', 'upright_bench'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'A rotação de punho e úmero deve ser suave e fluida; pare se houver estalo doloroso ou fricção no tendão bicipital.',
      'Mantenha as escápulas estáveis e evite elevar excessivamente os ombros na largada.'
    ],
    substitutionsHint: 'A rotação trabalha as porções anterior e lateral do deltoide com grande amplitude. Substitutos: Desenvolvimento Convencional com Halteres ou na Máquina.',
    searchTerms: ['desenvolvimento arnold', 'arnold press', 'arnold ombro', 'desenvolvimento com rotacao']
  },
  shoulder_desenvolvimento_maquina: {
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['triceps'],
    movementPatternIds: ['vertical_push'],
    equipmentIds: ['shoulder_press_machine'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Ajuste o assento para que as pegadas comecem ligeiramente à frente e na altura dos ombros, nunca atrás da linha auricular.',
      'Não descole as costas do encosto durante a subida.'
    ],
    substitutionsHint: 'Ideal para treinar até a falha com total controle do vetor de movimento. Substitutos: Desenvolvimento Articulado com Anilhas ou com Halteres.',
    searchTerms: ['desenvolvimento maquina', 'machine shoulder press', 'aparelho de desenvolvimento', 'ombro maquina']
  },
  shoulder_elevacao_frontal_halteres: {
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['chest'],
    movementPatternIds: ['shoulder_flexion'],
    equipmentIds: ['dumbbells'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Não ultrapasse a linha dos olhos na elevação para não transferir a tensão excessivamente ao trapézio.',
      'Evite projetar o tronco para trás (jogar o corpo) na subida dos halteres.'
    ],
    substitutionsHint: 'Isola o deltoide anterior. Pode ser substituído por Elevação Frontal com Barra, com Anilha ou na Polia Baixa.',
    searchTerms: ['elevacao frontal', 'front dumbbell raise', 'frontal halteres', 'deltoide anterior haltere']
  },
  shoulder_elevacao_lateral_polia: {
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['traps'],
    movementPatternIds: ['shoulder_abduction'],
    equipmentIds: ['low_cable_station'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Passe o cabo por trás do corpo ou pela frente mantendo a polia na altura do joelho ou tornozelo.',
      'Controle a volta do peso sem deixar o braço bater no tronco.'
    ],
    substitutionsHint: 'Proporciona torque contínuo desde o início da abdução (onde o haltere não tem peso vertical). Substitutos: Elevação Lateral com Halteres ou na Máquina.',
    searchTerms: ['elevacao lateral polia', 'elevacao lateral cabo', 'cable lateral raise', 'lateral no cross']
  },
  shoulder_face_pull: {
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['back', 'traps'],
    movementPatternIds: ['horizontal_pull'],
    equipmentIds: ['high_cable_station', 'rope_attachment'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Puxe a corda na altura da testa ou nariz rodando os punhos externamente (polegares para trás).',
      'Não permita que a coluna lombar curve para trás em compensação à carga.'
    ],
    substitutionsHint: 'Excelente para deltoide posterior, manguito rotador e saúde postural do ombro. Substitutos: Crucifixo Invertido no Peck Deck ou com Halteres.',
    searchTerms: ['face pull', 'facepull', 'face pull polia', 'puxada na face', 'ombro posterior corda']
  },
  shoulder_crucifixo_inverso_maquina: {
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['back', 'traps'],
    movementPatternIds: ['horizontal_pull'],
    equipmentIds: ['reverse_pec_deck_machine'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Ajuste o assento para que os braços fiquem na linha horizontal dos ombros durante a abertura.',
      'Não encoste o peito no estofado com força exagerada nem jogue o pescoço para a frente.'
    ],
    substitutionsHint: 'Isolamento preciso e confortável para a porção posterior do ombro. Substitutos: Face Pull no Cabo ou Elevação Posterior com Halteres.',
    searchTerms: ['crucifixo inverso maquina', 'voador invertido', 'peck deck invertido', 'reverse fly machine']
  },
  shoulder_remada_alta_barra: {
    primaryMuscleGroupId: 'shoulders',
    secondaryMuscleGroupIds: ['traps', 'biceps', 'forearms'],
    movementPatternIds: ['vertical_pull'],
    equipmentIds: ['barbell', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Utilize uma pegada ligeiramente mais larga que os ombros e eleve até a linha do peito médio (nunca até o queixo, prevenindo impacto no manguito).',
      'Contraindicado em pessoas com diagnóstico de síndrome do impacto subacromial.'
    ],
    substitutionsHint: 'Trabalha deltoide lateral e trapézio. Se os ombros incomodarem, substitua por Elevação Lateral com Halteres ou Elevação Lateral na Polia.',
    searchTerms: ['remada alta', 'upright row', 'remada alta barra', 'remada alta pegada aberta']
  },
  biceps_rosca_alternada: {
    primaryMuscleGroupId: 'biceps',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['dumbbells'],
    mechanics: 'isolation',
    laterality: 'alternating',
    bodyPosition: 'standing',
    restrictions: [
      'Faça a supinação (giro da palma da mão para cima) de forma gradual na primeira metade do arco de movimento.',
      'Não projete o cotovelo para a frente para encurtar o caminho do peso.'
    ],
    substitutionsHint: 'Permite foco unilateral e supinação máxima para ativação do bíceps braquial. Substitutos: Rosca Direta com Barra ou Rosca no Banco Inclinado.',
    searchTerms: ['rosca alternada', 'dumbbell alternate bicep curl', 'rosca halteres', 'biceps alternado']
  },
  biceps_rosca_scott: {
    primaryMuscleGroupId: 'biceps',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['scott_bench', 'ez_bar', 'weight_plates'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Nunca hiperestenda os cotovelos de forma abrupta na parte inferior (risco de lesão ou ruptura do tendão bicipital sob carga pesada).',
      'Mantenha as axilas e a parte de trás do braço totalmente coladas no estofamento do banco Scott.'
    ],
    substitutionsHint: 'Foco extremo na porção distal e cabeça curta do bíceps sem roubo corporal. Substitutos: Rosca Scott na Máquina ou Rosca Aranha (Spider Curl).',
    searchTerms: ['rosca scott', 'preacher curl', 'banco scott', 'scott barra w', 'scott barra ez']
  },
  biceps_rosca_scott_maquina: {
    primaryMuscleGroupId: 'biceps',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['scott_curl_machine'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Alinhe o eixo de rotação da máquina exatamente com a linha articular do cotovelo.',
      'Ajuste o assento para que os ombros permaneçam relaxados e sem tensão no pescoço.'
    ],
    substitutionsHint: 'Tensão constante em todo o percurso sem risco de perder o ponto de equilíbrio. Substitutos: Rosca Scott com Barra W ou Rosca na Polia Baixa.',
    searchTerms: ['scott maquina', 'rosca scott maquina', 'machine preacher curl', 'maquina scott']
  },
  biceps_rosca_concentrada: {
    primaryMuscleGroupId: 'biceps',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['dumbbells', 'flat_bench'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Apoie o tríceps firmemente contra a face interna da coxa sem deslizar o braço durante a flexão.',
      'Mantenha o punho reto e evite dobrar a mão para cima no final da subida.'
    ],
    substitutionsHint: 'Exercício de pico de contração de bíceps celebrizado por Arnold. Substitutos: Rosca Scott Unilateral com Haltere ou Rosca na Polia Baixa.',
    searchTerms: ['rosca concentrada', 'concentration curl', 'concentrada haltere', 'biceps concentrado']
  },
  biceps_rosca_polia: {
    primaryMuscleGroupId: 'biceps',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['low_cable_station', 'straight_bar_attachment'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Não permita que a tração do cabo puxe o corpo para frente; mantenha postura ereta e pés firmes no chão.',
      'Controle rigorosamente a descida das placas sem deixá-las bater no descanso.'
    ],
    substitutionsHint: 'Mantém torque mecânico na parte alta da repetição onde os pesos livres perdem resistência. Substitutos: Rosca Direta com Barra ou Rosca com Halteres.',
    searchTerms: ['rosca polia', 'cable curl', 'rosca no cabo', 'biceps polia baixa', 'rosca cabo']
  },
  biceps_rosca_martelo_cabo: {
    primaryMuscleGroupId: 'biceps',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['low_cable_station', 'rope_attachment'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Mantenha pegada neutra segurando as extremidades da corda firmemente sem flexionar os punhos.',
      'Evite projetar os ombros para trás para puxar o peso.'
    ],
    substitutionsHint: 'Excelente para braquial anterior e braquiorradial com tensão permanente do cabo. Substitutos: Rosca Martelo com Halteres ou Rosca Inversa.',
    searchTerms: ['rosca martelo cabo', 'cable hammer curl', 'martelo polia', 'martelo corda']
  },
  biceps_rosca_inclinada: {
    primaryMuscleGroupId: 'biceps',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['dumbbells', 'incline_bench'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'Incline o banco em 45° a 60°; evite ângulos muito baixos se houver hiperextensão desconfortável no ombro anterior.',
      'Mantenha os cotovelos apontados para o chão atrás da linha do tronco durante a subida.'
    ],
    substitutionsHint: 'Coloca a cabeça longa do bíceps sob estiramento passivo vigoroso. Substitutos: Rosca Bayesian no Cabo ou Rosca Alternada em pé.',
    searchTerms: ['rosca inclinada', 'incline dumbbell curl', 'rosca banco 45', 'biceps banco inclinado']
  },
  biceps_rosca_w: {
    primaryMuscleGroupId: 'biceps',
    secondaryMuscleGroupIds: ['forearms'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['ez_bar', 'weight_plates'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Ideal para quem sente desconforto no túnel do carpo ou punho com a barra reta.',
      'Não dê impulsos com as pernas ou com a coluna para erguer a barra.'
    ],
    substitutionsHint: 'Formato semi-supinado alivia a pressão nos ossos do rádio e ulna. Substitutos: Rosca Direta Barra Reta ou Rosca com Halteres.',
    searchTerms: ['rosca w', 'ez bar curl', 'rosca barra ez', 'rosca direta barra w']
  },
  biceps_rosca_inversa: {
    primaryMuscleGroupId: 'forearms',
    secondaryMuscleGroupIds: ['biceps'],
    movementPatternIds: ['elbow_flexion'],
    equipmentIds: ['barbell', 'weight_plates'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Utilize cargas moderadas para não sobrecarregar os tendões extensores dos punhos.',
      'Mantenha os punhos alinhados com o antebraço sem deixá-los cair para baixo em flexão.'
    ],
    substitutionsHint: 'Desenvolvimento do braquiorradial e extensores do antebraço. Substitutos: Rosca Martelo com Halteres ou Rosca Inversa na Polia.',
    searchTerms: ['rosca inversa', 'reverse barbell curl', 'rosca pronada', 'antebraco barra']
  },
  triceps_supino_fechado: {
    primaryMuscleGroupId: 'triceps',
    secondaryMuscleGroupIds: ['chest', 'shoulders'],
    movementPatternIds: ['horizontal_push'],
    equipmentIds: ['barbell', 'flat_bench', 'weight_plates'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'lying',
    restrictions: [
      'A pegada deve ficar na largura dos ombros (cerca de 20–30 cm entre as mãos); pegadas muito fechadas comprimem os punhos.',
      'Mantenha os cotovelos próximos às costelas durante a descida.'
    ],
    substitutionsHint: 'Exercício composto de alta carga para tríceps. Substitutos: Mergulho nas Paralelas ou Tríceps JM Press.',
    searchTerms: ['supino fechado', 'close grip bench press', 'supino pegada fechada', 'triceps supino']
  },
  triceps_mergulho_banco: {
    primaryMuscleGroupId: 'triceps',
    secondaryMuscleGroupIds: ['shoulders', 'chest'],
    movementPatternIds: ['vertical_push'],
    equipmentIds: ['flat_bench', 'bodyweight'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'supported',
    restrictions: [
      'Mantenha as costas rente ao banco para não afastar o tronco e sobrecarregar a cápsula anterior do ombro.',
      'Contraindicado em pessoas com síndrome do impacto acromioclavicular.'
    ],
    substitutionsHint: 'Ótima opção de peso corporal acessível em qualquer lugar. Substitutos: Tríceps nas Paralelas ou Tríceps Polia com Barra.',
    searchTerms: ['mergulho no banco', 'bench dips', 'triceps banco', 'mergulho banco']
  },
  triceps_paralelas: {
    primaryMuscleGroupId: 'triceps',
    secondaryMuscleGroupIds: ['chest', 'shoulders'],
    movementPatternIds: ['vertical_push'],
    equipmentIds: ['parallel_bars', 'bodyweight'],
    mechanics: 'compound',
    laterality: 'bilateral',
    bodyPosition: 'hanging',
    restrictions: [
      'Mantenha o tronco mais ereto e os cotovelos colados ao corpo para transferir a ênfase do peitoral para o tríceps.',
      'Evite descer além da amplitude de conforto articular do ombro (cerca de 90° de cotovelo).'
    ],
    substitutionsHint: 'Excelente composto de peso corporal para tríceps. Se não tiver força para subir, use o Graviton ou Supino Fechado com barra.',
    searchTerms: ['triceps paralelas', 'dips triceps', 'paralela triceps', 'mergulho paralelas triceps']
  },
  triceps_frances_haltere: {
    primaryMuscleGroupId: 'triceps',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['elbow_extension'],
    equipmentIds: ['dumbbells', 'upright_bench'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'seated',
    restrictions: [
      'Mantenha a coluna encostada e abdômen firme sem permitir que a lombar curve para frente sob a carga superior.',
      'Se houver dor na articulação acromioclavicular com os braços acima da cabeça, prefira movimentos na polia.'
    ],
    substitutionsHint: 'Alongamento máximo da cabeça longa do tríceps. Substitutos: Tríceps Francês na Polia com Corda ou Tríceps Testa.',
    searchTerms: ['triceps frances', 'french press', 'frances haltere', 'triceps sentado haltere', 'triceps overhead']
  },
  triceps_coice: {
    primaryMuscleGroupId: 'triceps',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['elbow_extension'],
    equipmentIds: ['dumbbells', 'flat_bench'],
    mechanics: 'isolation',
    laterality: 'unilateral',
    bodyPosition: 'supported',
    restrictions: [
      'Mantenha o braço paralelo ao solo e execute apenas o movimento do antebraço sem balançar o ombro.',
      'Não use cargas excessivas que impeçam a extensão completa do cotovelo no ponto alto.'
    ],
    substitutionsHint: 'Contração de pico com o ombro em extensão. Pode ser substituído pelo Tríceps Coice na Polia Baixa ou Tríceps Corda no Pulley.',
    searchTerms: ['coice triceps', 'kickback', 'triceps kickback', 'triceps coice haltere']
  },
  triceps_polia_barra: {
    primaryMuscleGroupId: 'triceps',
    secondaryMuscleGroupIds: [],
    movementPatternIds: ['elbow_extension'],
    equipmentIds: ['high_cable_station', 'straight_bar_attachment'],
    mechanics: 'isolation',
    laterality: 'bilateral',
    bodyPosition: 'standing',
    restrictions: [
      'Mantenha os cotovelos fixos ao lado das costelas sem deixá-los abrir para os lados na descida.',
      'Não incline o peso do corpo sobre a barra para empurrá-la com o peitoral.'
    ],
    substitutionsHint: 'Movimento básico e estável para empurrar cargas sólidas no tríceps. Substitutos: Tríceps Polia com Corda ou Tríceps Barra V.',
    searchTerms: ['triceps barra reta', 'triceps pulley barra', 'triceps pushdown', 'triceps na polia barra', 'pulley barra']
  }
};
