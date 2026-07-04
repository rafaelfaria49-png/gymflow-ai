import { Exercise } from '../types';

// GOAL-09: biblioteca real. BASE_EXERCISES = curadoria original preservada;
// EXPANSION_EXERCISES (fim do arquivo) = exercícios reais adicionados.
// Imagens locais em /assets/exercises/<id>/ (baixadas por scripts/import-exercises.mjs).
const BASE_EXERCISES: Exercise[] = [
  // PEITO (Chest)
  {
    id: 'chest_supino_reto',
    name: 'Supino Reto com Barra',
    thumbnail: '🏋️‍♂️ Supino Reto',
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'Barra e Banco',
    level: 'beginner',
    executionSteps: [
      'Deite-se no banco reto com os pés firmes no chão.',
      'Segure a barra com uma pegada ligeiramente mais larga que os ombros.',
      'Retire a barra do suporte e estenda os braços verticalmente.',
      'Desça a barra lentamente até tocar levemente a parte média do peito.',
      'Empurre a barra de volta para cima até os braços estarem esticados.'
    ],
    postureTips: [
      'Mantenha as escápulas retraídas (ombros para trás e para baixo).',
      'Não tire os glúteos do banco nem os pés do chão durante o movimento.',
      'Mantenha os cotovelos a aproximadamente 45-60 graus em relação ao corpo.'
    ],
    breathing: 'Inspire ao descer a barra, expire ao empurrar a barra.',
    commonErrors: [
      'Bater a barra no peito para pegar impulso.',
      'Abrir excessivamente os cotovelos a 90 graus, sobrecarregando o manguito rotador.',
      'Arqueamento excessivo da coluna sem apoio lombar adequado.'
    ],
    errorCorrections: [
      'Desça a barra controladamente (2 a 3 segundos) e suba de forma explosiva.',
      'Aponte os cotovelos levemente para dentro.'
    ],
    variations: ['Supino Reto com Halteres', 'Supino Reto na Máquina'],
    substitutions: ['chest_supino_haltere', 'chest_supino_maquina', 'chest_flexao_bracos'],
    safetyWarnings: [
      'Use travas de segurança ou tenha um parceiro de treino (spotter) para cargas elevadas.',
      'Evite a pegada falsa (com o dedão solto do mesmo lado dos dedos).'
    ],
    type: 'main'
  },
  {
    id: 'chest_supino_haltere',
    name: 'Supino Reto com Halteres',
    thumbnail: '💪 Supino Halteres',
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'Halteres',
    level: 'intermediate',
    executionSteps: [
      'Sente-se com os halteres nas coxas, deite-se e posicione-os na linha do peito.',
      'Empurre os halteres para cima alinhados com o peito médio.',
      'Desça os halteres lentamente até sentir o alongamento no peito.',
      'Empurre de volta ao topo mantendo o punho firme.'
    ],
    postureTips: [
      'Pés firmes no chão.',
      'Mantenha os halteres alinhados com os antebraços verticais.'
    ],
    breathing: 'Inspire na descida, expire ao empurrar.',
    commonErrors: ['Bater os halteres no topo.', 'Cotovelos excessivamente abertos.'],
    errorCorrections: ['Pare os halteres antes de bater.', 'Mantenha os cotovelos a 45 graus.'],
    variations: ['Supino Inclinado com Halteres', 'Supino Declinado'],
    substitutions: ['chest_supino_reto', 'chest_supino_maquina'],
    safetyWarnings: ['Cuidado ao soltar os halteres no final da série.'],
    type: 'main'
  },
  {
    id: 'chest_supino_inclinado_haltere',
    name: 'Supino Inclinado com Halteres',
    thumbnail: '💪 Supino Inclinado',
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'Halteres e Banco Inclinado',
    level: 'intermediate',
    executionSteps: [
      'Ajuste o banco para uma inclinação de 30 a 45 graus.',
      'Sente-se com um haltere em cada coxa e deite-se trazendo-os à linha do peito.',
      'Empurre os halteres para cima alinhados com o peito superior.',
      'Desça os halteres lentamente até sentir o alongamento no peito.',
      'Empurre os halteres de volta ao topo sem encostá-los bruscamente.'
    ],
    postureTips: [
      'Mantenha os pés bem plantados no chão para estabilidade.',
      'Mantenha o punho firme e reto alinhado com o antebraço.'
    ],
    breathing: 'Inspire na descida (fase excêntrica) e expire na subida (fase concêntrica).',
    commonErrors: [
      'Inclinar o banco a mais de 45 graus, transferindo o trabalho para a porção anterior do ombro.',
      'Bater os halteres no topo.'
    ],
    errorCorrections: [
      'Ajuste o banco no ângulo correto.',
      'Pare os halteres a alguns centímetros um do outro no topo para manter a tensão muscular constante.'
    ],
    variations: ['Supino Inclinado com Barra', 'Supino Inclinado Articulado'],
    substitutions: ['chest_supino_inclinado_barra', 'chest_peck_deck'],
    safetyWarnings: ['Atenção ao posicionar e retirar os halteres do banco para evitar estiramentos no ombro.'],
    type: 'main'
  },
  {
    id: 'chest_supino_inclinado_barra',
    name: 'Supino Inclinado com Barra',
    thumbnail: '🏋️‍♂️ Supino Inc Barra',
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'Barra e Banco Inclinado',
    level: 'intermediate',
    executionSteps: [
      'Deite no banco inclinado e segure a barra um pouco mais aberta que os ombros.',
      'Remova a barra e desça controladamente até a porção superior do peito.',
      'Empurre a barra verticalmente até estender os braços.'
    ],
    postureTips: ['Mantenha as escápulas presas no banco.', 'Não tire os calcanhares do chão.'],
    breathing: 'Inspire ao descer a barra, expire ao empurrar.',
    commonErrors: ['Descer a barra na garganta.', 'Usar rebote no peito.'],
    errorCorrections: ['A barra deve tocar o peito superior.', 'Faça uma descida controlada de 2 segundos.'],
    variations: ['Supino Inclinado com Halteres'],
    substitutions: ['chest_supino_inclinado_haltere', 'chest_peck_deck'],
    safetyWarnings: ['Sempre use travas de barra.'],
    type: 'main'
  },
  {
    id: 'chest_crucifixo_polia',
    name: 'Crucifixo na Polia Alta (Crossover)',
    thumbnail: '⛓️ Crossover',
    muscleGroup: 'chest',
    secondaryMuscles: ['shoulders'],
    equipment: 'Polia / Crossover',
    level: 'intermediate',
    executionSteps: [
      'Posicione as polias na altura máxima.',
      'Segure os puxadores, dê um passo à frente para criar tensão e incline o tronco ligeiramente.',
      'Com os cotovelos levemente flexionados, traga os braços para frente e para baixo.',
      'Encontre as mãos na linha do quadril e contraia o peitoral por 1 segundo.',
      'Retorne lentamente ao ponto inicial mantendo a contração e o alongamento.'
    ],
    postureTips: ['Mantenha o abdômen contraído e o peito estufado.', 'Evite movimentar o tronco durante a execução.'],
    breathing: 'Expire ao fechar os braços, inspire ao retornar.',
    commonErrors: ['Flexionar e estender os braços como se fosse um supino.', 'Usar o balanço do tronco.'],
    errorCorrections: ['Mantenha os cotovelos fixos em uma leve flexão de aproximadamente 15 graus.'],
    variations: ['Crucifixo Reto com Halteres', 'Crucifixo Máquina (Peck Deck)'],
    substitutions: ['chest_peck_deck', 'chest_crossover_baixo'],
    safetyWarnings: ['Monitore a carga para evitar estresse excessivo na articulação do ombro em alongamento extremo.'],
    type: 'accessory'
  },
  {
    id: 'chest_peck_deck',
    name: 'Peck Deck (Voador)',
    thumbnail: '🦅 Voador Peito',
    muscleGroup: 'chest',
    secondaryMuscles: ['shoulders'],
    equipment: 'Máquina Voador',
    level: 'beginner',
    executionSteps: [
      'Ajuste a altura do banco para que os cotovelos fiquem na linha do peito.',
      'Apoie as costas firmemente no encosto.',
      'Segure os pegadores e empurre aproximando os braços no centro.',
      'Retorne lentamente controlando a carga até o peitoral alongar.'
    ],
    postureTips: ['Mantenha os ombros abaixados e escápulas travadas.', 'Mantenha os pés apoiados no chão.'],
    breathing: 'Expire ao aproximar as mãos, inspire ao abrir.',
    commonErrors: ['Descolar as costas do encosto.', 'Usar excesso de peso que encurte a amplitude.'],
    errorCorrections: ['Reduza o peso e garanta amplitude total encostando levemente os pegadores no centro.'],
    variations: ['Fly com halteres'],
    substitutions: ['chest_crucifixo_polia', 'chest_crucifixo_haltere'],
    safetyWarnings: ['Evite levar os pegadores excessivamente para trás na fase inicial para proteger os ombros.'],
    type: 'accessory'
  },
  {
    id: 'chest_paralelas',
    name: 'Fundos nas Paralelas (Foco Peito)',
    thumbnail: '🪜 Paralelas Peito',
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'Barras Paralelas',
    level: 'advanced',
    executionSteps: [
      'Segure nas barras e suba esticando os braços.',
      'Incline o tronco levemente para a frente e dobre os joelhos.',
      'Desça o corpo dobrando os cotovelos até que estes formem 90 graus.',
      'Empurre o corpo de volta para a posição inicial.'
    ],
    postureTips: ['Incline o tronco para a frente para focar no peito inferior.', 'Não encolha os ombros.'],
    breathing: 'Inspire ao descer, expire ao subir.',
    commonErrors: ['Descer muito rápido.', 'Manter o corpo 100% vertical (foca mais no tríceps).'],
    errorCorrections: ['Desça em 2-3 segundos.', 'Aponte o queixo para o peito e incline-se.'],
    variations: ['Paralelas Graviton', 'Paralelas com Cinto de Carga'],
    substitutions: ['triceps_mergulho_banco', 'chest_supino_declinado_barra'],
    safetyWarnings: ['Pare se sentir dores na clavícula ou esterno.'],
    type: 'main'
  },

  // COSTAS (Back)
  {
    id: 'back_barra_fixa',
    name: 'Barra Fixa (Pull-up)',
    thumbnail: '🧗 Barra Fixa',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'shoulders'],
    equipment: 'Barra Fixa',
    level: 'advanced',
    executionSteps: [
      'Segure a barra com pegada pronada (palmas para fora) mais larga que os ombros.',
      'Fique pendurado com os braços totalmente estendidos.',
      'Puxe o corpo para cima até que o queixo passe a linha da barra.',
      'Desça de forma controlada até estender totalmente os braços.'
    ],
    postureTips: [
      'Mantenha as escápulas retraídas e ativas.',
      'Evite cruzar as pernas excessivamente ou chutar para ganhar impulso (kipping).'
    ],
    breathing: 'Expire na subida, inspire na descida.',
    commonErrors: ['Não realizar a amplitude completa de movimento.', 'Usar muito impulso com as pernas.'],
    errorCorrections: ['Caso não consiga completar repetições, use uma faixa elástica (superband) ou graviton.'],
    variations: ['Barra Fixa Supinada (Chin-up)', 'Barra Neutra'],
    substitutions: ['back_puxada_pulley', 'back_puxada_triangulo'],
    safetyWarnings: ['Assegure-se de que a barra está firme antes de iniciar o exercício.'],
    type: 'main'
  },
  {
    id: 'back_puxada_pulley',
    name: 'Puxada Aberta no Pulley',
    thumbnail: '👐 Puxada Pulley',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'shoulders'],
    equipment: 'Polia Alta (Pulley)',
    level: 'beginner',
    executionSteps: [
      'Segure a barra com pegada pronada na largura marcada.',
      'Ajuste o apoio de pernas e sente-se.',
      'Puxe a barra para baixo em direção ao peito superior, inclinando o tronco levemente para trás.',
      'Retorne a barra lentamente até esticar totalmente os braços e alongar as dorsais.'
    ],
    postureTips: ['Mantenha os cotovelos apontados para baixo.', 'Estufe o peito ao puxar.'],
    breathing: 'Expire ao puxar a barra, inspire na volta.',
    commonErrors: ['Puxar a barra por trás do pescoço (coloca o ombro em posição desfavorável).', 'Despencar o peso.'],
    errorCorrections: ['Puxe a barra sempre na frente, direcionada à clavícula superior.'],
    variations: ['Puxada Triângulo', 'Puxada com Pegada Invertida'],
    substitutions: ['back_barra_fixa', 'back_puxada_fechada'],
    safetyWarnings: ['Evite balançar o corpo excessivamente usando o peso lombar.'],
    type: 'main'
  },
  {
    id: 'back_remada_curvada',
    name: 'Remada Curvada com Barra',
    thumbnail: '🏋️‍♂️ Remada Curvada',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'shoulders'],
    equipment: 'Barra e Anilhas',
    level: 'advanced',
    executionSteps: [
      'Fique em pé com os pés na largura do quadril.',
      'Segure a barra com pegada pronada e flexione os joelhos de leve.',
      'Incline o tronco à frente a 45 graus, mantendo a coluna totalmente reta.',
      'Puxe a barra em direção ao abdômen superior, mantendo cotovelos próximos ao corpo.',
      'Estenda os braços novamente com controle.'
    ],
    postureTips: [
      'Mantenha o core (abdômen) contraído para proteger a lombar.',
      'Olhe para o chão a cerca de 1 metro à frente para manter o pescoço alinhado.'
    ],
    breathing: 'Expire ao puxar a barra, inspire ao descê-la.',
    commonErrors: ['Arredondar a coluna lombar (altíssimo risco de lesão).', 'Ficar em pé demais ao puxar.'],
    errorCorrections: ['Garante que as costas estejam planas. Se necessário, use menos carga ou faça a remada com halteres apoiado.'],
    variations: ['Remada Supinada', 'Remada Curvada com Halteres'],
    substitutions: ['back_remada_baixa', 'back_serrote'],
    safetyWarnings: ['Se sentir qualquer incômodo na lombar, pare imediatamente e reposicione-se.'],
    type: 'main'
  },
  {
    id: 'back_remada_baixa',
    name: 'Remada Sentada com Triângulo',
    thumbnail: '🚣 Remada Sentada',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'shoulders'],
    equipment: 'Polia Baixa e Triângulo',
    level: 'beginner',
    executionSteps: [
      'Sente-se no aparelho e posicione os pés na plataforma com os joelhos levemente flexionados.',
      'Segure o triângulo e afaste-se um pouco para tensionar o cabo, mantendo a coluna ereta.',
      'Puxe o triângulo em direção ao umbigo inferior, retraindo as escápulas e levando os cotovelos para trás.',
      'Estenda os braços à frente lentamente sem deixar a coluna arredondar.'
    ],
    postureTips: ['Mantenha os ombros longe das orelhas.', 'O tronco deve se mover minimamente.'],
    breathing: 'Expire ao puxar, inspire ao retornar.',
    commonErrors: ['Jogar o tronco excessivamente para trás.', 'Esticar completamente os joelhos e sobrecarregá-los.'],
    errorCorrections: ['Mantenha os joelhos semiflexionados e o peito fixo à frente.'],
    variations: ['Remada Unilateral na Polia', 'Remada Barra Romana'],
    substitutions: ['back_remada_curvada', 'back_serrote'],
    safetyWarnings: ['Cuidado com movimentos bruscos ao soltar a carga.'],
    type: 'accessory'
  },

  // OMBRO (Shoulders)
  {
    id: 'shoulder_desenvolvimento_haltere',
    name: 'Desenvolvimento de Ombros com Halteres',
    thumbnail: '🚀 Desenvolvimento',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['triceps'],
    equipment: 'Halteres e Banco',
    level: 'beginner',
    executionSteps: [
      'Sente-se num banco com encosto reto vertical.',
      'Suba os halteres até a altura dos ombros, cotovelos dobrados a 90 graus.',
      'Empurre os halteres verticalmente para cima até estender os braços.',
      'Desça os halteres de forma controlada até o nível das orelhas.'
    ],
    postureTips: ['Mantenha as costas e a lombar bem apoiadas no encosto.', 'Não bata os halteres no topo.'],
    breathing: 'Expire na subida, inspire na descida.',
    commonErrors: ['Descer pouco (curta amplitude).', 'Arquear a lombar excessivamente para frente.'],
    errorCorrections: ['Mantenha o abdômen ativado e desça os halteres até pelo menos o queixo.'],
    variations: ['Desenvolvimento Barra', 'Desenvolvimento Arnold'],
    substitutions: ['shoulder_desenvolvimento_maquina', 'shoulder_desenvolvimento_militar_barra'],
    safetyWarnings: ['Se tiver histórico de dor no ombro, faça com pegada neutra (palmas voltadas para dentro).'],
    type: 'main'
  },
  {
    id: 'shoulder_elevecao_lateral',
    name: 'Elevação Lateral com Halteres',
    thumbnail: '✈️ Elevação Lateral',
    muscleGroup: 'shoulders',
    equipment: 'Halteres',
    level: 'beginner',
    executionSteps: [
      'Fique em pé com pés na largura do quadril, segurando os halteres ao lado do corpo.',
      'Incline o tronco levemente para frente (cerca de 5 a 10 graus).',
      'Eleve os braços lateralmente mantendo cotovelos levemente flexionados até a altura dos ombros.',
      'Desça lentamente mantendo o controle total da gravidade.'
    ],
    postureTips: ['O dedinho da mão deve ficar apontado levemente para cima no topo do movimento.', 'Evite dar trancos.'],
    breathing: 'Expire na elevação, inspire na descida.',
    commonErrors: ['Elevar o braço acima da linha do ombro de forma desordenada.', 'Usar impulsos excessivos do quadril.'],
    errorCorrections: ['Use cargas moderadas que permitam segurar 1 segundo no topo.'],
    variations: ['Elevação Lateral na Polia', 'Elevação Lateral Deitado'],
    substitutions: ['shoulder_elevacao_lateral_polia', 'shoulder_remada_alta_barra'],
    safetyWarnings: ['Cargas excessivas aqui danificam rapidamente o manguito. Foco na técnica e repetições.'],
    type: 'accessory'
  },
  {
    id: 'shoulder_elevecao_posterior',
    name: 'Crucifixo Invertido com Halteres',
    thumbnail: '🦇 Crucifixo Invertido',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['back'],
    equipment: 'Halteres e Banco',
    level: 'intermediate',
    executionSteps: [
      'Incline o tronco à frente a partir do quadril até quase paralelo ao chão, costas retas.',
      'Segure os halteres sob o peito com pegada neutra.',
      'Abra os braços para as laterais, mantendo os cotovelos rígidos e ligeiramente flexionados.',
      'Suba até os braços ficarem paralelos ao chão e retorne devagar.'
    ],
    postureTips: ['Foque em aproximar as escápulas no final.', 'Mantenha a coluna lombar e o pescoço alinhados.'],
    breathing: 'Expire na subida, inspire na descida.',
    commonErrors: ['Balançar todo o corpo.', 'Flexionar os braços, transformando em remada.'],
    errorCorrections: ['Diminua o peso para isolar o deltoide posterior.'],
    variations: ['Crucifixo Invertido na Polia', 'Posterior de Ombro na Máquina (Peck Deck Invertido)'],
    substitutions: ['shoulder_face_pull', 'shoulder_crucifixo_inverso_maquina'],
    safetyWarnings: ['Mantenha a lombar firme e travada para suportar a inclinação.'],
    type: 'accessory'
  },

  // BÍCEPS (Biceps)
  {
    id: 'biceps_rosca_direta',
    name: 'Rosca Direta com Barra W',
    thumbnail: '💪 Rosca Direta',
    muscleGroup: 'biceps',
    equipment: 'Barra W e Anilhas',
    level: 'beginner',
    executionSteps: [
      'Fique em pé, segure a barra W na curva externa com pegada supinada.',
      'Mantenha os cotovelos colados ao tronco.',
      'Flexione os braços trazendo a barra em direção aos ombros.',
      'Desça lentamente até estender os braços quase completamente.'
    ],
    postureTips: ['Mantenha os ombros imóveis e abaixados.', 'Não jogue o quadril para frente.'],
    breathing: 'Expire ao subir, inspire ao descer.',
    commonErrors: ['Balançar o corpo para levantar cargas muito pesadas.', 'Não esticar o braço de forma completa.'],
    errorCorrections: ['Encoste-se em uma parede para testar sua técnica pura e eliminar o balanço.'],
    variations: ['Rosca Direta com Halteres', 'Rosca Direta na Polia'],
    substitutions: ['biceps_rosca_martelo', 'biceps_rosca_scott'],
    safetyWarnings: ['Cuidado com o punho, a barra W diminui o estresse nessa articulação em relação à barra reta.'],
    type: 'main'
  },
  {
    id: 'biceps_rosca_martelo',
    name: 'Rosca Martelo com Halteres',
    thumbnail: '🔨 Rosca Martelo',
    muscleGroup: 'biceps',
    secondaryMuscles: ['functional'], // antebraço
    equipment: 'Halteres',
    level: 'beginner',
    executionSteps: [
      'Fique em pé ou sentado segurando os halteres com pegada neutra (palmas voltadas uma para a outra).',
      'Mantendo os cotovelos fixos ao lado do corpo, levante os halteres alternada ou simultaneamente.',
      'Desça os halteres com controle até a posição inicial.'
    ],
    postureTips: ['O punho deve ficar fixo em posição neutra o tempo todo.', 'Estabilize o core.'],
    breathing: 'Expire na subida, inspire na descida.',
    commonErrors: ['Girar os punhos no meio do movimento (virando rosca comum).', 'Usar peso excessivo.'],
    errorCorrections: ['Mantenha a pegada neutra e firme imitando o golpe de um martelo.'],
    variations: ['Rosca Martelo na Polia com Corda', 'Rosca Martelo Alternada'],
    substitutions: ['biceps_rosca_direta', 'biceps_rosca_martelo_cabo'],
    safetyWarnings: ['Evite esticar repentinamente o cotovelo no ponto mais baixo para não causar microlesões de tendão.'],
    type: 'accessory'
  },

  // TRÍCEPS (Triceps)
  {
    id: 'triceps_polia_corda',
    name: 'Tríceps Polia com Corda',
    thumbnail: '⛓️ Tríceps Corda',
    muscleGroup: 'triceps',
    equipment: 'Polia Alta e Corda',
    level: 'beginner',
    executionSteps: [
      'Prenda a corda na polia alta.',
      'Segure as pontas da corda e dê um pequeno passo para trás, inclinando ligeiramente o tronco.',
      'Mantenha os cotovelos fixos ao lado do tronco.',
      'Empurre a corda para baixo, estendendo totalmente os braços e abrindo a corda no final.',
      'Suba lentamente até os braços formarem pouco mais de 90 graus.'
    ],
    postureTips: ['Foque apenas no movimento da articulação do cotovelo.', 'Mantenha os ombros relaxados.'],
    breathing: 'Expire ao esticar os braços, inspire ao retornar.',
    commonErrors: ['Abrir os cotovelos para as laterais.', 'Usar o peso do corpo para empurrar.'],
    errorCorrections: ['Mantenha os cotovelos encostados nas costelas para isolar o tríceps.'],
    variations: ['Tríceps Polia com Barra Reta', 'Tríceps Polia Invertido'],
    substitutions: ['triceps_testa', 'triceps_coice'],
    safetyWarnings: ['Evite que a polia puxe seus braços bruscamente de volta.'],
    type: 'accessory'
  },
  {
    id: 'triceps_testa',
    name: 'Tríceps Testa com Barra W',
    thumbnail: '🧠 Tríceps Testa',
    muscleGroup: 'triceps',
    equipment: 'Banco e Barra W',
    level: 'intermediate',
    executionSteps: [
      'Deite-se no banco reto segurando a barra W na pegada média.',
      'Estenda os braços verticalmente sobre o peito.',
      'Mantendo os braços parados do cotovelo ao ombro, dobre os cotovelos descendo a barra em direção à testa.',
      'Aproxime a barra da testa lentamente e empurre-a de volta para cima.'
    ],
    postureTips: ['Mantenha os cotovelos apontados para a frente, paralelos um ao outro.', 'Não abra os cotovelos.'],
    breathing: 'Inspire ao descer a barra, expire ao empurrar.',
    commonErrors: ['Mover o braço inteiro a partir do ombro.', 'Abrir demais os cotovelos (coloca estresse no cotovelo).'],
    errorCorrections: ['Imagine que seus cotovelos estão conectados por um elástico virtual que os impede de se afastar.'],
    variations: ['Tríceps Testa com Halteres', 'Tríceps Francês Sentado'],
    substitutions: ['triceps_polia_corda', 'triceps_frances_haltere'],
    safetyWarnings: ['Extremo cuidado com o peso próximo à região do rosto. Realize com barra leve primeiro.'],
    type: 'main'
  },

  // PERNAS (Legs)
  {
    id: 'legs_agachamento_barra',
    name: 'Agachamento Livre com Barra',
    thumbnail: '🏋️‍♂️ Agachamento Livre',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'abs'],
    equipment: 'Barra, Anilhas e Gaiola',
    level: 'intermediate',
    executionSteps: [
      'Posicione a barra sobre o trapézio (não no pescoço) e tire-a do suporte.',
      'Afaste os pés na largura dos ombros, pontas apontadas ligeiramente para fora.',
      'Flexione os joelhos e projete o quadril para trás, como se fosse sentar em uma cadeira.',
      'Desça até que as coxas fiquem pelo menos paralelas ao chão (ou abaixo se tiver mobilidade).',
      'Empurre o chão com a sola do pé para retornar à posição inicial ereta.'
    ],
    postureTips: [
      'Mantenha o peito aberto e a coluna lombar na curvatura fisiológica natural.',
      'Os joelhos devem seguir sempre a direção da ponta dos pés.'
    ],
    breathing: 'Inspire na descida, segurando o abdômen firme (manobra de Valsalva controlada), e expire ao subir.',
    commonErrors: [
      'Joelhos entrando para dentro (valgo dinâmico).',
      'Tirar os calcanhares do chão.',
      'Curvar excessivamente a lombar (bumbum de retroversão pélvica).'
    ],
    errorCorrections: [
      'Forçar ativamente os joelhos para fora durante o movimento.',
      'Usar tênis de sola reta ou fazer descalço/colocar anilhas pequenas sob o calcanhar (melhora mobilidade de tornozelo).'
    ],
    variations: ['Agachamento Sumô', 'Agachamento Frontal (Front Squat)'],
    substitutions: ['legs_leg_press', 'legs_agachamento_hack', 'legs_agachamento_goblet'],
    safetyWarnings: [
      'Sempre agache dentro de uma gaiola de segurança com os suportes laterais ajustados.',
      'Mantenha a musculatura do core 100% ativa.'
    ],
    type: 'main'
  },
  {
    id: 'legs_leg_press',
    name: 'Leg Press 45°',
    thumbnail: '🎢 Leg Press 45',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'calves'],
    equipment: 'Aparelho Leg Press',
    level: 'beginner',
    executionSteps: [
      'Sente-se no aparelho e apoie as costas e o quadril firmemente no encosto.',
      'Apoie os pés na plataforma na largura do quadril.',
      'Destrave a plataforma e dobre os joelhos trazendo a carga em direção ao peito.',
      'Empurre a plataforma estendendo as pernas, sem travar (hiperestender) os joelhos no final.'
    ],
    postureTips: ['Nunca descole o quadril do banco durante a descida.', 'Mantenha os joelhos alinhados com os pés.'],
    breathing: 'Inspire ao descer o peso, expire ao empurrar.',
    commonErrors: ['Colocar cargas muito elevadas e realizar amplitudes minúsculas.', 'Travar os joelhos de forma abrupta.'],
    errorCorrections: ['Diminua a carga e desça a plataforma até um ângulo de pelo menos 90 graus nas pernas.'],
    variations: ['Leg Press Horizontal', 'Leg Press Unilateral'],
    substitutions: ['legs_agachamento_barra', 'legs_agachamento_hack', 'legs_agachamento_goblet'],
    safetyWarnings: ['Nunca apoie as mãos nos joelhos para empurrar. Mantenha as mãos nas travas laterais.'],
    type: 'main'
  },
  {
    id: 'legs_cadeira_extensora',
    name: 'Cadeira Extensora',
    thumbnail: '🪑 Cadeira Extensora',
    muscleGroup: 'legs',
    equipment: 'Aparelho Extensora',
    level: 'beginner',
    executionSteps: [
      'Ajuste o encosto de modo que o seu joelho fique alinhado com o eixo de rotação da máquina.',
      'Ajuste o rolo de espuma sobre a parte inferior da canela (logo acima do tornozelo).',
      'Segure as alças laterais, trave o tronco e estenda as pernas totalmente para cima.',
      'Retorne de forma lenta e controlada ao ponto de partida.'
    ],
    postureTips: ['Mantenha o quadril e a pelve totalmente colados no banco.', 'Pés apontados para cima.'],
    breathing: 'Expire ao estender as pernas, inspire na descida.',
    commonErrors: ['Chutar o peso rapidamente e deixar o peso cair.', 'Ajuste incorreto do encosto (forçando a patela).'],
    errorCorrections: ['Ajuste a máquina para que o fundo do seu joelho encoste confortavelmente na borda frontal do assento.'],
    variations: ['Extensora Unilateral'],
    substitutions: ['legs_afundo_halteres', 'legs_leg_press'],
    safetyWarnings: ['Cuidado com o estresse na articulação fêmoro-patelar em casos de condromalácia patelar grave.'],
    type: 'accessory'
  },
  {
    id: 'legs_mesa_flexora',
    name: 'Mesa Flexora',
    thumbnail: '🛏️ Mesa Flexora',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes'],
    equipment: 'Aparelho Mesa Flexora',
    level: 'beginner',
    executionSteps: [
      'Deite-se de bruços na mesa, alinhando os joelhos com o eixo de rotação.',
      'Posicione o rolo de espuma atrás dos tornozelos, logo abaixo das panturrilhas.',
      'Segure os apoios de mão para estabilizar o tronco.',
      'Flexione os joelhos trazendo os calcanhares em direção aos glúteos.',
      'Estenda as pernas controlando o retorno.'
    ],
    postureTips: ['Evite levantar excessivamente o quadril da mesa durante a flexão.', 'Mantenha a cabeça relaxada.'],
    breathing: 'Expire ao dobrar os joelhos, inspire ao esticar.',
    commonErrors: ['Arquear a lombar e descolar o quadril da mesa.', 'Usar peso excessivo fazendo trancos.'],
    errorCorrections: ['Mantenha o abdômen contraído contra a mesa e faça movimentos lentos.'],
    variations: ['Cadeira Flexora Sentada', 'Flexão de Perna de Pé'],
    substitutions: ['legs_stiff', 'legs_flexora_sentado'],
    safetyWarnings: ['Ajuste a máquina corretamente para não colocar estresse de tração nos ligamentos do joelho.'],
    type: 'accessory'
  },
  {
    id: 'legs_stiff',
    name: 'Stiff (RDL - Romanian Deadlift)',
    thumbnail: '🏋️‍♀️ Stiff com Barra',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'back'],
    equipment: 'Barra e Anilhas',
    level: 'intermediate',
    executionSteps: [
      'Fique em pé segurando a barra com pegada pronada na largura do quadril.',
      'Mantenha as pernas retas com uma semiflexão muito leve nos joelhos.',
      'Empurre o quadril para trás e incline o tronco para a frente, descendo a barra bem colada às pernas.',
      'Desça até sentir um forte alongamento nos posteriores da coxa.',
      'Contraia os posteriores e os glúteos para levantar o tronco de volta ao topo.'
    ],
    postureTips: [
      'A coluna lombar deve ficar reta e estabilizada por completo.',
      'A força deve partir do quadril empurrando para frente e para trás, não da lombar flexionando.'
    ],
    breathing: 'Inspire ao descer a barra, expire ao retornar ao topo.',
    commonErrors: ['Arredondar as costas como uma curva de gato.', 'Dobrar os joelhos demais transformando em agachamento.'],
    errorCorrections: ['Imagine que você precisa tocar a parede atrás de você com o bumbum.'],
    variations: ['Stiff com Halteres', 'Levantamento Terra Convencional'],
    substitutions: ['legs_mesa_flexora', 'legs_flexora_sentado'],
    safetyWarnings: ['Se sua flexibilidade for baixa, reduza a amplitude da descida para garantir que a lombar permaneça plana.'],
    type: 'main'
  },

  // GLÚTEOS (Glutes)
  {
    id: 'glutes_elevacao_pelvica',
    name: 'Elevação Pélvica (Hip Thrust)',
    thumbnail: '🍑 Elevação Pélvica',
    muscleGroup: 'glutes',
    secondaryMuscles: ['legs', 'abs'],
    equipment: 'Banco, Barra e Estofamento',
    level: 'intermediate',
    executionSteps: [
      'Apoie a parte superior das costas em um banco estável e posicione a barra sobre a linha do quadril.',
      'Pés apoiados no chão a 90 graus em relação aos joelhos no topo.',
      'Empurre o quadril para cima contraindo fortemente os glúteos.',
      'Suba até o tronco e as coxas ficarem alinhados horizontalmente.',
      'Desça lentamente o quadril e repita.'
    ],
    postureTips: [
      'Mantenha o queixo apontado para o peito (olhando para frente).',
      'No topo, faça uma retroversão pélvica para contrair os glúteos ao máximo.'
    ],
    breathing: 'Expire ao subir o quadril, inspire ao descer.',
    commonErrors: ['Hiperestender a coluna lombar no topo do movimento.', 'Pés muito próximos ou muito distantes do banco.'],
    errorCorrections: ['Contraia apenas os glúteos, pare antes de arquear a lombar.'],
    variations: ['Elevação Pélvica Unilateral', 'Elevação Pélvica na Máquina'],
    substitutions: ['glutes_ponte_solo', 'legs_agachamento_sumo_halter'],
    safetyWarnings: ['Sempre utilize um protetor de barra espesso.'],
    type: 'main'
  },
  {
    id: 'glutes_gluteo_cabo',
    name: 'Extensão de Quadril no Cabo',
    thumbnail: '⛓️ Glúteo Cabo',
    muscleGroup: 'glutes',
    equipment: 'Polia Baixa e Caneleira',
    level: 'intermediate',
    executionSteps: [
      'Prenda a caneleira na polia baixa e fique de frente para a máquina.',
      'Incline o tronco levemente para frente apoiando as mãos no aparelho.',
      'Puxe a perna para trás e para cima contraindo o glúteo.',
      'Retorne a perna lentamente controlando a força.'
    ],
    postureTips: ['Não compense o movimento arqueando a coluna lombar.', 'Mantenha o joelho da perna de apoio ligeiramente flexionado.'],
    breathing: 'Expire ao chutar para trás, inspire ao retornar.',
    commonErrors: ['Girar o tronco para o lado.', 'Chutar muito rápido sem contrair o glúteo.'],
    errorCorrections: ['Mantenha o quadril apontado rigidamente para a frente.'],
    variations: ['Glúteo com Caneleira deitado', 'Coice de glúteos na máquina'],
    substitutions: ['glutes_elevacao_pelvica', 'glutes_coice_quatro_apoios'],
    safetyWarnings: ['Evite pesos excessivos que desestabilizem sua base.'],
    type: 'accessory'
  },

  // ABDÔMEN (Abs)
  {
    id: 'abs_prancha_abdominal',
    name: 'Prancha Abdominal (Isometria)',
    thumbnail: '🧘 Prancha Abdominal',
    muscleGroup: 'abs',
    secondaryMuscles: ['back', 'shoulders'],
    equipment: 'Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Apoie os antebraços e as pontas dos pés no chão, cotovelos alinhados abaixo dos ombros.',
      'Alinhe o corpo em uma linha reta da cabeça aos calcanhares.',
      'Contraia o abdômen e os glúteos para travar o quadril.',
      'Mantenha a posição pelo tempo determinado sem deixar o quadril cair ou subir.',
      'Respire de forma controlada durante toda a isometria.'
    ],
    postureTips: [
      'Não deixe o quadril subir (formando um "telhado") nem cair (arqueando a lombar).',
      'Olhe para um ponto fixo no chão para manter o pescoço neutro.'
    ],
    breathing: 'Respiração contínua e controlada, sem prender o ar.',
    commonErrors: ['Deixar o quadril cair, sobrecarregando a lombar.', 'Elevar demais o quadril, tirando a tensão do abdômen.'],
    errorCorrections: ['Contraia glúteos e abdômen simultaneamente para nivelar o quadril com a linha do corpo.'],
    variations: ['Prancha com Elevação de Perna', 'Prancha Lateral'],
    substitutions: ['abs_abdominal_supra', 'abs_prancha_lateral'],
    safetyWarnings: ['Interrompa se sentir dor lombar aguda.'],
    type: 'finisher'
  },

  // CARDIO
  {
    id: 'cardio_corrida_esteira',
    name: 'Corrida na Esteira',
    thumbnail: '🏃 Corrida Esteira',
    muscleGroup: 'cardio',
    secondaryMuscles: ['legs', 'calves'],
    equipment: 'Esteira',
    level: 'beginner',
    executionSteps: [
      'Ajuste a velocidade inicial em ritmo de caminhada rápida para aquecer.',
      'Aumente gradualmente a velocidade até o ritmo de corrida definido no treino.',
      'Mantenha o tronco ereto e o olhar à frente durante a corrida.',
      'Alterne entre tiros de maior intensidade e recuperação, se o treino for intervalado (HIIT).',
      'Reduza a velocidade progressivamente nos últimos minutos para desaquecer.'
    ],
    postureTips: [
      'Não se incline para frente segurando o painel da esteira.',
      'Mantenha passadas curtas e cadência natural para reduzir impacto nas articulações.'
    ],
    breathing: 'Respiração ritmada, inspirando e expirando pelo nariz e boca conforme a intensidade.',
    commonErrors: ['Segurar as laterais da esteira durante a corrida.', 'Aumentar a velocidade bruscamente sem aquecimento.'],
    errorCorrections: ['Solte as mãos e ajuste a velocidade gradualmente até o ritmo confortável.'],
    variations: ['Caminhada Inclinada', 'HIIT na Esteira'],
    substitutions: ['cardio_caminhada_esteira', 'cardio_bicicleta'],
    safetyWarnings: ['Use a trava de segurança (clip) presa à roupa em treinos de alta intensidade.'],
    type: 'finisher'
  },

  // PERNAS extras (Legs)
  {
    id: 'legs_levantamento_terra',
    name: 'Levantamento Terra Convencional',
    thumbnail: '🏋️‍♂️ Levantamento Terra',
    muscleGroup: 'legs',
    secondaryMuscles: ['back', 'glutes'],
    equipment: 'Barra e Anilhas',
    level: 'advanced',
    executionSteps: [
      'Posicione os pés na largura do quadril com a barra próxima às canelas.',
      'Flexione os joelhos e o quadril para segurar a barra com pegada pronada, mantendo a coluna reta.',
      'Contraia o core e puxe os ombros para trás antes de iniciar o movimento.',
      'Estenda quadril e joelhos simultaneamente, mantendo a barra colada ao corpo até ficar totalmente em pé.',
      'Retorne a barra ao chão flexionando o quadril primeiro, seguido pelos joelhos, mantendo a coluna neutra.'
    ],
    postureTips: [
      'Mantenha a barra sempre próxima às pernas durante toda a trajetória.',
      'A coluna deve permanecer neutra (nem arredondada, nem hiperestendida) do início ao fim.'
    ],
    breathing: 'Inspire e trave o core antes de puxar, expire ao final da subida.',
    commonErrors: ['Arredondar a coluna lombar ao puxar do chão.', 'Afastar a barra do corpo, gerando alavanca desfavorável.'],
    errorCorrections: ['Reduza a carga até conseguir manter a coluna neutra em todas as repetições.'],
    variations: ['Levantamento Terra Sumô', 'Levantamento Terra Romeno (Stiff)'],
    substitutions: ['legs_stiff', 'legs_agachamento_barra'],
    safetyWarnings: ['Use cinturão de levantamento em cargas elevadas e nunca arredonde a lombar sob carga.'],
    type: 'main'
  },
  {
    id: 'legs_legpress_45',
    name: 'Leg Press 45° (Carga Guiada)',
    thumbnail: '🎢 Leg Press 45 Guiado',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'calves'],
    equipment: 'Aparelho Leg Press 45°',
    level: 'beginner',
    executionSteps: [
      'Sente-se no aparelho apoiando firmemente costas e quadril no encosto.',
      'Posicione os pés na plataforma na largura dos ombros, alinhados com os joelhos.',
      'Destrave as travas laterais e flexione os joelhos controladamente até 90 graus.',
      'Empurre a plataforma estendendo as pernas sem travar os joelhos no topo.',
      'Repita o movimento de forma controlada, mantendo o quadril sempre apoiado.'
    ],
    postureTips: ['Não descole o quadril do encosto durante a descida.', 'Mantenha os joelhos alinhados com a ponta dos pés.'],
    breathing: 'Inspire ao descer a plataforma, expire ao empurrar.',
    commonErrors: ['Descer além do ponto em que o quadril descola do banco.', 'Travar bruscamente os joelhos ao estender.'],
    errorCorrections: ['Reduza a amplitude até o limite que mantém o quadril apoiado e ajuste a carga.'],
    variations: ['Leg Press Unilateral', 'Leg Press Pés Altos'],
    substitutions: ['legs_leg_press', 'legs_agachamento_barra'],
    safetyWarnings: ['Nunca retire as mãos das travas laterais sem antes travar o aparelho.'],
    type: 'main'
  }
];

// GOAL-09: exercícios reais adicionados na expansão da biblioteca.
// Curadoria mapeada em scripts/import-exercises.mjs (SELECTION) — imagens locais garantidas.
const EXPANSION_EXERCISES: Exercise[] = [
  // ===== PEITO =====
  {
    id: 'chest_flexao_bracos',
    name: 'Flexão de Braços',
    thumbnail: '🤸 Flexão de Braços',
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders', 'abs'],
    equipment: 'Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Apoie as mãos no chão um pouco mais abertas que a largura dos ombros.',
      'Estenda as pernas para trás, apoiando as pontas dos pés, com o corpo em linha reta.',
      'Contraia o abdômen e desça o peito controladamente em direção ao chão.',
      'Desça até o peito quase tocar o solo, mantendo os cotovelos a cerca de 45 graus.',
      'Empurre o chão com força até estender os braços por completo.'
    ],
    postureTips: [
      'Mantenha o corpo em prancha: cabeça, quadril e calcanhares alinhados.',
      'Não deixe o quadril cair nem subir durante o movimento.'
    ],
    breathing: 'Inspire ao descer, expire ao empurrar.',
    commonErrors: ['Deixar o quadril despencar, arqueando a lombar.', 'Fazer meia repetição descendo pouco.'],
    errorCorrections: ['Contraia glúteos e abdômen como numa prancha; se precisar, apoie os joelhos para completar a amplitude.'],
    variations: ['Flexão com Joelhos Apoiados', 'Flexão Inclinada no Banco'],
    substitutions: ['chest_supino_maquina', 'chest_supino_haltere'],
    safetyWarnings: ['Se sentir dor no punho, use apoios de flexão ou feche levemente as mãos.'],
    type: 'accessory'
  },
  {
    id: 'chest_crucifixo_haltere',
    name: 'Crucifixo Reto com Halteres',
    thumbnail: '🦅 Crucifixo Reto',
    muscleGroup: 'chest',
    secondaryMuscles: ['shoulders'],
    equipment: 'Halteres e Banco',
    level: 'intermediate',
    executionSteps: [
      'Deite no banco reto com um haltere em cada mão, braços estendidos sobre o peito.',
      'Mantenha uma leve flexão fixa nos cotovelos durante todo o movimento.',
      'Abra os braços em arco, descendo os halteres até a linha do peito.',
      'Sinta o alongamento no peitoral sem forçar o ombro.',
      'Feche o arco no mesmo trajeto, como se abraçasse uma árvore.'
    ],
    postureTips: [
      'O movimento acontece no ombro; o cotovelo não abre nem fecha.',
      'Mantenha as escápulas retraídas contra o banco.'
    ],
    breathing: 'Inspire ao abrir os braços, expire ao fechar.',
    commonErrors: ['Descer demais e estressar o ombro.', 'Transformar o crucifixo em supino dobrando os cotovelos.'],
    errorCorrections: ['Pare a descida na linha do tronco e trave o ângulo do cotovelo com carga mais leve.'],
    variations: ['Crucifixo Inclinado', 'Crucifixo na Polia'],
    substitutions: ['chest_peck_deck', 'chest_crucifixo_polia'],
    safetyWarnings: ['Use cargas moderadas: o crucifixo alavanca muito o ombro na posição alongada.'],
    type: 'accessory'
  },
  {
    id: 'chest_crucifixo_inclinado_haltere',
    name: 'Crucifixo Inclinado com Halteres',
    thumbnail: '🦅 Crucifixo Inclinado',
    muscleGroup: 'chest',
    secondaryMuscles: ['shoulders'],
    equipment: 'Halteres e Banco Inclinado',
    level: 'intermediate',
    executionSteps: [
      'Ajuste o banco entre 30 e 45 graus e deite com um haltere em cada mão.',
      'Estenda os braços sobre a linha do peito superior com leve flexão nos cotovelos.',
      'Abra os braços em arco amplo até sentir o alongamento no peitoral.',
      'Retorne fechando o arco sem bater os halteres no topo.'
    ],
    postureTips: [
      'Mantenha o ângulo do cotovelo travado do início ao fim.',
      'Pés firmes no chão e lombar com curvatura natural.'
    ],
    breathing: 'Inspire na abertura, expire ao fechar os braços.',
    commonErrors: ['Usar carga alta demais e encurtar a amplitude.', 'Deixar os halteres caírem atrás da linha da cabeça.'],
    errorCorrections: ['Reduza a carga e alinhe a descida com a linha do peito superior.'],
    variations: ['Crucifixo Reto', 'Crossover na Polia Baixa'],
    substitutions: ['chest_crucifixo_haltere', 'chest_supino_inclinado_haltere'],
    safetyWarnings: ['Evite abrir além do plano do tronco para proteger a cápsula do ombro.'],
    type: 'accessory'
  },
  {
    id: 'chest_crossover_polia',
    name: 'Crossover na Polia Alta',
    thumbnail: '⛓️ Crossover',
    muscleGroup: 'chest',
    secondaryMuscles: ['shoulders'],
    equipment: 'Polia (Crossover)',
    level: 'intermediate',
    executionSteps: [
      'Ajuste as duas polias na posição alta e segure um pegador em cada mão.',
      'Dê um passo à frente, tronco levemente inclinado, um pé na frente do outro.',
      'Com leve flexão nos cotovelos, puxe os cabos para baixo e para dentro até as mãos se cruzarem à frente do quadril.',
      'Contraia o peitoral por 1 segundo no fechamento.',
      'Retorne controladamente até sentir o alongamento no peito.'
    ],
    postureTips: [
      'Mantenha o tronco estável: quem trabalha é o peito, não o corpo balançando.',
      'Trave o ângulo dos cotovelos durante todo o arco.'
    ],
    breathing: 'Expire ao cruzar os cabos, inspire ao retornar.',
    commonErrors: ['Jogar o corpo para frente para empurrar a carga.', 'Dobrar e esticar os cotovelos como num tríceps.'],
    errorCorrections: ['Diminua a carga e pense em abraçar em arco, não em empurrar.'],
    variations: ['Crossover na Polia Média', 'Crossover na Polia Baixa'],
    substitutions: ['chest_crucifixo_polia', 'chest_peck_deck'],
    safetyWarnings: ['Não solte os cabos bruscamente na posição alongada.'],
    type: 'accessory'
  },
  {
    id: 'chest_crossover_baixo',
    name: 'Crossover na Polia Baixa',
    thumbnail: '⛓️ Crossover Baixo',
    muscleGroup: 'chest',
    secondaryMuscles: ['shoulders'],
    equipment: 'Polia (Crossover)',
    level: 'intermediate',
    executionSteps: [
      'Ajuste as polias na posição baixa e segure um pegador em cada mão, palmas para frente.',
      'Posicione um pé à frente e incline levemente o tronco.',
      'Puxe os cabos para cima e para dentro, em arco, até as mãos se encontrarem na altura do peito superior.',
      'Contraia o peitoral superior no topo e retorne devagar.'
    ],
    postureTips: [
      'Mantenha os ombros para trás e para baixo durante o arco.',
      'Evite encolher o trapézio ao subir os cabos.'
    ],
    breathing: 'Expire ao subir os cabos, inspire ao descer.',
    commonErrors: ['Transformar em elevação frontal de ombro.', 'Balançar o tronco a cada repetição.'],
    errorCorrections: ['Reduza a carga e foque em fechar o arco com o peito, cotovelos semiflexionados e fixos.'],
    variations: ['Crossover Alto', 'Crucifixo Inclinado com Halteres'],
    substitutions: ['chest_crossover_polia', 'chest_crucifixo_inclinado_haltere'],
    safetyWarnings: ['Ajuste bem a base dos pés para não ser puxado para trás pela carga.'],
    type: 'accessory'
  },
  {
    id: 'chest_supino_declinado_barra',
    name: 'Supino Declinado com Barra',
    thumbnail: '🏋️‍♂️ Supino Declinado',
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'Barra e Banco Declinado',
    level: 'intermediate',
    executionSteps: [
      'Deite no banco declinado prendendo bem as pernas no apoio.',
      'Segure a barra um pouco mais aberta que a largura dos ombros.',
      'Retire a barra do suporte e desça controladamente até a parte inferior do peito.',
      'Empurre a barra de volta até estender os braços, sem travar bruscamente os cotovelos.'
    ],
    postureTips: [
      'Mantenha as escápulas retraídas contra o banco.',
      'Punhos firmes e alinhados com os antebraços.'
    ],
    breathing: 'Inspire ao descer a barra, expire ao empurrar.',
    commonErrors: ['Descer a barra na linha do pescoço.', 'Usar rebote no peito para subir.'],
    errorCorrections: ['Alinhe a descida com o peito inferior e controle 2 segundos na fase excêntrica.'],
    variations: ['Supino Declinado com Halteres', 'Paralelas'],
    substitutions: ['chest_supino_reto', 'chest_paralelas'],
    safetyWarnings: ['Sempre use um parceiro (spotter) no declinado: sair da posição com carga é difícil.'],
    type: 'main'
  },
  {
    id: 'chest_supino_maquina',
    name: 'Supino na Máquina',
    thumbnail: '🎛️ Supino Máquina',
    muscleGroup: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'Máquina de Supino',
    level: 'beginner',
    executionSteps: [
      'Ajuste o banco para que os pegadores fiquem na linha do meio do peito.',
      'Apoie bem as costas no encosto e segure os pegadores.',
      'Empurre à frente até quase estender os cotovelos.',
      'Retorne devagar até sentir um leve alongamento no peito.'
    ],
    postureTips: [
      'Mantenha os ombros para trás, encostados no banco, durante o empurrão.',
      'Não deixe o peso bater na pilha entre as repetições.'
    ],
    breathing: 'Expire ao empurrar, inspire ao retornar.',
    commonErrors: ['Banco desregulado, com pegadores na linha do ombro.', 'Estender e travar os cotovelos com impacto.'],
    errorCorrections: ['Regule a altura do banco antes da série e finalize a extensão de forma suave.'],
    variations: ['Supino Reto com Barra', 'Peck Deck'],
    substitutions: ['chest_supino_reto', 'chest_peck_deck'],
    safetyWarnings: ['Ideal para iniciantes: comece aqui antes de migrar para pesos livres.'],
    type: 'main'
  },
  {
    id: 'chest_pullover_haltere',
    name: 'Pullover com Haltere',
    thumbnail: '🌉 Pullover',
    muscleGroup: 'chest',
    secondaryMuscles: ['back', 'triceps'],
    equipment: 'Haltere e Banco',
    level: 'intermediate',
    executionSteps: [
      'Deite no banco reto segurando um haltere com as duas mãos sobre o peito.',
      'Com os cotovelos semiflexionados, leve o haltere para trás da cabeça em arco.',
      'Desça até sentir o alongamento no peitoral e no grande dorsal.',
      'Puxe o haltere de volta sobre o peito contraindo peito e costas.'
    ],
    postureTips: [
      'Mantenha o quadril baixo e o abdômen contraído para não arquear a lombar.',
      'Trave o ângulo dos cotovelos: o movimento é só do ombro.'
    ],
    breathing: 'Inspire ao levar o haltere para trás, expire ao puxar de volta.',
    commonErrors: ['Arquear demais a lombar na descida.', 'Dobrar os cotovelos transformando em tríceps francês.'],
    errorCorrections: ['Reduza a amplitude até conseguir manter a lombar estável.'],
    variations: ['Pullover na Polia Alta', 'Pullover na Máquina'],
    substitutions: ['back_pulldown_braco_reto', 'chest_crucifixo_haltere'],
    safetyWarnings: ['Segure firme o haltere com as duas mãos sobrepostas: ele fica sobre o rosto na descida.'],
    type: 'accessory'
  },

  // ===== COSTAS =====
  {
    id: 'back_serrote',
    name: 'Remada Serrote (Unilateral com Haltere)',
    thumbnail: '🪚 Remada Serrote',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'shoulders'],
    equipment: 'Haltere e Banco',
    level: 'beginner',
    executionSteps: [
      'Apoie o joelho e a mão do mesmo lado no banco, tronco paralelo ao chão.',
      'Segure o haltere com a outra mão, braço estendido e coluna neutra.',
      'Puxe o haltere em direção ao quadril, levando o cotovelo para cima e para trás.',
      'Contraia a escápula no topo por 1 segundo.',
      'Desça controladamente até estender o braço por completo.'
    ],
    postureTips: [
      'Mantenha o tronco estável, sem girar para puxar o peso.',
      'Puxe com as costas: pense em levar o cotovelo ao bolso de trás.'
    ],
    breathing: 'Expire ao puxar o haltere, inspire ao descer.',
    commonErrors: ['Girar o tronco para levantar mais carga.', 'Puxar com o braço, encurtando o movimento da escápula.'],
    errorCorrections: ['Diminua a carga e inicie o movimento retraindo a escápula antes de dobrar o cotovelo.'],
    variations: ['Remada Curvada com Barra', 'Remada Baixa no Cabo'],
    substitutions: ['back_remada_baixa', 'back_remada_curvada'],
    safetyWarnings: ['Mantenha a coluna neutra: não deixe as costas arredondarem sob carga.'],
    type: 'main'
  },
  {
    id: 'back_remada_cavalinho',
    name: 'Remada Cavalinho (T-Bar)',
    thumbnail: '🐎 Remada Cavalinho',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'legs'],
    equipment: 'Barra T e Anilhas',
    level: 'intermediate',
    executionSteps: [
      'Posicione-se sobre a barra com os pés na largura dos ombros e joelhos semiflexionados.',
      'Incline o tronco a cerca de 45 graus mantendo a coluna reta e segure o pegador.',
      'Puxe a barra em direção ao abdômen, levando os cotovelos para trás.',
      'Contraia as escápulas no topo e desça a carga de forma controlada.'
    ],
    postureTips: [
      'Trave o core antes de cada repetição para proteger a lombar.',
      'Mantenha o peito estufado e o olhar à frente/baixo.'
    ],
    breathing: 'Expire ao puxar, inspire ao descer.',
    commonErrors: ['Erguer o tronco a cada repetição para embalar a carga.', 'Arredondar a lombar na posição inclinada.'],
    errorCorrections: ['Fixe o ângulo do tronco e reduza a carga até conseguir puxar sem balanço.'],
    variations: ['Remada Curvada com Barra', 'Remada na Máquina'],
    substitutions: ['back_remada_curvada', 'back_remada_maquina'],
    safetyWarnings: ['Cargas altas nesta posição exigem lombar forte: progrida devagar.'],
    type: 'main'
  },
  {
    id: 'back_puxada_triangulo',
    name: 'Puxada com Triângulo',
    thumbnail: '🔻 Puxada Triângulo',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'Polia Alta (Pulley)',
    level: 'beginner',
    executionSteps: [
      'Prenda o triângulo na polia alta e sente travando as coxas no apoio.',
      'Segure o triângulo com as palmas viradas uma para a outra, braços estendidos.',
      'Incline o tronco levemente para trás e puxe o pegador até a parte alta do peito.',
      'Junte as escápulas no final da puxada e retorne controladamente.'
    ],
    postureTips: [
      'Puxe com os cotovelos, não com as mãos.',
      'Mantenha o peito alto ao encostar o pegador.'
    ],
    breathing: 'Expire ao puxar, inspire ao subir o peso.',
    commonErrors: ['Balançar o tronco para trás a cada repetição.', 'Encurtar a subida sem alongar as costas.'],
    errorCorrections: ['Fixe a inclinação do tronco e deixe os braços estenderem por completo no topo.'],
    variations: ['Puxada Aberta no Pulley', 'Puxada Supinada'],
    substitutions: ['back_puxada_pulley', 'back_puxada_fechada'],
    safetyWarnings: ['Não solte o peso de uma vez ao final da série.'],
    type: 'main'
  },
  {
    id: 'back_puxada_supinada',
    name: 'Puxada Supinada no Pulley',
    thumbnail: '🔄 Puxada Supinada',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'Polia Alta (Pulley)',
    level: 'beginner',
    executionSteps: [
      'Segure a barra do pulley com pegada supinada (palmas para você), na largura dos ombros.',
      'Sente com as coxas travadas no apoio e braços estendidos.',
      'Puxe a barra até a parte alta do peito, levando os cotovelos junto ao corpo.',
      'Controle a subida da barra até estender os braços novamente.'
    ],
    postureTips: [
      'Mantenha o peito estufado e o tronco levemente inclinado para trás.',
      'Desça os ombros antes de puxar: nada de encolher o trapézio.'
    ],
    breathing: 'Expire ao puxar a barra, inspire ao retornar.',
    commonErrors: ['Puxar a barra até o abdômen usando embalo.', 'Deixar os ombros subirem no alongamento sem controle.'],
    errorCorrections: ['Puxe até a linha do peito com o tronco fixo e pause 1 segundo embaixo.'],
    variations: ['Barra Fixa Supinada', 'Puxada com Triângulo'],
    substitutions: ['back_puxada_pulley', 'back_barra_fixa_supinada'],
    safetyWarnings: ['Se sentir desconforto no punho, use a barra W ou pegada neutra.'],
    type: 'main'
  },
  {
    id: 'back_puxada_fechada',
    name: 'Puxada Fechada no Pulley',
    thumbnail: '🤏 Puxada Fechada',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'Polia Alta (Pulley)',
    level: 'beginner',
    executionSteps: [
      'Segure a barra com pegada pronada fechada, mãos um pouco mais próximas que os ombros.',
      'Trave as coxas no apoio e estenda os braços por completo.',
      'Puxe a barra até a parte alta do peito, cotovelos apontando para baixo.',
      'Suba a barra de forma controlada, alongando bem as costas.'
    ],
    postureTips: [
      'Inicie a puxada baixando as escápulas, depois dobre os cotovelos.',
      'Evite deitar o tronco para trás além de uma leve inclinação.'
    ],
    breathing: 'Expire ao puxar, inspire na subida.',
    commonErrors: ['Puxar a barra atrás da nuca.', 'Usar impulso do tronco.'],
    errorCorrections: ['Sempre puxe pela frente, até a linha da clavícula/peito alto.'],
    variations: ['Puxada com Triângulo', 'Puxada Aberta'],
    substitutions: ['back_puxada_triangulo', 'back_puxada_pulley'],
    safetyWarnings: ['Puxada atrás da nuca sobrecarrega o ombro: evite.'],
    type: 'main'
  },
  {
    id: 'back_barra_fixa_supinada',
    name: 'Barra Fixa Supinada',
    thumbnail: '🧗 Barra Supinada',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'abs'],
    equipment: 'Barra Fixa',
    level: 'intermediate',
    executionSteps: [
      'Segure a barra com pegada supinada (palmas para você), na largura dos ombros.',
      'Pendure-se com os braços estendidos e o core contraído.',
      'Puxe o corpo para cima até o queixo passar da barra.',
      'Desça de forma controlada até estender quase por completo os braços.'
    ],
    postureTips: [
      'Suba com o peito em direção à barra, sem dar "pedaladas".',
      'Mantenha ombros ativos mesmo na posição baixa (não fique pendurado solto).'
    ],
    breathing: 'Expire ao subir, inspire ao descer.',
    commonErrors: ['Balançar o corpo para gerar impulso (kipping).', 'Fazer meia repetição sem descer por completo.'],
    errorCorrections: ['Use o graviton ou elástico para completar amplitude total sem balanço.'],
    variations: ['Barra Fixa Pronada', 'Puxada Supinada no Pulley'],
    substitutions: ['back_barra_fixa', 'back_puxada_supinada'],
    safetyWarnings: ['Desça controlado: soltar-se da barra no topo machuca ombros e cotovelos.'],
    type: 'main'
  },
  {
    id: 'back_pulldown_braco_reto',
    name: 'Pulldown com Braços Estendidos',
    thumbnail: '📏 Pulldown Braço Reto',
    muscleGroup: 'back',
    secondaryMuscles: ['triceps', 'abs'],
    equipment: 'Polia Alta',
    level: 'intermediate',
    executionSteps: [
      'De pé, segure a barra na polia alta com os braços estendidos à frente, na altura dos ombros.',
      'Incline o tronco levemente à frente com o core firme.',
      'Com os cotovelos quase retos, puxe a barra em arco até a linha do quadril.',
      'Contraia o grande dorsal embaixo e retorne devagar até a altura dos ombros.'
    ],
    postureTips: [
      'Trave o ângulo dos cotovelos: quem trabalha é o ombro descendo, não o braço dobrando.',
      'Mantenha os ombros longe das orelhas.'
    ],
    breathing: 'Expire ao puxar a barra para baixo, inspire ao subir.',
    commonErrors: ['Dobrar os cotovelos e virar um tríceps na polia.', 'Balançar o tronco para empurrar a barra.'],
    errorCorrections: ['Reduza a carga e pense em varrer um arco com as mãos, tronco imóvel.'],
    variations: ['Pullover com Haltere', 'Puxada no Pulley'],
    substitutions: ['chest_pullover_haltere', 'back_puxada_pulley'],
    safetyWarnings: ['Evite hiperestender a coluna ao final da puxada.'],
    type: 'accessory'
  },
  {
    id: 'back_remada_maquina',
    name: 'Remada na Máquina (Apoiada)',
    thumbnail: '🎛️ Remada Máquina',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'shoulders'],
    equipment: 'Máquina de Remada',
    level: 'beginner',
    executionSteps: [
      'Ajuste o banco para que os pegadores fiquem na linha do meio do peito.',
      'Apoie o peito no suporte e segure os pegadores com os braços estendidos.',
      'Puxe os pegadores levando os cotovelos para trás, junto ao corpo.',
      'Junte as escápulas no final e retorne de forma controlada.'
    ],
    postureTips: [
      'Mantenha o peito colado no apoio durante toda a série.',
      'Não encolha os ombros ao puxar.'
    ],
    breathing: 'Expire ao puxar, inspire ao voltar.',
    commonErrors: ['Descolar o peito do apoio para puxar mais peso.', 'Puxar só com os braços sem mover as escápulas.'],
    errorCorrections: ['Reduza a carga e comece cada repetição retraindo as escápulas.'],
    variations: ['Remada Baixa no Cabo', 'Remada Cavalinho'],
    substitutions: ['back_remada_baixa', 'back_serrote'],
    safetyWarnings: ['Ajuste a máquina antes da série: pegadores altos demais deslocam o trabalho para o trapézio.'],
    type: 'main'
  },
  {
    id: 'back_hiperextensao_lombar',
    name: 'Hiperextensão Lombar (Banco Romano)',
    thumbnail: '🌅 Extensão Lombar',
    muscleGroup: 'back',
    secondaryMuscles: ['glutes', 'legs'],
    equipment: 'Banco Romano',
    level: 'beginner',
    executionSteps: [
      'Ajuste o apoio na altura do quadril e trave os pés no suporte.',
      'Cruze os braços no peito e desça o tronco flexionando o quadril.',
      'Desça até onde conseguir manter a coluna neutra.',
      'Suba contraindo lombar e glúteos até alinhar o tronco com as pernas.'
    ],
    postureTips: [
      'Suba até a linha do corpo, sem hiperestender além dela.',
      'Movimento controlado: 2 segundos para descer, 2 para subir.'
    ],
    breathing: 'Inspire ao descer, expire ao subir.',
    commonErrors: ['Subir além da linha do corpo com impulso.', 'Arredondar demais a coluna na descida.'],
    errorCorrections: ['Pare a subida quando o corpo formar uma linha reta.'],
    variations: ['Hiperextensão com Anilha no Peito', 'Bom Dia com Barra'],
    substitutions: ['glutes_bom_dia_barra', 'glutes_ponte_solo'],
    safetyWarnings: ['Quem tem dor lombar deve reduzir a amplitude e evitar carga adicional.'],
    type: 'accessory'
  },
  {
    id: 'back_remada_curvada_supinada',
    name: 'Remada Curvada Supinada',
    thumbnail: '🏋️ Remada Supinada',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'glutes'],
    equipment: 'Barra e Anilhas',
    level: 'intermediate',
    executionSteps: [
      'Segure a barra com pegada supinada na largura dos ombros.',
      'Incline o tronco a 45 graus com joelhos semiflexionados e coluna neutra.',
      'Puxe a barra em direção ao umbigo, cotovelos rentes ao corpo.',
      'Contraia as escápulas no topo e desça a barra controladamente.'
    ],
    postureTips: [
      'Mantenha o ângulo do tronco fixo durante toda a série.',
      'Core travado como num levantamento terra.'
    ],
    breathing: 'Expire ao puxar a barra, inspire ao descer.',
    commonErrors: ['Levantar o tronco para embalar a barra.', 'Deixar a lombar arredondar.'],
    errorCorrections: ['Reduza a carga e trave o quadril: só o braço e a escápula se movem.'],
    variations: ['Remada Curvada Pronada', 'Remada Serrote'],
    substitutions: ['back_remada_curvada', 'back_serrote'],
    safetyWarnings: ['A pegada supinada aumenta o trabalho do bíceps: cuidado com cargas máximas.'],
    type: 'main'
  },
  {
    id: 'back_remada_invertida',
    name: 'Remada Invertida (Peso Corporal)',
    thumbnail: '🛶 Remada Invertida',
    muscleGroup: 'back',
    secondaryMuscles: ['biceps', 'abs'],
    equipment: 'Barra Baixa / Smith',
    level: 'beginner',
    executionSteps: [
      'Posicione uma barra firme na altura da cintura (Smith ou suporte).',
      'Deite embaixo dela e segure com pegada pronada, corpo reto e calcanhares no chão.',
      'Puxe o peito em direção à barra mantendo o corpo em prancha.',
      'Desça de forma controlada até estender os braços.'
    ],
    postureTips: [
      'Corpo rígido da cabeça aos calcanhares, sem deixar o quadril cair.',
      'Junte as escápulas ao tocar o peito na barra.'
    ],
    breathing: 'Expire ao puxar o corpo, inspire ao descer.',
    commonErrors: ['Quadril caído formando uma "banana".', 'Puxar só com os braços com repetições curtas.'],
    errorCorrections: ['Contraia glúteos e abdômen; se estiver difícil, eleve a barra para facilitar.'],
    variations: ['Barra Fixa', 'Remada Baixa no Cabo'],
    substitutions: ['back_barra_fixa', 'back_remada_baixa'],
    safetyWarnings: ['Confirme que a barra está travada antes de se pendurar.'],
    type: 'accessory'
  },
  {
    id: 'back_encolhimento_halteres',
    name: 'Encolhimento com Halteres',
    thumbnail: '🤷 Encolhimento Halteres',
    muscleGroup: 'back',
    secondaryMuscles: ['shoulders'],
    equipment: 'Halteres',
    level: 'beginner',
    executionSteps: [
      'Fique em pé segurando um haltere em cada mão ao lado do corpo.',
      'Com os braços estendidos, eleve os ombros em direção às orelhas.',
      'Segure a contração do trapézio por 1 a 2 segundos no topo.',
      'Desça os ombros lentamente até o alongamento completo.'
    ],
    postureTips: [
      'O movimento é só para cima e para baixo: não gire os ombros.',
      'Mantenha o queixo neutro e o abdômen firme.'
    ],
    breathing: 'Expire ao encolher, inspire ao descer.',
    commonErrors: ['Rolar os ombros em círculo.', 'Dobrar os cotovelos puxando com os braços.'],
    errorCorrections: ['Pense em tocar as orelhas com os ombros em linha reta, braços relaxados.'],
    variations: ['Encolhimento com Barra', 'Encolhimento no Smith'],
    substitutions: ['back_encolhimento_barra', 'shoulder_remada_alta_barra'],
    safetyWarnings: ['Evite cargas que impeçam a pausa no topo do movimento.'],
    type: 'accessory'
  },
  {
    id: 'back_encolhimento_barra',
    name: 'Encolhimento com Barra',
    thumbnail: '🤷 Encolhimento Barra',
    muscleGroup: 'back',
    secondaryMuscles: ['shoulders'],
    equipment: 'Barra e Anilhas',
    level: 'beginner',
    executionSteps: [
      'Segure a barra à frente do corpo com pegada pronada na largura dos ombros.',
      'Fique em pé com o tronco ereto e braços estendidos.',
      'Eleve os ombros em direção às orelhas o mais alto possível.',
      'Pause no topo e desça controladamente.'
    ],
    postureTips: [
      'Mantenha os braços como "ganchos": quem levanta é o trapézio.',
      'Não incline o pescoço para frente.'
    ],
    breathing: 'Expire ao encolher os ombros, inspire ao descer.',
    commonErrors: ['Usar impulso de pernas para subir a carga.', 'Amplitude curta com carga excessiva.'],
    errorCorrections: ['Reduza o peso até conseguir pausar 1 segundo no topo de cada repetição.'],
    variations: ['Encolhimento com Halteres', 'Encolhimento por Trás (Smith)'],
    substitutions: ['back_encolhimento_halteres', 'shoulder_remada_alta_barra'],
    safetyWarnings: ['Use hand grips ou pegada mista se a pegada falhar antes do trapézio.'],
    type: 'accessory'
  },
  // ===== OMBROS =====
  {
    id: 'shoulder_desenvolvimento_militar_barra',
    name: 'Desenvolvimento Militar em Pé',
    thumbnail: '🎖️ Militar em Pé',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['triceps', 'abs'],
    equipment: 'Barra e Anilhas',
    level: 'intermediate',
    executionSteps: [
      'Retire a barra do suporte na altura das clavículas, pegada um pouco mais aberta que os ombros.',
      'Fique em pé com os pés na largura do quadril e o core bem travado.',
      'Empurre a barra verticalmente, tirando levemente a cabeça do trajeto.',
      'Finalize com a barra sobre a linha das orelhas e os braços estendidos.',
      'Desça controladamente de volta à altura das clavículas.'
    ],
    postureTips: [
      'Contraia glúteos e abdômen para não arquear a lombar.',
      'No topo, "encaixe" a cabeça entre os braços, barra alinhada com o meio do pé.'
    ],
    breathing: 'Inspire e trave o core antes de empurrar, expire ao final da subida.',
    commonErrors: ['Arquear a lombar empurrando o quadril à frente.', 'Empurrar a barra para frente, longe do corpo.'],
    errorCorrections: ['Reduza a carga e pense em empurrar o corpo para baixo da barra.'],
    variations: ['Desenvolvimento Sentado com Barra', 'Push Press'],
    substitutions: ['shoulder_desenvolvimento_barra_sentado', 'shoulder_desenvolvimento_haltere'],
    safetyWarnings: ['Sem impulso de pernas: se precisar de embalo, a carga está alta demais.'],
    type: 'main'
  },
  {
    id: 'shoulder_desenvolvimento_barra_sentado',
    name: 'Desenvolvimento com Barra Sentado',
    thumbnail: '🪑 Desenvolvimento Barra',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['triceps'],
    equipment: 'Barra e Banco com Encosto',
    level: 'intermediate',
    executionSteps: [
      'Sente no banco com encosto quase vertical, pés firmes no chão.',
      'Segure a barra um pouco mais aberta que os ombros e retire do suporte.',
      'Desça a barra controladamente até a linha do queixo/clavícula.',
      'Empurre para cima até estender os braços sobre a cabeça.'
    ],
    postureTips: [
      'Mantenha as costas apoiadas sem esmagar a lombar contra o encosto.',
      'Antebraços verticais sob a barra durante o trajeto.'
    ],
    breathing: 'Inspire ao descer a barra, expire ao empurrar.',
    commonErrors: ['Descer a barra atrás da nuca.', 'Arquear a lombar descolando do encosto.'],
    errorCorrections: ['Sempre desenvolva pela frente e ajuste o encosto para apoiar o tronco todo.'],
    variations: ['Desenvolvimento Militar em Pé', 'Desenvolvimento na Máquina'],
    substitutions: ['shoulder_desenvolvimento_haltere', 'shoulder_desenvolvimento_maquina'],
    safetyWarnings: ['Use o suporte do banco ou um parceiro para pegar e devolver a barra.'],
    type: 'main'
  },
  {
    id: 'shoulder_desenvolvimento_arnold',
    name: 'Desenvolvimento Arnold',
    thumbnail: '💪 Arnold Press',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['triceps'],
    equipment: 'Halteres e Banco',
    level: 'intermediate',
    executionSteps: [
      'Sente com os halteres à frente dos ombros, palmas viradas para você.',
      'Comece a empurrar girando os punhos para fora ao longo da subida.',
      'Finalize com os braços estendidos e as palmas viradas para frente.',
      'Retorne girando de volta até a posição inicial de forma controlada.'
    ],
    postureTips: [
      'A rotação deve ser suave e sincronizada com a subida.',
      'Mantenha o core firme e as costas apoiadas.'
    ],
    breathing: 'Expire durante a subida com rotação, inspire ao descer.',
    commonErrors: ['Girar os punhos de uma vez no início.', 'Usar carga alta demais e perder a rotação.'],
    errorCorrections: ['Use carga menor que a do desenvolvimento tradicional e distribua o giro por todo o trajeto.'],
    variations: ['Desenvolvimento com Halteres', 'Desenvolvimento Militar'],
    substitutions: ['shoulder_desenvolvimento_haltere', 'shoulder_desenvolvimento_maquina'],
    safetyWarnings: ['Evite este exercício se tiver histórico de instabilidade no ombro.'],
    type: 'main'
  },
  {
    id: 'shoulder_desenvolvimento_maquina',
    name: 'Desenvolvimento na Máquina',
    thumbnail: '🎛️ Desenvolvimento Máquina',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['triceps'],
    equipment: 'Máquina de Desenvolvimento',
    level: 'beginner',
    executionSteps: [
      'Ajuste o banco para que os pegadores fiquem na altura dos ombros.',
      'Apoie as costas no encosto e segure os pegadores.',
      'Empurre para cima até quase estender os cotovelos.',
      'Desça de forma controlada até a linha das orelhas.'
    ],
    postureTips: [
      'Mantenha os punhos alinhados com os antebraços.',
      'Ombros para baixo: não encolha o trapézio ao empurrar.'
    ],
    breathing: 'Expire ao empurrar, inspire ao descer.',
    commonErrors: ['Banco baixo demais, começando o movimento muito abaixo dos ombros.', 'Bater a carga na pilha entre repetições.'],
    errorCorrections: ['Regule o assento antes da série e pare a descida na linha das orelhas.'],
    variations: ['Desenvolvimento com Halteres', 'Desenvolvimento Militar'],
    substitutions: ['shoulder_desenvolvimento_haltere', 'shoulder_desenvolvimento_barra_sentado'],
    safetyWarnings: ['Ideal para aprender o padrão de empurrar acima da cabeça com segurança.'],
    type: 'main'
  },
  {
    id: 'shoulder_elevacao_frontal_halteres',
    name: 'Elevação Frontal com Halteres',
    thumbnail: '⬆️ Elevação Frontal',
    muscleGroup: 'shoulders',
    equipment: 'Halteres',
    level: 'beginner',
    executionSteps: [
      'Fique em pé com um haltere em cada mão à frente das coxas.',
      'Com os cotovelos semiflexionados, eleve um ou os dois braços à frente.',
      'Suba até a altura dos ombros, sem passar da linha horizontal.',
      'Desça de forma controlada resistindo à carga.'
    ],
    postureTips: [
      'Tronco parado: não balance para trás para ajudar a subida.',
      'Punho neutro, sem quebrar para cima.'
    ],
    breathing: 'Expire ao elevar, inspire ao descer.',
    commonErrors: ['Balançar o tronco a cada repetição.', 'Subir os halteres acima da linha dos ombros com encolhimento.'],
    errorCorrections: ['Encoste-se numa parede para eliminar o embalo e reduza a carga.'],
    variations: ['Elevação Frontal com Anilha', 'Elevação Frontal no Cabo'],
    substitutions: ['shoulder_desenvolvimento_haltere', 'shoulder_elevecao_lateral'],
    safetyWarnings: ['O deltoide anterior já trabalha muito em supinos: use como acessório, não como base.'],
    type: 'accessory'
  },
  {
    id: 'shoulder_elevacao_lateral_polia',
    name: 'Elevação Lateral na Polia',
    thumbnail: '⛓️ Lateral na Polia',
    muscleGroup: 'shoulders',
    equipment: 'Polia Baixa',
    level: 'intermediate',
    executionSteps: [
      'Fique de lado para a polia baixa e segure o pegador com a mão mais distante.',
      'Com o cotovelo semiflexionado, eleve o braço lateralmente até a altura do ombro.',
      'Pause brevemente no topo sentindo o deltoide lateral.',
      'Desça de forma controlada resistindo ao cabo.'
    ],
    postureTips: [
      'Suba conduzindo com o cotovelo, não com a mão.',
      'Mantenha o tronco ereto, sem inclinar para o lado oposto.'
    ],
    breathing: 'Expire ao elevar o braço, inspire ao descer.',
    commonErrors: ['Encolher o trapézio ao subir.', 'Girar o punho deixando o polegar para cima no topo.'],
    errorCorrections: ['Deixe o mindinho levemente mais alto que o polegar no topo, ombros longe das orelhas.'],
    variations: ['Elevação Lateral com Halteres', 'Elevação Lateral na Máquina'],
    substitutions: ['shoulder_elevecao_lateral', 'shoulder_desenvolvimento_haltere'],
    safetyWarnings: ['A polia mantém tensão constante: use carga menor que a dos halteres.'],
    type: 'accessory'
  },
  {
    id: 'shoulder_face_pull',
    name: 'Face Pull na Polia',
    thumbnail: '🎯 Face Pull',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['back'],
    equipment: 'Polia Alta e Corda',
    level: 'beginner',
    executionSteps: [
      'Prenda a corda na polia na altura do rosto e segure com as palmas para dentro.',
      'Dê um passo para trás e estenda os braços à frente.',
      'Puxe a corda em direção ao rosto, abrindo as pontas ao lado das orelhas.',
      'Finalize com os cotovelos altos e as escápulas juntas, depois retorne devagar.'
    ],
    postureTips: [
      'Cotovelos na altura dos ombros durante toda a puxada.',
      'Pense em fazer uma "pose de duplo bíceps" ao final do movimento.'
    ],
    breathing: 'Expire ao puxar em direção ao rosto, inspire ao voltar.',
    commonErrors: ['Puxar com os cotovelos baixos virando remada.', 'Usar carga alta e inclinar o corpo para trás.'],
    errorCorrections: ['Reduza a carga: o face pull é sobre qualidade de contração, não peso.'],
    variations: ['Crucifixo Inverso na Máquina', 'Elevação Posterior'],
    substitutions: ['shoulder_crucifixo_inverso_maquina', 'shoulder_elevecao_posterior'],
    safetyWarnings: ['Excelente para saúde do ombro: mantenha-o na rotina mesmo em fases de força.'],
    type: 'accessory'
  },
  {
    id: 'shoulder_crucifixo_inverso_maquina',
    name: 'Crucifixo Inverso na Máquina',
    thumbnail: '🦋 Crucifixo Inverso',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['back'],
    equipment: 'Máquina Peck Deck (Invertida)',
    level: 'beginner',
    executionSteps: [
      'Ajuste os braços da máquina para a posição de crucifixo inverso.',
      'Sente de frente para o encosto com o peito apoiado.',
      'Segure os pegadores e abra os braços para trás em arco.',
      'Junte as escápulas no final e retorne de forma controlada.'
    ],
    postureTips: [
      'Cotovelos semiflexionados e fixos durante o arco.',
      'Mantenha o peito colado no apoio o tempo todo.'
    ],
    breathing: 'Expire ao abrir os braços, inspire ao fechar.',
    commonErrors: ['Puxar com o trapézio encolhendo os ombros.', 'Usar impulso jogando o tronco para trás.'],
    errorCorrections: ['Reduza a carga e pause 1 segundo com as escápulas juntas.'],
    variations: ['Face Pull', 'Elevação Posterior Sentado'],
    substitutions: ['shoulder_elevecao_posterior', 'shoulder_face_pull'],
    safetyWarnings: ['Regule a amplitude da máquina para não forçar o ombro atrás do plano do corpo.'],
    type: 'accessory'
  },
  {
    id: 'shoulder_remada_alta_barra',
    name: 'Remada Alta com Barra',
    thumbnail: '⚓ Remada Alta',
    muscleGroup: 'shoulders',
    secondaryMuscles: ['back', 'biceps'],
    equipment: 'Barra e Anilhas',
    level: 'intermediate',
    executionSteps: [
      'Segure a barra à frente do corpo com pegada pronada na largura dos ombros.',
      'Puxe a barra verticalmente rente ao corpo, conduzindo com os cotovelos.',
      'Suba até a barra chegar à linha do peito, cotovelos acima dos punhos.',
      'Desça de forma controlada até estender os braços.'
    ],
    postureTips: [
      'Pegada na largura dos ombros (ou mais aberta) protege o ombro.',
      'Cotovelos sempre mais altos que as mãos durante a subida.'
    ],
    breathing: 'Expire ao puxar a barra, inspire ao descer.',
    commonErrors: ['Pegada fechada demais, gerando pinçamento no ombro.', 'Puxar acima da linha do peito com rotação interna excessiva.'],
    errorCorrections: ['Abra a pegada e pare a subida na linha do peito.'],
    variations: ['Remada Alta com Halteres', 'Encolhimento com Barra'],
    substitutions: ['shoulder_elevecao_lateral', 'back_encolhimento_barra'],
    safetyWarnings: ['Se sentir desconforto no ombro, troque por elevação lateral.'],
    type: 'accessory'
  },

  // ===== BÍCEPS =====
  {
    id: 'biceps_rosca_alternada',
    name: 'Rosca Alternada com Halteres',
    thumbnail: '💪 Rosca Alternada',
    muscleGroup: 'biceps',
    equipment: 'Halteres',
    level: 'beginner',
    executionSteps: [
      'Fique em pé com um haltere em cada mão ao lado do corpo, palmas para dentro.',
      'Suba um haltere girando o punho (supinando) durante a subida.',
      'Contraia o bíceps no topo e desça de forma controlada.',
      'Alterne os braços a cada repetição.'
    ],
    postureTips: [
      'Cotovelos colados ao tronco: eles não avançam para frente.',
      'Tronco parado, sem balanço entre as trocas de braço.'
    ],
    breathing: 'Expire ao subir o haltere, inspire ao descer.',
    commonErrors: ['Balançar o tronco a cada repetição.', 'Descer o haltere sem controle, "soltando" o braço.'],
    errorCorrections: ['Cole os cotovelos nas laterais e desça em 2 segundos.'],
    variations: ['Rosca Direta com Barra', 'Rosca Martelo'],
    substitutions: ['biceps_rosca_direta', 'biceps_rosca_martelo'],
    safetyWarnings: ['Evite "roubar" com a lombar: se precisar, sente-se num banco com encosto.'],
    type: 'accessory'
  },
  {
    id: 'biceps_rosca_scott',
    name: 'Rosca Scott com Barra W',
    thumbnail: '🙏 Rosca Scott',
    muscleGroup: 'biceps',
    equipment: 'Banco Scott e Barra W',
    level: 'intermediate',
    executionSteps: [
      'Ajuste o banco Scott e apoie a parte de trás dos braços no apoio.',
      'Segure a barra W com pegada supinada na largura dos ombros.',
      'Suba a barra contraindo o bíceps até a flexão quase completa.',
      'Desça controladamente até quase estender os cotovelos.'
    ],
    postureTips: [
      'As axilas devem encaixar no topo do apoio, braços totalmente apoiados.',
      'Não levante o corpo do banco ao subir a carga.'
    ],
    breathing: 'Expire ao subir a barra, inspire ao descer.',
    commonErrors: ['Estender os cotovelos por completo com carga alta na posição alongada.', 'Encurtar a descida pela metade.'],
    errorCorrections: ['Desça devagar até quase a extensão total, mantendo tensão no bíceps.'],
    variations: ['Rosca Scott na Máquina', 'Rosca Scott com Halter Unilateral'],
    substitutions: ['biceps_rosca_scott_maquina', 'biceps_rosca_direta'],
    safetyWarnings: ['A posição alongada no Scott é vulnerável: nunca "solte" a barra na descida.'],
    type: 'accessory'
  },
  {
    id: 'biceps_rosca_scott_maquina',
    name: 'Rosca Scott na Máquina',
    thumbnail: '🎛️ Scott Máquina',
    muscleGroup: 'biceps',
    equipment: 'Máquina Scott',
    level: 'beginner',
    executionSteps: [
      'Ajuste o assento para que as axilas encaixem no topo do apoio.',
      'Segure os pegadores com pegada supinada e braços apoiados.',
      'Flexione os cotovelos subindo a carga até a contração máxima.',
      'Retorne devagar até quase estender os braços.'
    ],
    postureTips: [
      'Mantenha os braços colados ao apoio durante toda a série.',
      'Costas eretas, sem projetar os ombros para frente.'
    ],
    breathing: 'Expire ao flexionar, inspire ao estender.',
    commonErrors: ['Assento desregulado, com apoio na altura errada.', 'Soltar a carga na descida.'],
    errorCorrections: ['Regule o assento antes de começar e controle a fase negativa em 2 segundos.'],
    variations: ['Rosca Scott com Barra W', 'Rosca Direta'],
    substitutions: ['biceps_rosca_scott', 'biceps_rosca_polia'],
    safetyWarnings: ['Ótima opção para iniciantes isolarem o bíceps sem roubo de tronco.'],
    type: 'accessory'
  },
  {
    id: 'biceps_rosca_concentrada',
    name: 'Rosca Concentrada',
    thumbnail: '🎯 Rosca Concentrada',
    muscleGroup: 'biceps',
    equipment: 'Haltere e Banco',
    level: 'beginner',
    executionSteps: [
      'Sente no banco com as pernas afastadas e um haltere na mão.',
      'Apoie a parte de trás do braço na parte interna da coxa.',
      'Suba o haltere contraindo o bíceps, sem mover o braço do apoio.',
      'Desça de forma lenta até quase estender o cotovelo.'
    ],
    postureTips: [
      'O braço fica "travado" na coxa: só o antebraço se move.',
      'Mantenha o tronco estável, sem embalar com o corpo.'
    ],
    breathing: 'Expire ao subir, inspire ao descer.',
    commonErrors: ['Levantar o tronco para ajudar na subida.', 'Amplitude curta sem estender embaixo.'],
    errorCorrections: ['Reduza a carga e faça o trajeto completo com pausa de 1 segundo no topo.'],
    variations: ['Rosca Alternada', 'Rosca Scott'],
    substitutions: ['biceps_rosca_alternada', 'biceps_rosca_scott'],
    safetyWarnings: ['Exercício de isolamento: prefira o final do treino de bíceps.'],
    type: 'accessory'
  },
  {
    id: 'biceps_rosca_polia',
    name: 'Rosca Bíceps na Polia',
    thumbnail: '⛓️ Rosca na Polia',
    muscleGroup: 'biceps',
    equipment: 'Polia Baixa',
    level: 'beginner',
    executionSteps: [
      'Prenda a barra reta na polia baixa e segure com pegada supinada.',
      'Fique em pé com os cotovelos colados ao tronco.',
      'Flexione os cotovelos subindo a barra até a contração máxima.',
      'Desça de forma controlada resistindo ao cabo.'
    ],
    postureTips: [
      'Cotovelos fixos ao lado do corpo, sem avançar.',
      'Afaste-se um passo da polia para manter tensão constante.'
    ],
    breathing: 'Expire ao subir a barra, inspire ao descer.',
    commonErrors: ['Inclinar o tronco para trás no final da subida.', 'Deixar o cabo puxar os braços rápido demais na descida.'],
    errorCorrections: ['Trave o core e desça em 2 a 3 segundos.'],
    variations: ['Rosca Direta com Barra', 'Rosca Martelo no Cabo'],
    substitutions: ['biceps_rosca_direta', 'biceps_rosca_martelo_cabo'],
    safetyWarnings: ['A tensão contínua do cabo fadiga rápido: ajuste a carga de acordo.'],
    type: 'accessory'
  },
  {
    id: 'biceps_rosca_martelo_cabo',
    name: 'Rosca Martelo na Polia com Corda',
    thumbnail: '🔨 Martelo no Cabo',
    muscleGroup: 'biceps',
    equipment: 'Polia Baixa e Corda',
    level: 'beginner',
    executionSteps: [
      'Prenda a corda na polia baixa e segure com pegada neutra (palmas para dentro).',
      'Cotovelos colados ao tronco e tronco ereto.',
      'Flexione os cotovelos trazendo a corda em direção aos ombros.',
      'Desça controladamente até quase estender os braços.'
    ],
    postureTips: [
      'Mantenha os punhos neutros e firmes durante todo o trajeto.',
      'Não deixe os ombros rolarem para frente no topo.'
    ],
    breathing: 'Expire ao flexionar, inspire ao estender.',
    commonErrors: ['Balançar o tronco para embalar.', 'Cotovelos avançando para frente no topo.'],
    errorCorrections: ['Reduza a carga e imagine os cotovelos parafusados nas laterais do corpo.'],
    variations: ['Rosca Martelo com Halteres', 'Rosca Inversa'],
    substitutions: ['biceps_rosca_martelo', 'biceps_rosca_polia'],
    safetyWarnings: ['A pegada neutra é a mais amigável para punhos e cotovelos.'],
    type: 'accessory'
  },
  {
    id: 'biceps_rosca_inclinada',
    name: 'Rosca Inclinada com Halteres',
    thumbnail: '🛋️ Rosca Inclinada',
    muscleGroup: 'biceps',
    equipment: 'Halteres e Banco Inclinado',
    level: 'intermediate',
    executionSteps: [
      'Ajuste o banco entre 45 e 60 graus e deite com um haltere em cada mão.',
      'Deixe os braços pendurados verticalmente, alongando o bíceps.',
      'Flexione os cotovelos subindo os halteres com supinação.',
      'Desça devagar até o alongamento completo.'
    ],
    postureTips: [
      'Mantenha a cabeça e as costas apoiadas no banco.',
      'Cotovelos apontando para o chão durante toda a série.'
    ],
    breathing: 'Expire ao subir os halteres, inspire ao descer.',
    commonErrors: ['Avançar os cotovelos para frente ao subir.', 'Descolar a cabeça do banco fazendo força com o pescoço.'],
    errorCorrections: ['Use carga menor: a posição alongada exige menos peso que a rosca em pé.'],
    variations: ['Rosca Alternada em Pé', 'Rosca Concentrada'],
    substitutions: ['biceps_rosca_alternada', 'biceps_rosca_direta'],
    safetyWarnings: ['A posição alongada estressa o tendão: aqueça bem antes de cargas altas.'],
    type: 'accessory'
  },
  {
    id: 'biceps_rosca_w',
    name: 'Rosca Direta com Barra W',
    thumbnail: '〰️ Rosca Barra W',
    muscleGroup: 'biceps',
    equipment: 'Barra W (EZ)',
    level: 'beginner',
    executionSteps: [
      'Segure a barra W nas empunhaduras anguladas, pegada supinada.',
      'Fique em pé com os cotovelos colados ao tronco.',
      'Flexione os cotovelos subindo a barra até a contração máxima.',
      'Desça controladamente até quase estender os braços.'
    ],
    postureTips: [
      'A angulação da barra W alivia a tensão nos punhos.',
      'Tronco firme: sem balançar para embalar a subida.'
    ],
    breathing: 'Expire ao subir a barra, inspire ao descer.',
    commonErrors: ['Jogar o quadril à frente para "roubar" a subida.', 'Encurtar a descida mantendo os cotovelos dobrados.'],
    errorCorrections: ['Encoste as costas numa parede se o tronco estiver balançando.'],
    variations: ['Rosca Direta com Barra Reta', 'Rosca Scott com Barra W'],
    substitutions: ['biceps_rosca_direta', 'biceps_rosca_scott'],
    safetyWarnings: ['Se a barra reta incomoda seus punhos, a W é a melhor troca.'],
    type: 'accessory'
  },
  {
    id: 'biceps_rosca_inversa',
    name: 'Rosca Inversa com Barra',
    thumbnail: '🔃 Rosca Inversa',
    muscleGroup: 'biceps',
    secondaryMuscles: ['shoulders'],
    equipment: 'Barra ou Barra W',
    level: 'intermediate',
    executionSteps: [
      'Segure a barra com pegada pronada (palmas para baixo) na largura dos ombros.',
      'Cotovelos colados ao tronco e punhos firmes.',
      'Flexione os cotovelos subindo a barra até a altura do peito.',
      'Desça de forma controlada até estender os braços.'
    ],
    postureTips: [
      'Punhos retos e travados: não deixe a barra "quebrar" o punho para baixo.',
      'Trabalha o antebraço e o braquial: use carga menor que na rosca direta.'
    ],
    breathing: 'Expire ao subir, inspire ao descer.',
    commonErrors: ['Usar a mesma carga da rosca direta.', 'Punhos dobrando para baixo na subida.'],
    errorCorrections: ['Reduza a carga em 30 a 40% em relação à rosca direta e trave os punhos.'],
    variations: ['Rosca Martelo', 'Rosca Punho'],
    substitutions: ['biceps_rosca_martelo', 'biceps_rosca_w'],
    safetyWarnings: ['Fortalece o antebraço e ajuda na pegada: útil contra dores nos cotovelos.'],
    type: 'accessory'
  },

  // ===== TRÍCEPS =====
  {
    id: 'triceps_supino_fechado',
    name: 'Supino Fechado (Pegada Fechada)',
    thumbnail: '🏋️ Supino Fechado',
    muscleGroup: 'triceps',
    secondaryMuscles: ['chest', 'shoulders'],
    equipment: 'Barra e Banco',
    level: 'intermediate',
    executionSteps: [
      'Deite no banco reto e segure a barra na largura dos ombros (não mais fechada).',
      'Retire a barra do suporte e desça em direção à parte baixa do peito.',
      'Mantenha os cotovelos rentes ao corpo durante a descida.',
      'Empurre a barra de volta ao topo focando na extensão do tríceps.'
    ],
    postureTips: [
      'Escápulas retraídas e pés firmes no chão, como no supino tradicional.',
      'Cotovelos deslizam junto ao tronco, não abertos.'
    ],
    breathing: 'Inspire ao descer a barra, expire ao empurrar.',
    commonErrors: ['Pegada estreita demais, estressando os punhos.', 'Abrir os cotovelos transformando em supino comum.'],
    errorCorrections: ['Mantenha as mãos na largura dos ombros e os cotovelos junto ao corpo.'],
    variations: ['Tríceps Testa', 'Paralelas'],
    substitutions: ['triceps_testa', 'triceps_paralelas'],
    safetyWarnings: ['Use travas de segurança ou spotter em cargas elevadas.'],
    type: 'main'
  },
  {
    id: 'triceps_mergulho_banco',
    name: 'Mergulho entre Bancos',
    thumbnail: '🪑 Mergulho no Banco',
    muscleGroup: 'triceps',
    secondaryMuscles: ['chest', 'shoulders'],
    equipment: 'Banco (Peso Corporal)',
    level: 'beginner',
    executionSteps: [
      'Apoie as mãos na borda do banco atrás de você, dedos apontando para frente.',
      'Estenda as pernas à frente com os calcanhares no chão.',
      'Desça o corpo dobrando os cotovelos até cerca de 90 graus.',
      'Empurre o banco para subir de volta, estendendo os cotovelos.'
    ],
    postureTips: [
      'Mantenha o quadril próximo ao banco durante todo o movimento.',
      'Ombros para baixo e peito aberto, sem encolher.'
    ],
    breathing: 'Inspire ao descer, expire ao subir.',
    commonErrors: ['Descer além de 90 graus estressando o ombro.', 'Afastar o quadril do banco sobrecarregando os ombros.'],
    errorCorrections: ['Limite a descida a 90 graus e deslize o corpo rente ao banco.'],
    variations: ['Mergulho com Pés Elevados', 'Paralelas'],
    substitutions: ['triceps_paralelas', 'triceps_polia_corda'],
    safetyWarnings: ['Quem tem dor no ombro deve preferir o tríceps na polia.'],
    type: 'accessory'
  },
  {
    id: 'triceps_paralelas',
    name: 'Paralelas (Foco em Tríceps)',
    thumbnail: '🤸 Paralelas Tríceps',
    muscleGroup: 'triceps',
    secondaryMuscles: ['chest', 'shoulders'],
    equipment: 'Barras Paralelas',
    level: 'intermediate',
    executionSteps: [
      'Segure as barras paralelas e suba para a posição inicial com os braços estendidos.',
      'Mantenha o tronco o mais vertical possível para focar no tríceps.',
      'Desça dobrando os cotovelos para trás até cerca de 90 graus.',
      'Empurre de volta ao topo estendendo os cotovelos por completo.'
    ],
    postureTips: [
      'Tronco vertical = tríceps; tronco inclinado à frente = peito.',
      'Cotovelos apontando para trás, não abertos para os lados.'
    ],
    breathing: 'Inspire ao descer, expire ao empurrar.',
    commonErrors: ['Descer fundo demais forçando o ombro.', 'Fazer repetições curtas sem estender no topo.'],
    errorCorrections: ['Use o graviton para controlar a amplitude com assistência.'],
    variations: ['Mergulho entre Bancos', 'Supino Fechado'],
    substitutions: ['triceps_mergulho_banco', 'triceps_supino_fechado'],
    safetyWarnings: ['Ombros instáveis? Prefira o tríceps na polia até ganhar força.'],
    type: 'main'
  },
  {
    id: 'triceps_frances_haltere',
    name: 'Tríceps Francês Sentado com Haltere',
    thumbnail: '🇫🇷 Tríceps Francês',
    muscleGroup: 'triceps',
    equipment: 'Haltere e Banco',
    level: 'beginner',
    executionSteps: [
      'Sente no banco e segure um haltere com as duas mãos acima da cabeça.',
      'Mantenha os cotovelos apontando para frente, próximos à cabeça.',
      'Desça o haltere atrás da cabeça dobrando apenas os cotovelos.',
      'Estenda os braços de volta ao topo contraindo o tríceps.'
    ],
    postureTips: [
      'Cotovelos fechados: eles não abrem para os lados na descida.',
      'Core firme para não arquear a lombar.'
    ],
    breathing: 'Inspire ao descer o haltere, expire ao estender.',
    commonErrors: ['Abrir os cotovelos para os lados.', 'Descer o haltere batendo na nuca.'],
    errorCorrections: ['Use carga menor e desça devagar até o alongamento confortável.'],
    variations: ['Tríceps Francês na Polia com Corda', 'Tríceps Testa'],
    substitutions: ['triceps_frances_corda_polia', 'triceps_testa'],
    safetyWarnings: ['Segure firme o haltere: ele passa por trás da sua cabeça.'],
    type: 'accessory'
  },
  {
    id: 'triceps_coice',
    name: 'Tríceps Coice com Haltere',
    thumbnail: '🐴 Tríceps Coice',
    muscleGroup: 'triceps',
    equipment: 'Haltere e Banco',
    level: 'beginner',
    executionSteps: [
      'Apoie o joelho e a mão no banco, tronco paralelo ao chão.',
      'Segure o haltere e cole o braço ao lado do tronco, cotovelo dobrado a 90 graus.',
      'Estenda o cotovelo levando o haltere para trás até a extensão completa.',
      'Segure a contração por 1 segundo e retorne controladamente.'
    ],
    postureTips: [
      'O braço fica paralelo ao chão e imóvel: só o antebraço se move.',
      'Coluna neutra, olhar para o chão.'
    ],
    breathing: 'Expire ao estender o braço, inspire ao dobrar.',
    commonErrors: ['Balançar o braço inteiro como um pêndulo.', 'Deixar o cotovelo cair abaixo da linha do tronco.'],
    errorCorrections: ['Reduza a carga e trave o cotovelo na altura do tronco.'],
    variations: ['Coice na Polia', 'Tríceps na Polia com Corda'],
    substitutions: ['triceps_polia_corda', 'triceps_frances_haltere'],
    safetyWarnings: ['Exercício de finalização: prefira cargas leves e contração máxima.'],
    type: 'finisher'
  },
  {
    id: 'triceps_polia_barra',
    name: 'Tríceps na Polia com Barra Reta',
    thumbnail: '⛓️ Tríceps Barra',
    muscleGroup: 'triceps',
    equipment: 'Polia Alta e Barra Reta',
    level: 'beginner',
    executionSteps: [
      'Segure a barra reta na polia alta com pegada pronada, mãos na largura dos ombros.',
      'Cole os cotovelos nas laterais do tronco.',
      'Empurre a barra para baixo até estender os cotovelos por completo.',
      'Retorne controladamente até os antebraços passarem da linha horizontal.'
    ],
    postureTips: [
      'Cotovelos fixos: eles não sobem nem abrem durante a série.',
      'Tronco levemente inclinado à frente, core firme.'
    ],
    breathing: 'Expire ao empurrar para baixo, inspire ao subir.',
    commonErrors: ['Deixar os cotovelos abrirem e subirem junto com a barra.', 'Usar o peso do corpo para empurrar.'],
    errorCorrections: ['Diminua a carga e trave os cotovelos ao lado do corpo.'],
    variations: ['Tríceps Corda', 'Tríceps Barra V'],
    substitutions: ['triceps_polia_corda', 'triceps_polia_v'],
    safetyWarnings: ['Punhos firmes: não deixe a barra dobrá-los para baixo.'],
    type: 'accessory'
  },
  {
    id: 'triceps_polia_v',
    name: 'Tríceps na Polia com Barra V',
    thumbnail: '✌️ Tríceps Barra V',
    muscleGroup: 'triceps',
    equipment: 'Polia Alta e Barra V',
    level: 'beginner',
    executionSteps: [
      'Segure a barra V na polia alta com pegada neutra inclinada.',
      'Cotovelos colados ao tronco e pés na largura do quadril.',
      'Empurre a barra para baixo até a extensão total dos cotovelos.',
      'Suba de forma controlada mantendo os cotovelos no lugar.'
    ],
    postureTips: [
      'A barra V reduz o estresse nos punhos em relação à barra reta.',
      'Contraia o tríceps por 1 segundo na extensão máxima.'
    ],
    breathing: 'Expire ao estender, inspire ao retornar.',
    commonErrors: ['Encurtar a subida sem soltar o ângulo do cotovelo.', 'Debruçar o corpo sobre a barra.'],
    errorCorrections: ['Deixe o antebraço subir até a linha horizontal antes da próxima repetição.'],
    variations: ['Tríceps Corda', 'Tríceps Barra Reta'],
    substitutions: ['triceps_polia_corda', 'triceps_polia_barra'],
    safetyWarnings: ['Progrida a carga devagar para proteger o cotovelo.'],
    type: 'accessory'
  },
  {
    id: 'triceps_frances_corda_polia',
    name: 'Tríceps Francês na Polia com Corda',
    thumbnail: '⛓️ Francês na Polia',
    muscleGroup: 'triceps',
    equipment: 'Polia Baixa e Corda',
    level: 'intermediate',
    executionSteps: [
      'Prenda a corda na polia baixa e fique de costas para a máquina.',
      'Leve a corda acima da cabeça com os cotovelos apontando para frente.',
      'Desça a corda atrás da cabeça dobrando apenas os cotovelos.',
      'Estenda os braços acima da cabeça abrindo levemente as pontas da corda.'
    ],
    postureTips: [
      'Dê um passo à frente e incline levemente o tronco para estabilizar.',
      'Cotovelos próximos à cabeça durante todo o movimento.'
    ],
    breathing: 'Inspire ao dobrar os cotovelos, expire ao estender.',
    commonErrors: ['Abrir os cotovelos para os lados.', 'Arquear a lombar na extensão.'],
    errorCorrections: ['Trave o core e reduza a carga até o movimento ficar estável.'],
    variations: ['Tríceps Francês com Haltere', 'Tríceps Testa'],
    substitutions: ['triceps_frances_haltere', 'triceps_polia_corda'],
    safetyWarnings: ['Posicione-se com firmeza: a polia puxa você para trás.'],
    type: 'accessory'
  },
  // ===== PERNAS =====
  {
    id: 'legs_agachamento_frontal',
    name: 'Agachamento Frontal com Barra',
    thumbnail: '🏋️ Agachamento Frontal',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'abs'],
    equipment: 'Barra e Suporte',
    level: 'advanced',
    executionSteps: [
      'Apoie a barra na parte frontal dos ombros, cotovelos altos apontando para frente.',
      'Pés na largura dos ombros, pontas levemente para fora.',
      'Desça flexionando joelhos e quadril, mantendo o tronco o mais vertical possível.',
      'Desça até as coxas ficarem pelo menos paralelas ao chão.',
      'Suba empurrando o chão, mantendo os cotovelos altos.'
    ],
    postureTips: [
      'Cotovelos altos o tempo todo: se caírem, a barra rola para frente.',
      'Tronco mais ereto que no agachamento tradicional.'
    ],
    breathing: 'Inspire e trave o core no topo, expire ao final da subida.',
    commonErrors: ['Deixar os cotovelos caírem na subida.', 'Subir com o quadril primeiro, inclinando o tronco.'],
    errorCorrections: ['Reduza a carga e pense em "cotovelos para o teto" durante toda a subida.'],
    variations: ['Agachamento Goblet', 'Agachamento Livre'],
    substitutions: ['legs_agachamento_goblet', 'legs_agachamento_barra'],
    safetyWarnings: ['Exige mobilidade de punho e ombro: trabalhe a pegada antes de progredir carga.'],
    type: 'main'
  },
  {
    id: 'legs_agachamento_goblet',
    name: 'Agachamento Goblet',
    thumbnail: '🏆 Agachamento Goblet',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'abs'],
    equipment: 'Haltere ou Kettlebell',
    level: 'beginner',
    executionSteps: [
      'Segure um haltere na vertical junto ao peito, como um cálice.',
      'Pés um pouco mais abertos que os ombros, pontas para fora.',
      'Desça agachando entre as pernas, mantendo o peso junto ao corpo.',
      'Desça até onde conseguir manter o tronco ereto e os calcanhares no chão.',
      'Suba empurrando o chão com o pé inteiro.'
    ],
    postureTips: [
      'Cotovelos passam por dentro dos joelhos na posição baixa.',
      'Peito aberto e olhar à frente durante todo o movimento.'
    ],
    breathing: 'Inspire ao descer, expire ao subir.',
    commonErrors: ['Deixar os calcanhares levantarem.', 'Joelhos caindo para dentro na subida.'],
    errorCorrections: ['Empurre os joelhos para fora acompanhando a ponta dos pés.'],
    variations: ['Agachamento Livre', 'Agachamento Sumô com Halter'],
    substitutions: ['legs_agachamento_corporal', 'legs_agachamento_sumo_halter'],
    safetyWarnings: ['Melhor porta de entrada para aprender o padrão de agachamento com carga.'],
    type: 'main'
  },
  {
    id: 'legs_agachamento_corporal',
    name: 'Agachamento Livre (Peso Corporal)',
    thumbnail: '🧍 Agachamento Livre',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'abs'],
    equipment: 'Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Fique em pé com os pés na largura dos ombros, pontas levemente para fora.',
      'Estenda os braços à frente para equilibrar.',
      'Desça flexionando joelhos e quadril como se fosse sentar numa cadeira.',
      'Desça até as coxas ficarem paralelas ao chão (ou o máximo confortável).',
      'Suba empurrando o chão com o pé inteiro até estender o quadril.'
    ],
    postureTips: [
      'Peso distribuído no pé inteiro, calcanhares sempre no chão.',
      'Joelhos seguem a direção das pontas dos pés.'
    ],
    breathing: 'Inspire ao descer, expire ao subir.',
    commonErrors: ['Joelhos caindo para dentro.', 'Inclinar demais o tronco à frente.'],
    errorCorrections: ['Agache mais devagar, empurrando os joelhos para fora e mantendo o peito aberto.'],
    variations: ['Agachamento Goblet', 'Agachamento com Salto'],
    substitutions: ['legs_agachamento_goblet', 'legs_leg_press'],
    safetyWarnings: ['Domine este padrão antes de adicionar carga externa.'],
    type: 'warmup'
  },
  {
    id: 'legs_agachamento_hack',
    name: 'Agachamento no Hack',
    thumbnail: '🎢 Hack Machine',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'calves'],
    equipment: 'Máquina Hack',
    level: 'intermediate',
    executionSteps: [
      'Posicione as costas e os ombros nos apoios da máquina.',
      'Pés na plataforma na largura dos ombros, levemente à frente do corpo.',
      'Destrave a máquina e desça flexionando os joelhos de forma controlada.',
      'Desça até cerca de 90 graus ou o máximo confortável.',
      'Empurre a plataforma de volta sem travar os joelhos no topo.'
    ],
    postureTips: [
      'Quadril e costas colados no encosto o tempo todo.',
      'Joelhos alinhados com a ponta dos pés.'
    ],
    breathing: 'Inspire ao descer, expire ao empurrar.',
    commonErrors: ['Pés baixos demais na plataforma, sobrecarregando os joelhos.', 'Descolar o quadril na descida profunda.'],
    errorCorrections: ['Suba os pés na plataforma e limite a amplitude ao ponto em que o quadril fica apoiado.'],
    variations: ['Leg Press 45°', 'Agachamento no Smith'],
    substitutions: ['legs_legpress_45', 'legs_agachamento_smith'],
    safetyWarnings: ['Sempre confira as travas de segurança antes de iniciar a série.'],
    type: 'main'
  },
  {
    id: 'legs_agachamento_smith',
    name: 'Agachamento no Smith',
    thumbnail: '🚪 Agachamento Smith',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes'],
    equipment: 'Máquina Smith',
    level: 'beginner',
    executionSteps: [
      'Posicione a barra do Smith no trapézio e destrave girando os punhos.',
      'Dê um pequeno passo à frente com os dois pés.',
      'Desça flexionando joelhos e quadril até as coxas ficarem paralelas.',
      'Suba empurrando o chão e trave a barra ao final da série.'
    ],
    postureTips: [
      'Os pés à frente permitem descer sem projetar os joelhos.',
      'Core contraído mesmo com a barra guiada.'
    ],
    breathing: 'Inspire ao descer, expire ao subir.',
    commonErrors: ['Pés exatamente embaixo da barra, forçando os joelhos.', 'Confiar na máquina e relaxar o abdômen.'],
    errorCorrections: ['Posicione os pés meio passo à frente e mantenha o tronco firme.'],
    variations: ['Agachamento Livre com Barra', 'Hack Machine'],
    substitutions: ['legs_agachamento_barra', 'legs_agachamento_hack'],
    safetyWarnings: ['Aprenda o mecanismo de trava do Smith antes da primeira série.'],
    type: 'main'
  },
  {
    id: 'legs_agachamento_sumo_halter',
    name: 'Agachamento Sumô com Halter',
    thumbnail: '🌺 Agachamento Sumô',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes'],
    equipment: 'Haltere',
    level: 'beginner',
    executionSteps: [
      'Afaste bem os pés, pontas apontando para fora a 45 graus.',
      'Segure um haltere na vertical com as duas mãos à frente do corpo.',
      'Desça agachando com o tronco ereto, joelhos seguindo as pontas dos pés.',
      'Suba contraindo glúteos e a parte interna das coxas.'
    ],
    postureTips: [
      'Empurre os joelhos para fora durante toda a descida.',
      'O haltere desce verticalmente entre as pernas.'
    ],
    breathing: 'Inspire ao descer, expire ao subir.',
    commonErrors: ['Inclinar o tronco à frente.', 'Base estreita demais, virando agachamento comum.'],
    errorCorrections: ['Abra mais a base e aponte joelhos e pés na mesma direção.'],
    variations: ['Levantamento Terra Sumô', 'Agachamento Goblet'],
    substitutions: ['legs_terra_sumo', 'legs_agachamento_goblet'],
    safetyWarnings: ['Ótimo para adutores e glúteos com baixo estresse lombar.'],
    type: 'accessory'
  },
  {
    id: 'legs_afundo_halteres',
    name: 'Afundo com Halteres',
    thumbnail: '🚶 Afundo Halteres',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'abs'],
    equipment: 'Halteres',
    level: 'beginner',
    executionSteps: [
      'Segure um haltere em cada mão ao lado do corpo.',
      'Dê um passo à frente e desça o joelho de trás em direção ao chão.',
      'Desça até o joelho da frente formar 90 graus, sem passar da ponta do pé.',
      'Empurre o chão com a perna da frente para voltar à posição inicial.',
      'Alterne as pernas ou complete todas as repetições de um lado.'
    ],
    postureTips: [
      'Tronco ereto, com o peso descendo verticalmente entre as pernas.',
      'Passo longo o suficiente para a canela da frente ficar vertical.'
    ],
    breathing: 'Inspire ao descer, expire ao subir.',
    commonErrors: ['Joelho da frente avançando muito além do pé.', 'Tronco inclinando à frente com a fadiga.'],
    errorCorrections: ['Dê um passo mais longo e desça o corpo "de elevador", não "de tombo".'],
    variations: ['Passada com Barra', 'Agachamento Búlgaro'],
    substitutions: ['legs_passada_barra', 'legs_agachamento_bulgaro'],
    safetyWarnings: ['Se o equilíbrio estiver difícil, faça ao lado de um apoio.'],
    type: 'accessory'
  },
  {
    id: 'legs_passada_barra',
    name: 'Passada com Barra (Walking Lunge)',
    thumbnail: '🚶 Passada com Barra',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'abs'],
    equipment: 'Barra e Anilhas',
    level: 'advanced',
    executionSteps: [
      'Apoie a barra no trapézio como num agachamento.',
      'Dê um passo à frente e desça o joelho de trás em direção ao chão.',
      'Empurre com a perna da frente e traga a perna de trás para o próximo passo.',
      'Avance alternando as pernas em linha reta.'
    ],
    postureTips: [
      'Olhe para frente, não para o chão.',
      'Pise firme com o pé inteiro em cada passo.'
    ],
    breathing: 'Inspire ao descer, expire ao empurrar para o próximo passo.',
    commonErrors: ['Passos curtos demais, sobrecarregando os joelhos.', 'Tronco caindo à frente durante a caminhada.'],
    errorCorrections: ['Comece com halteres antes de progredir para a barra.'],
    variations: ['Afundo com Halteres', 'Subida no Banco'],
    substitutions: ['legs_afundo_halteres', 'legs_subida_banco'],
    safetyWarnings: ['Exige espaço livre e equilíbrio: pratique sem carga primeiro.'],
    type: 'main'
  },
  {
    id: 'legs_agachamento_bulgaro',
    name: 'Agachamento Búlgaro',
    thumbnail: '🇧🇬 Agachamento Búlgaro',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes'],
    equipment: 'Halteres e Banco',
    level: 'intermediate',
    executionSteps: [
      'Fique de costas para o banco e apoie o peito de um pé sobre ele.',
      'Segure um haltere em cada mão e dê distância suficiente da perna da frente.',
      'Desça verticalmente flexionando o joelho da frente.',
      'Desça até a coxa da frente ficar paralela ao chão.',
      'Suba empurrando o chão com o pé da frente.'
    ],
    postureTips: [
      'Quase todo o peso fica na perna da frente; a de trás só equilibra.',
      'Tronco levemente inclinado à frente ativa mais o glúteo.'
    ],
    breathing: 'Inspire ao descer, expire ao subir.',
    commonErrors: ['Ficar perto demais do banco, travando a descida.', 'Empurrar com a perna de trás.'],
    errorCorrections: ['Ajuste a distância até a canela da frente ficar vertical no fundo.'],
    variations: ['Afundo com Halteres', 'Subida no Banco'],
    substitutions: ['legs_afundo_halteres', 'legs_subida_banco'],
    safetyWarnings: ['Comece sem carga para achar a distância certa do banco.'],
    type: 'accessory'
  },
  {
    id: 'legs_terra_romeno',
    name: 'Levantamento Terra Romeno',
    thumbnail: '🏋️ Terra Romeno',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'back'],
    equipment: 'Barra e Anilhas',
    level: 'intermediate',
    executionSteps: [
      'Comece em pé segurando a barra na altura do quadril, pegada pronada.',
      'Com joelhos semiflexionados, empurre o quadril para trás.',
      'Desça a barra rente às pernas até a altura da canela (ou onde a lombar mantiver neutra).',
      'Suba estendendo o quadril e contraindo glúteos e posteriores no topo.'
    ],
    postureTips: [
      'A barra desliza colada nas coxas e canelas.',
      'A descida vem do quadril indo para trás, não da coluna dobrando.'
    ],
    breathing: 'Inspire ao descer, expire ao subir.',
    commonErrors: ['Arredondar a lombar no fundo.', 'Dobrar demais os joelhos virando um terra convencional.'],
    errorCorrections: ['Diminua a amplitude e filme-se de lado para conferir a coluna neutra.'],
    variations: ['Stiff com Barra', 'Stiff com Halteres'],
    substitutions: ['legs_stiff', 'legs_stiff_halteres'],
    safetyWarnings: ['Nunca busque profundidade à custa da lombar arredondada.'],
    type: 'main'
  },
  {
    id: 'legs_terra_sumo',
    name: 'Levantamento Terra Sumô',
    thumbnail: '🏋️ Terra Sumô',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'back'],
    equipment: 'Barra e Anilhas',
    level: 'advanced',
    executionSteps: [
      'Afaste bem os pés com as pontas para fora, canelas próximas à barra.',
      'Agache e segure a barra com as mãos por dentro dos joelhos.',
      'Trave o core, peito aberto, e empurre o chão afastando-o dos pés.',
      'Suba até a extensão completa do quadril, com os joelhos acompanhando os pés.',
      'Desça a barra controladamente dobrando o quadril e os joelhos.'
    ],
    postureTips: [
      'Joelhos sempre empurrados para fora, na direção das pontas dos pés.',
      'Tronco mais vertical que no terra convencional.'
    ],
    breathing: 'Inspire e trave antes de puxar, expire no topo.',
    commonErrors: ['Joelhos caindo para dentro na subida.', 'Quadril subindo primeiro e transformando em stiff.'],
    errorCorrections: ['Reduza a carga e pense em "abrir o chão" com os pés.'],
    variations: ['Terra Convencional', 'Agachamento Sumô com Halter'],
    substitutions: ['legs_levantamento_terra', 'legs_agachamento_sumo_halter'],
    safetyWarnings: ['Movimento técnico: aprenda com cargas leves e progrida devagar.'],
    type: 'main'
  },
  {
    id: 'legs_stiff_halteres',
    name: 'Stiff com Halteres',
    thumbnail: '🏋️‍♀️ Stiff Halteres',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'back'],
    equipment: 'Halteres',
    level: 'beginner',
    executionSteps: [
      'Fique em pé com um haltere em cada mão à frente das coxas.',
      'Com joelhos quase estendidos, empurre o quadril para trás.',
      'Desça os halteres rente às pernas até sentir alongar os posteriores.',
      'Suba contraindo glúteos e posteriores até a extensão do quadril.'
    ],
    postureTips: [
      'Coluna neutra do início ao fim; o movimento é do quadril.',
      'Halteres sempre próximos ao corpo.'
    ],
    breathing: 'Inspire ao descer, expire ao subir.',
    commonErrors: ['Arredondar as costas para descer mais.', 'Levar os halteres para longe do corpo.'],
    errorCorrections: ['Desça só até onde a lombar permanecer reta.'],
    variations: ['Stiff com Barra', 'Terra Romeno'],
    substitutions: ['legs_stiff', 'legs_terra_romeno'],
    safetyWarnings: ['Versão mais acessível do stiff: ideal para aprender o padrão de dobradiça de quadril.'],
    type: 'main'
  },
  {
    id: 'legs_cadeira_adutora',
    name: 'Cadeira Adutora',
    thumbnail: '↔️ Cadeira Adutora',
    muscleGroup: 'legs',
    equipment: 'Máquina Adutora',
    level: 'beginner',
    executionSteps: [
      'Sente na máquina com as costas apoiadas e as pernas nos apoios abertos.',
      'Ajuste a abertura inicial em amplitude confortável.',
      'Feche as pernas contraindo a parte interna das coxas.',
      'Retorne devagar resistindo à abertura.'
    ],
    postureTips: [
      'Mantenha o quadril colado no banco durante a série.',
      'Movimento contínuo, sem trancos.'
    ],
    breathing: 'Expire ao fechar as pernas, inspire ao abrir.',
    commonErrors: ['Abertura inicial exagerada, forçando a virilha.', 'Deixar o peso bater na pilha entre repetições.'],
    errorCorrections: ['Regule o pino de amplitude e controle a fase de abertura em 2 segundos.'],
    variations: ['Agachamento Sumô', 'Cadeira Abdutora'],
    substitutions: ['legs_agachamento_sumo_halter', 'legs_cadeira_abdutora'],
    safetyWarnings: ['Aumente a amplitude gradualmente ao longo das semanas, não na primeira série.'],
    type: 'accessory'
  },
  {
    id: 'legs_cadeira_abdutora',
    name: 'Cadeira Abdutora',
    thumbnail: '↔️ Cadeira Abdutora',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes'],
    equipment: 'Máquina Abdutora',
    level: 'beginner',
    executionSteps: [
      'Sente na máquina com as costas apoiadas e as pernas juntas nos apoios.',
      'Abra as pernas empurrando os apoios para fora.',
      'Segure a contração do glúteo por 1 segundo na abertura máxima.',
      'Feche devagar resistindo à carga.'
    ],
    postureTips: [
      'Inclinar o tronco levemente à frente aumenta o trabalho do glúteo.',
      'Não segure na alavanca com força para compensar.'
    ],
    breathing: 'Expire ao abrir as pernas, inspire ao fechar.',
    commonErrors: ['Repetições rápidas usando o embalo da carga.', 'Amplitude curta com peso excessivo.'],
    errorCorrections: ['Reduza a carga e pause na abertura máxima de cada repetição.'],
    variations: ['Coice no Cabo', 'Elevação Pélvica'],
    substitutions: ['glutes_gluteo_cabo', 'glutes_elevacao_pelvica'],
    safetyWarnings: ['Movimento guiado e seguro: bom para finalizar o treino de inferiores.'],
    type: 'accessory'
  },
  {
    id: 'legs_flexora_sentado',
    name: 'Cadeira Flexora (Sentado)',
    thumbnail: '🪑 Flexora Sentada',
    muscleGroup: 'legs',
    equipment: 'Máquina Flexora Sentada',
    level: 'beginner',
    executionSteps: [
      'Ajuste o encosto e o rolo para os tornozelos, joelhos alinhados ao eixo da máquina.',
      'Trave a coxa com o apoio superior.',
      'Flexione os joelhos puxando o rolo para baixo e para trás.',
      'Retorne devagar até quase estender as pernas.'
    ],
    postureTips: [
      'Costas coladas no encosto durante a série toda.',
      'Segure a contração por 1 segundo no final da flexão.'
    ],
    breathing: 'Expire ao flexionar, inspire ao estender.',
    commonErrors: ['Joelhos desalinhados com o eixo de rotação da máquina.', 'Soltar o peso rápido na volta.'],
    errorCorrections: ['Ajuste o banco até o joelho coincidir com o eixo e desça em 2 segundos.'],
    variations: ['Mesa Flexora', 'Stiff'],
    substitutions: ['legs_mesa_flexora', 'legs_stiff'],
    safetyWarnings: ['Posterior de coxa forte protege o joelho: não pule este grupo.'],
    type: 'accessory'
  },
  {
    id: 'legs_subida_banco',
    name: 'Subida no Banco com Halteres',
    thumbnail: '🪜 Subida no Banco',
    muscleGroup: 'legs',
    secondaryMuscles: ['glutes', 'calves'],
    equipment: 'Halteres e Banco/Caixa',
    level: 'beginner',
    executionSteps: [
      'Fique de frente para um banco firme segurando um haltere em cada mão.',
      'Suba colocando o pé inteiro sobre o banco.',
      'Empurre com a perna de cima até estender o quadril no topo.',
      'Desça controladamente com a mesma perna e alterne.'
    ],
    postureTips: [
      'Empurre com a perna de cima: a de baixo não dá impulso.',
      'Tronco ereto, sem se jogar para frente para subir.'
    ],
    breathing: 'Expire ao subir no banco, inspire ao descer.',
    commonErrors: ['Impulsionar com a perna de baixo.', 'Banco alto demais para o nível atual.'],
    errorCorrections: ['Use um banco na altura do joelho ou abaixo e suba devagar.'],
    variations: ['Afundo', 'Agachamento Búlgaro'],
    substitutions: ['legs_afundo_halteres', 'legs_agachamento_bulgaro'],
    safetyWarnings: ['Confirme que o banco/caixa é estável antes da primeira subida.'],
    type: 'accessory'
  },

  // ===== GLÚTEOS =====
  {
    id: 'glutes_coice_quatro_apoios',
    name: 'Coice de Glúteo (Quatro Apoios)',
    thumbnail: '🍑 Coice de Glúteo',
    muscleGroup: 'glutes',
    secondaryMuscles: ['legs', 'abs'],
    equipment: 'Peso Corporal / Caneleira',
    level: 'beginner',
    executionSteps: [
      'Posicione-se em quatro apoios, mãos sob os ombros e joelhos sob o quadril.',
      'Com o joelho dobrado a 90 graus, eleve uma perna empurrando o calcanhar para o teto.',
      'Suba até a coxa ficar na linha do tronco, contraindo o glúteo no topo.',
      'Desça controladamente sem apoiar o joelho no chão e repita.'
    ],
    postureTips: [
      'Core contraído: a lombar não arqueia para subir a perna mais alto.',
      'Quadril nivelado, sem girar para o lado.'
    ],
    breathing: 'Expire ao elevar a perna, inspire ao descer.',
    commonErrors: ['Arquear a lombar para exagerar a altura.', 'Balançar a perna rápido sem contrair o glúteo.'],
    errorCorrections: ['Suba só até a linha do tronco e segure 1 segundo no topo.'],
    variations: ['Coice no Cabo', 'Ponte de Glúteo'],
    substitutions: ['glutes_gluteo_cabo', 'glutes_ponte_solo'],
    safetyWarnings: ['Adicione caneleira apenas quando dominar a execução sem carga.'],
    type: 'accessory'
  },
  {
    id: 'glutes_ponte_solo',
    name: 'Ponte de Glúteo no Solo',
    thumbnail: '🌉 Ponte de Glúteo',
    muscleGroup: 'glutes',
    secondaryMuscles: ['legs', 'abs'],
    equipment: 'Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Deite de costas com os joelhos dobrados e os pés apoiados na largura do quadril.',
      'Braços ao lado do corpo, palmas para baixo.',
      'Empurre o quadril para cima contraindo os glúteos.',
      'Suba até formar uma linha reta dos joelhos aos ombros.',
      'Desça devagar sem encostar o quadril por completo e repita.'
    ],
    postureTips: [
      'A subida termina com contração de glúteo, não com arco lombar.',
      'Calcanhares firmes: empurre o chão com eles.'
    ],
    breathing: 'Expire ao subir o quadril, inspire ao descer.',
    commonErrors: ['Hiperestender a lombar no topo.', 'Empurrar com a ponta dos pés.'],
    errorCorrections: ['Faça uma leve retroversão pélvica no topo e mantenha os calcanhares no chão.'],
    variations: ['Ponte Unilateral', 'Elevação Pélvica com Barra'],
    substitutions: ['glutes_ponte_unilateral', 'glutes_elevacao_pelvica'],
    safetyWarnings: ['Excelente ativação para aquecer os glúteos antes de agachar.'],
    type: 'warmup'
  },
  {
    id: 'glutes_ponte_unilateral',
    name: 'Ponte de Glúteo Unilateral',
    thumbnail: '🌉 Ponte Unilateral',
    muscleGroup: 'glutes',
    secondaryMuscles: ['legs', 'abs'],
    equipment: 'Peso Corporal',
    level: 'intermediate',
    executionSteps: [
      'Deite de costas com um pé apoiado e a outra perna estendida (ou joelho ao peito).',
      'Empurre o quadril para cima usando apenas a perna apoiada.',
      'Suba até a linha reta dos joelhos aos ombros, sem girar o quadril.',
      'Desça controladamente e complete as repetições antes de trocar de lado.'
    ],
    postureTips: [
      'Quadril nivelado: os dois lados sobem juntos.',
      'Braços abertos no chão ajudam na estabilidade.'
    ],
    breathing: 'Expire ao subir, inspire ao descer.',
    commonErrors: ['Quadril caindo para o lado da perna elevada.', 'Empurrar com a lombar em vez do glúteo.'],
    errorCorrections: ['Suba mais devagar e pense em "expulsar" o chão com o calcanhar.'],
    variations: ['Ponte Bilateral', 'Elevação Pélvica'],
    substitutions: ['glutes_ponte_solo', 'glutes_elevacao_pelvica'],
    safetyWarnings: ['Progrida para esta versão só depois de dominar a ponte bilateral.'],
    type: 'accessory'
  },
  {
    id: 'glutes_bom_dia_barra',
    name: 'Bom Dia com Barra (Good Morning)',
    thumbnail: '🌄 Bom Dia',
    muscleGroup: 'glutes',
    secondaryMuscles: ['legs', 'back'],
    equipment: 'Barra e Suporte',
    level: 'advanced',
    executionSteps: [
      'Apoie a barra no trapézio como num agachamento, pés na largura do quadril.',
      'Com joelhos semiflexionados, empurre o quadril para trás.',
      'Incline o tronco à frente mantendo a coluna neutra.',
      'Desça até o tronco ficar próximo do paralelo ao chão (ou o máximo com lombar reta).',
      'Suba estendendo o quadril e contraindo glúteos e posteriores.'
    ],
    postureTips: [
      'É uma dobradiça de quadril, igual ao stiff, com a barra nas costas.',
      'Peito aberto e barra firme contra o trapézio.'
    ],
    breathing: 'Inspire ao descer o tronco, expire ao subir.',
    commonErrors: ['Arredondar a lombar na descida.', 'Usar carga de agachamento.'],
    errorCorrections: ['Comece só com a barra vazia e aumente a amplitude aos poucos.'],
    variations: ['Stiff com Barra', 'Hiperextensão Lombar'],
    substitutions: ['legs_stiff', 'back_hiperextensao_lombar'],
    safetyWarnings: ['Exercício avançado: carga leve e técnica impecável são obrigatórias.'],
    type: 'accessory'
  },

  // ===== PANTURRILHA =====
  {
    id: 'calves_panturrilha_em_pe',
    name: 'Panturrilha em Pé na Máquina',
    thumbnail: '🦵 Panturrilha em Pé',
    muscleGroup: 'calves',
    equipment: 'Máquina de Panturrilha',
    level: 'beginner',
    executionSteps: [
      'Posicione os ombros sob os apoios e as pontas dos pés na plataforma.',
      'Deixe os calcanhares descerem abaixo da plataforma, alongando a panturrilha.',
      'Suba na ponta dos pés o mais alto possível.',
      'Segure a contração por 1 a 2 segundos e desça devagar.'
    ],
    postureTips: [
      'Joelhos estendidos (sem travar) para focar o gastrocnêmio.',
      'Amplitude completa: alongar bem embaixo e subir até o topo.'
    ],
    breathing: 'Expire ao subir na ponta dos pés, inspire ao descer.',
    commonErrors: ['Repetições curtas e rápidas quicando embaixo.', 'Dobrar os joelhos para empurrar a carga.'],
    errorCorrections: ['Pause 1 segundo embaixo e 1 no topo para eliminar o quique.'],
    variations: ['Panturrilha no Leg Press', 'Panturrilha com Halter'],
    substitutions: ['calves_panturrilha_leg_press', 'calves_panturrilha_halter'],
    safetyWarnings: ['Alongamento súbito com carga alta pode lesionar o tendão: desça sempre devagar.'],
    type: 'accessory'
  },
  {
    id: 'calves_panturrilha_sentado',
    name: 'Panturrilha Sentado na Máquina',
    thumbnail: '🪑 Panturrilha Sentado',
    muscleGroup: 'calves',
    equipment: 'Máquina de Panturrilha Sentado',
    level: 'beginner',
    executionSteps: [
      'Sente na máquina com os joelhos sob os apoios e as pontas dos pés na plataforma.',
      'Deixe os calcanhares descerem, alongando a panturrilha.',
      'Eleve os calcanhares o mais alto possível contraindo a panturrilha.',
      'Pause no topo e desça de forma controlada.'
    ],
    postureTips: [
      'Com o joelho dobrado, o foco vai para o sóleo (parte profunda).',
      'Tronco ereto, mãos apoiadas nos pegadores.'
    ],
    breathing: 'Expire ao elevar os calcanhares, inspire ao descer.',
    commonErrors: ['Amplitude curta com carga alta.', 'Quicar embaixo usando o reflexo do tendão.'],
    errorCorrections: ['Reduza a carga e trabalhe pausas de 1 segundo nas duas pontas do movimento.'],
    variations: ['Panturrilha em Pé', 'Panturrilha no Leg Press'],
    substitutions: ['calves_panturrilha_em_pe', 'calves_panturrilha_leg_press'],
    safetyWarnings: ['Trave o apoio dos joelhos antes de soltar a trava da máquina.'],
    type: 'accessory'
  },
  {
    id: 'calves_panturrilha_leg_press',
    name: 'Panturrilha no Leg Press',
    thumbnail: '🎢 Panturrilha Leg Press',
    muscleGroup: 'calves',
    equipment: 'Aparelho Leg Press',
    level: 'beginner',
    executionSteps: [
      'Sente no leg press e apoie apenas as pontas dos pés na parte baixa da plataforma.',
      'Estenda as pernas mantendo as travas de segurança ao alcance.',
      'Empurre a plataforma com a ponta dos pés estendendo os tornozelos.',
      'Retorne devagar deixando a panturrilha alongar.'
    ],
    postureTips: [
      'Joelhos estendidos mas nunca travados sob carga.',
      'Amplitude completa nas duas direções.'
    ],
    breathing: 'Expire ao empurrar, inspire ao retornar.',
    commonErrors: ['Escorregar os pés na plataforma.', 'Fazer o movimento com os joelhos em vez dos tornozelos.'],
    errorCorrections: ['Posicione bem a ponta do pé e mova apenas o tornozelo.'],
    variations: ['Panturrilha em Pé', 'Panturrilha Sentado'],
    substitutions: ['calves_panturrilha_em_pe', 'calves_panturrilha_sentado'],
    safetyWarnings: ['Atenção total ao apoio dos pés: se escorregar, a plataforma desce.'],
    type: 'accessory'
  },
  {
    id: 'calves_panturrilha_halter',
    name: 'Panturrilha em Pé com Halter',
    thumbnail: '🏋️ Panturrilha Halter',
    muscleGroup: 'calves',
    equipment: 'Haltere e Step/Anilha',
    level: 'beginner',
    executionSteps: [
      'Segure um haltere em uma mão e apoie a outra num suporte para equilíbrio.',
      'Suba a ponta de um pé num step ou anilha, calcanhar para fora.',
      'Desça o calcanhar alongando a panturrilha.',
      'Suba na ponta do pé o mais alto que conseguir e desça devagar.'
    ],
    postureTips: [
      'Trabalhe uma perna por vez para corrigir assimetrias.',
      'Corpo ereto: use o apoio só para equilibrar, não para empurrar.'
    ],
    breathing: 'Expire ao subir na ponta do pé, inspire ao descer.',
    commonErrors: ['Quicar rápido sem amplitude.', 'Inclinar o corpo para o lado do haltere.'],
    errorCorrections: ['Faça 2 segundos de subida, pausa no topo e 2 segundos de descida.'],
    variations: ['Panturrilha na Máquina', 'Panturrilha Burro'],
    substitutions: ['calves_panturrilha_em_pe', 'calves_panturrilha_burro'],
    safetyWarnings: ['Use um degrau estável e antiderrapante.'],
    type: 'accessory'
  },
  {
    id: 'calves_panturrilha_burro',
    name: 'Panturrilha Burro (Donkey)',
    thumbnail: '🫏 Panturrilha Burro',
    muscleGroup: 'calves',
    equipment: 'Máquina Donkey / Anilha',
    level: 'intermediate',
    executionSteps: [
      'Incline o tronco à frente apoiando os antebraços no suporte.',
      'Posicione as pontas dos pés na plataforma com o quadril flexionado a 90 graus.',
      'Desça os calcanhares alongando bem a panturrilha.',
      'Suba na ponta dos pés até a contração máxima e desça devagar.'
    ],
    postureTips: [
      'O quadril dobrado alonga mais o gastrocnêmio, aumentando a amplitude útil.',
      'Coluna neutra apoiada no suporte.'
    ],
    breathing: 'Expire ao subir, inspire ao descer.',
    commonErrors: ['Dobrar os joelhos para ajudar na subida.', 'Encurtar o alongamento embaixo.'],
    errorCorrections: ['Deixe o calcanhar descer por completo antes de cada repetição.'],
    variations: ['Panturrilha em Pé', 'Panturrilha no Leg Press'],
    substitutions: ['calves_panturrilha_em_pe', 'calves_panturrilha_leg_press'],
    safetyWarnings: ['Sem a máquina específica, faça no leg press com o mesmo padrão.'],
    type: 'accessory'
  },
  // ===== ABDÔMEN =====
  {
    id: 'abs_abdominal_supra',
    name: 'Abdominal Supra (Crunch)',
    thumbnail: '🔥 Abdominal Supra',
    muscleGroup: 'abs',
    equipment: 'Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Deite de costas com os joelhos dobrados e os pés apoiados no chão.',
      'Mãos atrás da cabeça ou cruzadas no peito, sem puxar o pescoço.',
      'Suba o tronco enrolando a coluna, tirando as escápulas do chão.',
      'Contraia o abdômen no topo e desça de forma controlada.'
    ],
    postureTips: [
      'O movimento é curto: enrolar as costelas em direção ao quadril.',
      'Queixo afastado do peito, olhar para o teto.'
    ],
    breathing: 'Expire ao subir o tronco, inspire ao descer.',
    commonErrors: ['Puxar a cabeça com as mãos.', 'Subir o tronco inteiro usando o flexor do quadril.'],
    errorCorrections: ['Suba apenas até as escápulas saírem do chão, com as mãos leves na cabeça.'],
    variations: ['Abdominal Declinado', 'Abdominal na Polia'],
    substitutions: ['abs_abdominal_declinado', 'abs_abdominal_maquina'],
    safetyWarnings: ['Se sentir o pescoço, apoie a língua no céu da boca e relaxe os ombros.'],
    type: 'finisher'
  },
  {
    id: 'abs_abdominal_declinado',
    name: 'Abdominal no Banco Declinado',
    thumbnail: '📐 Abdominal Declinado',
    muscleGroup: 'abs',
    equipment: 'Banco Declinado',
    level: 'intermediate',
    executionSteps: [
      'Deite no banco declinado com os pés travados nos apoios.',
      'Mãos cruzadas no peito ou ao lado da cabeça.',
      'Suba o tronco enrolando a coluna até cerca de 45 graus.',
      'Desça devagar, vértebra por vértebra, sem relaxar embaixo.'
    ],
    postureTips: [
      'Mantenha tensão constante: não deite por completo entre repetições.',
      'Suba enrolando, não com o tronco reto "em bloco".'
    ],
    breathing: 'Expire ao subir, inspire ao descer.',
    commonErrors: ['Subir com o tronco rígido puxando pelo quadril.', 'Usar impulso dos braços.'],
    errorCorrections: ['Diminua a inclinação do banco e foque em enrolar as costelas.'],
    variations: ['Abdominal Supra', 'Abdominal na Polia'],
    substitutions: ['abs_abdominal_supra', 'abs_abdominal_polia'],
    safetyWarnings: ['Aumente a inclinação do banco de forma progressiva.'],
    type: 'finisher'
  },
  {
    id: 'abs_abdominal_polia',
    name: 'Abdominal na Polia Alta (Ajoelhado)',
    thumbnail: '⛓️ Abdominal Polia',
    muscleGroup: 'abs',
    equipment: 'Polia Alta e Corda',
    level: 'intermediate',
    executionSteps: [
      'Ajoelhe de frente para a polia segurando a corda ao lado da cabeça.',
      'Com o quadril fixo, enrole o tronco levando os cotovelos em direção aos joelhos.',
      'Contraia forte o abdômen no final do movimento.',
      'Retorne devagar até alongar o abdômen, sem mover o quadril.'
    ],
    postureTips: [
      'O quadril não senta nem levanta: só a coluna enrola.',
      'Segure a corda fixa na cabeça: os braços não puxam.'
    ],
    breathing: 'Expire ao enrolar o tronco, inspire ao subir.',
    commonErrors: ['Puxar a carga com os braços.', 'Sentar nos calcanhares a cada repetição.'],
    errorCorrections: ['Reduza a carga e pense em aproximar as costelas do quadril.'],
    variations: ['Abdominal na Máquina', 'Abdominal Supra'],
    substitutions: ['abs_abdominal_maquina', 'abs_abdominal_supra'],
    safetyWarnings: ['Use um colchonete sob os joelhos.'],
    type: 'finisher'
  },
  {
    id: 'abs_abdominal_maquina',
    name: 'Abdominal na Máquina',
    thumbnail: '🎛️ Abdominal Máquina',
    muscleGroup: 'abs',
    equipment: 'Máquina de Abdominal',
    level: 'beginner',
    executionSteps: [
      'Ajuste o assento e segure os pegadores com o peito no apoio.',
      'Enrole o tronco à frente aproximando as costelas do quadril.',
      'Segure a contração por 1 segundo.',
      'Retorne devagar até o alongamento do abdômen.'
    ],
    postureTips: [
      'A força vem do abdômen, não dos braços empurrando os pegadores.',
      'Mantenha os pés apoiados e estáveis.'
    ],
    breathing: 'Expire ao enrolar, inspire ao retornar.',
    commonErrors: ['Carga alta demais com movimento de tronco rígido.', 'Voltar rápido deixando a carga bater.'],
    errorCorrections: ['Reduza a carga até conseguir enrolar a coluna de verdade.'],
    variations: ['Abdominal na Polia', 'Abdominal Supra'],
    substitutions: ['abs_abdominal_polia', 'abs_abdominal_supra'],
    safetyWarnings: ['Boa opção para progredir carga no abdômen com segurança.'],
    type: 'finisher'
  },
  {
    id: 'abs_abdominal_infra',
    name: 'Abdominal Infra no Banco (Elevação de Pernas)',
    thumbnail: '🦵 Abdominal Infra',
    muscleGroup: 'abs',
    equipment: 'Banco Reto',
    level: 'beginner',
    executionSteps: [
      'Deite no banco e segure atrás da cabeça para estabilizar.',
      'Com as pernas quase estendidas, eleve-as até a vertical.',
      'Tire levemente o quadril do banco no topo, contraindo o abdômen baixo.',
      'Desça as pernas devagar sem encostar no chão.'
    ],
    postureTips: [
      'A lombar permanece em contato com o banco na descida.',
      'Desça só até onde a lombar não arquear.'
    ],
    breathing: 'Expire ao subir as pernas, inspire ao descer.',
    commonErrors: ['Arquear a lombar descendo as pernas demais.', 'Balançar as pernas usando impulso.'],
    errorCorrections: ['Dobre um pouco os joelhos e reduza a amplitude da descida.'],
    variations: ['Elevação de Pernas na Barra', 'Prancha'],
    substitutions: ['abs_elevacao_pernas_barra', 'abs_prancha_abdominal'],
    safetyWarnings: ['Dor lombar durante o movimento = amplitude excessiva; reduza.'],
    type: 'finisher'
  },
  {
    id: 'abs_elevacao_pernas_barra',
    name: 'Elevação de Pernas na Barra Fixa',
    thumbnail: '🧗 Elevação na Barra',
    muscleGroup: 'abs',
    secondaryMuscles: ['back'],
    equipment: 'Barra Fixa',
    level: 'advanced',
    executionSteps: [
      'Pendure-se na barra fixa com pegada pronada firme.',
      'Com o core contraído, eleve as pernas estendidas (ou joelhos dobrados) à frente.',
      'Suba até as pernas passarem da linha do quadril, enrolando levemente a pelve.',
      'Desça de forma controlada, sem balançar.'
    ],
    postureTips: [
      'Trave os ombros ativos para não pendurar "solto".',
      'A pelve enrola no final: é isso que ativa o abdômen baixo.'
    ],
    breathing: 'Expire ao elevar as pernas, inspire ao descer.',
    commonErrors: ['Balançar o corpo gerando embalo.', 'Elevar só as pernas sem enrolar a pelve.'],
    errorCorrections: ['Comece com os joelhos dobrados e pause 1 segundo embaixo entre repetições.'],
    variations: ['Elevação de Joelhos', 'Abdominal Infra no Banco'],
    substitutions: ['abs_abdominal_infra', 'abs_prancha_abdominal'],
    safetyWarnings: ['Exige pegada forte: use hand grip se as mãos falharem antes do abdômen.'],
    type: 'finisher'
  },
  {
    id: 'abs_prancha_lateral',
    name: 'Prancha Lateral',
    thumbnail: '📐 Prancha Lateral',
    muscleGroup: 'abs',
    secondaryMuscles: ['shoulders'],
    equipment: 'Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Deite de lado apoiando o antebraço no chão, cotovelo sob o ombro.',
      'Empilhe os pés (ou apoie o de cima à frente) e eleve o quadril.',
      'Alinhe o corpo em linha reta da cabeça aos pés.',
      'Mantenha a posição pelo tempo determinado e troque de lado.'
    ],
    postureTips: [
      'O quadril não pode cair nem dobrar à frente.',
      'Empurre o chão com o antebraço para não afundar o ombro.'
    ],
    breathing: 'Respiração contínua e controlada, sem prender o ar.',
    commonErrors: ['Quadril caído em direção ao chão.', 'Tronco girado para frente ou para trás.'],
    errorCorrections: ['Encoste-se numa parede imaginária: ombro, quadril e pé na mesma linha.'],
    variations: ['Prancha Frontal', 'Prancha Lateral com Elevação de Quadril'],
    substitutions: ['abs_prancha_abdominal', 'abs_abdominal_obliquo'],
    safetyWarnings: ['Se o ombro doer, apoie o joelho de baixo no chão para reduzir a alavanca.'],
    type: 'finisher'
  },
  {
    id: 'abs_abdominal_obliquo',
    name: 'Abdominal Oblíquo',
    thumbnail: '🌀 Abdominal Oblíquo',
    muscleGroup: 'abs',
    equipment: 'Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Deite de costas com os joelhos dobrados e caídos para um dos lados.',
      'Mãos ao lado da cabeça, cotovelos abertos.',
      'Suba o tronco enrolando a coluna na diagonal.',
      'Desça controladamente e complete as repetições antes de trocar o lado.'
    ],
    postureTips: [
      'Os ombros sobem em direção ao quadril oposto.',
      'Não puxe o pescoço com as mãos.'
    ],
    breathing: 'Expire ao subir, inspire ao descer.',
    commonErrors: ['Subir usando impulso dos braços.', 'Girar só o pescoço em vez do tronco.'],
    errorCorrections: ['Suba devagar sentindo a lateral do abdômen trabalhar.'],
    variations: ['Russian Twist', 'Prancha Lateral'],
    substitutions: ['abs_russian_twist', 'abs_prancha_lateral'],
    safetyWarnings: ['Movimento curto e controlado vale mais que amplitude com embalo.'],
    type: 'finisher'
  },
  {
    id: 'abs_russian_twist',
    name: 'Russian Twist (Giro Russo)',
    thumbnail: '🌀 Russian Twist',
    muscleGroup: 'abs',
    equipment: 'Peso Corporal / Anilha',
    level: 'intermediate',
    executionSteps: [
      'Sente no chão com os joelhos dobrados e incline o tronco para trás a 45 graus.',
      'Eleve os pés do chão (ou mantenha apoiados para facilitar).',
      'Gire o tronco levando as mãos (ou anilha) de um lado ao outro.',
      'Controle o giro: o movimento vem do tronco, não dos braços.'
    ],
    postureTips: [
      'Coluna alongada, peito aberto: não deixe as costas arredondarem.',
      'Gire o tórax por inteiro, olhando na direção do movimento.'
    ],
    breathing: 'Expire a cada giro, inspire ao passar pelo centro.',
    commonErrors: ['Balançar só os braços com o tronco parado.', 'Costas totalmente arredondadas.'],
    errorCorrections: ['Sem carga, mais devagar, girando o ombro junto com o tronco.'],
    variations: ['Abdominal Oblíquo', 'Prancha Lateral'],
    substitutions: ['abs_abdominal_obliquo', 'abs_prancha_lateral'],
    safetyWarnings: ['Quem tem dor lombar deve manter os pés no chão e amplitude menor.'],
    type: 'finisher'
  },

  // ===== CARDIO =====
  {
    id: 'cardio_caminhada_esteira',
    name: 'Caminhada na Esteira',
    thumbnail: '🚶 Caminhada Esteira',
    muscleGroup: 'cardio',
    secondaryMuscles: ['legs', 'calves'],
    equipment: 'Esteira',
    level: 'beginner',
    executionSteps: [
      'Suba na esteira e inicie em velocidade baixa (3 a 4 km/h).',
      'Aumente até um ritmo de caminhada acelerada (5 a 6,5 km/h).',
      'Use a inclinação (2 a 8%) para elevar a intensidade sem correr.',
      'Mantenha o ritmo pelo tempo definido e reduza gradualmente ao final.'
    ],
    postureTips: [
      'Tronco ereto, passos naturais e braços balançando livres.',
      'Evite segurar no apoio: reduz o gasto calórico e piora a postura.'
    ],
    breathing: 'Respiração ritmada; você deve conseguir falar frases curtas.',
    commonErrors: ['Segurar o painel com inclinação alta.', 'Passadas longas demais "freando" a esteira.'],
    errorCorrections: ['Reduza a inclinação até conseguir caminhar sem se apoiar.'],
    variations: ['Corrida na Esteira', 'Escada (Step Mill)'],
    substitutions: ['cardio_corrida_esteira', 'cardio_escada'],
    safetyWarnings: ['Use o clip de segurança preso à roupa.'],
    type: 'finisher'
  },
  {
    id: 'cardio_bicicleta',
    name: 'Bicicleta Ergométrica',
    thumbnail: '🚴 Bicicleta',
    muscleGroup: 'cardio',
    secondaryMuscles: ['legs'],
    equipment: 'Bicicleta Ergométrica',
    level: 'beginner',
    executionSteps: [
      'Ajuste o banco: com o pedal embaixo, o joelho fica quase estendido.',
      'Pedale leve por 3 a 5 minutos para aquecer.',
      'Ajuste a carga para o ritmo do treino (contínuo ou intervalado).',
      'Mantenha cadência constante e finalize com 2 a 3 minutos leves.'
    ],
    postureTips: [
      'Banco na altura certa protege o joelho.',
      'Ombros relaxados, sem apoiar todo o peso nos punhos.'
    ],
    breathing: 'Respiração contínua acompanhando a intensidade.',
    commonErrors: ['Banco baixo demais, gerando dor no joelho.', 'Pedalar com carga zero "de enfeite".'],
    errorCorrections: ['Suba o banco e adicione carga até sentir resistência real a cada pedalada.'],
    variations: ['Bike de Spinning', 'Elíptico'],
    substitutions: ['cardio_eliptico', 'cardio_caminhada_esteira'],
    safetyWarnings: ['Opção de menor impacto para joelhos e coluna.'],
    type: 'finisher'
  },
  {
    id: 'cardio_eliptico',
    name: 'Elíptico (Transport)',
    thumbnail: '🌀 Elíptico',
    muscleGroup: 'cardio',
    secondaryMuscles: ['legs', 'glutes'],
    equipment: 'Elíptico',
    level: 'beginner',
    executionSteps: [
      'Suba nos pedais e segure as alavancas móveis.',
      'Inicie o movimento deslizante empurrando pernas e braços alternadamente.',
      'Ajuste a resistência para manter esforço constante.',
      'Mantenha o ritmo pelo tempo definido e desacelere gradualmente.'
    ],
    postureTips: [
      'Tronco ereto, sem debruçar sobre o painel.',
      'Pés inteiros nos pedais, calcanhares apoiados.'
    ],
    breathing: 'Respiração ritmada conforme a intensidade.',
    commonErrors: ['Apoiar o peso do corpo nos braços fixos.', 'Resistência tão baixa que o movimento fica só inércia.'],
    errorCorrections: ['Aumente a resistência até sentir as pernas empurrando de verdade.'],
    variations: ['Bicicleta', 'Caminhada Inclinada'],
    substitutions: ['cardio_bicicleta', 'cardio_caminhada_esteira'],
    safetyWarnings: ['Sem impacto: boa escolha para quem tem restrição em joelhos.'],
    type: 'finisher'
  },
  {
    id: 'cardio_pular_corda',
    name: 'Pular Corda',
    thumbnail: '🪢 Pular Corda',
    muscleGroup: 'cardio',
    secondaryMuscles: ['calves', 'shoulders'],
    equipment: 'Corda',
    level: 'intermediate',
    executionSteps: [
      'Ajuste a corda: pisando no meio, as pontas chegam às axilas.',
      'Gire a corda com os punhos, cotovelos próximos ao corpo.',
      'Salte baixo (2 a 4 cm), aterrissando na ponta dos pés.',
      'Mantenha séries de 30 a 60 segundos com pausas curtas.'
    ],
    postureTips: [
      'Saltos pequenos e elásticos, joelhos levemente flexionados.',
      'O giro vem do punho, não do braço inteiro.'
    ],
    breathing: 'Respiração contínua e ritmada com os saltos.',
    commonErrors: ['Saltar alto demais, gastando energia à toa.', 'Girar a corda com os ombros.'],
    errorCorrections: ['Treine o salto baixo sem corda antes, depois adicione o giro de punho.'],
    variations: ['Polichinelo', 'Corrida no Lugar'],
    substitutions: ['cardio_corrida_esteira', 'functional_escalador'],
    safetyWarnings: ['Alto impacto: use tênis com amortecimento e evite superfícies muito duras.'],
    type: 'finisher'
  },
  {
    id: 'cardio_remo_ergometro',
    name: 'Remo Ergômetro',
    thumbnail: '🚣 Remo Ergômetro',
    muscleGroup: 'cardio',
    secondaryMuscles: ['back', 'legs'],
    equipment: 'Remo Ergômetro',
    level: 'intermediate',
    executionSteps: [
      'Sente no aparelho, prenda os pés e segure o pegador com as duas mãos.',
      'Comece a remada empurrando com as pernas.',
      'Na sequência, incline levemente o tronco para trás e puxe o pegador ao abdômen.',
      'Retorne na ordem inversa: braços estendem, tronco inclina à frente, joelhos dobram.'
    ],
    postureTips: [
      'Sequência correta: pernas → tronco → braços; volta: braços → tronco → pernas.',
      'Coluna neutra o tempo todo, sem arredondar na pegada.'
    ],
    breathing: 'Expire na puxada, inspire no retorno.',
    commonErrors: ['Puxar com os braços antes de empurrar com as pernas.', 'Arredondar as costas à frente.'],
    errorCorrections: ['Treine devagar pensando "pernas primeiro" em cada remada.'],
    variations: ['Bicicleta', 'Escada'],
    substitutions: ['cardio_bicicleta', 'cardio_escada'],
    safetyWarnings: ['Técnica antes de intensidade: remo mal feito sobrecarrega a lombar.'],
    type: 'finisher'
  },
  {
    id: 'cardio_escada',
    name: 'Escada (Step Mill)',
    thumbnail: '🪜 Escada',
    muscleGroup: 'cardio',
    secondaryMuscles: ['legs', 'glutes'],
    equipment: 'Simulador de Escada',
    level: 'intermediate',
    executionSteps: [
      'Suba no aparelho e inicie em velocidade baixa.',
      'Suba os degraus pisando com o pé inteiro.',
      'Aumente a velocidade até o ritmo alvo do treino.',
      'Finalize reduzindo gradualmente a velocidade.'
    ],
    postureTips: [
      'Tronco ereto, mãos apenas tocando o corrimão para equilíbrio.',
      'Pise no centro do degrau com o pé inteiro.'
    ],
    breathing: 'Respiração ritmada; ajuste a velocidade se não conseguir manter.',
    commonErrors: ['Debruçar no corrimão "pendurando" o corpo.', 'Subir na ponta dos pés fadigando a panturrilha.'],
    errorCorrections: ['Reduza a velocidade até conseguir subir ereto sem se apoiar.'],
    variations: ['Caminhada Inclinada', 'Subida no Banco'],
    substitutions: ['cardio_caminhada_esteira', 'legs_subida_banco'],
    safetyWarnings: ['Atenção ao descer do aparelho: os degraus continuam em movimento até parar.'],
    type: 'finisher'
  },

  // ===== FUNCIONAL =====
  {
    id: 'functional_kettlebell_swing',
    name: 'Kettlebell Swing',
    thumbnail: '🔔 Kettlebell Swing',
    muscleGroup: 'functional',
    secondaryMuscles: ['glutes', 'legs', 'back'],
    equipment: 'Kettlebell',
    level: 'intermediate',
    executionSteps: [
      'Pés um pouco mais abertos que os ombros, kettlebell à frente no chão.',
      'Empurre o quadril para trás e segure o kettlebell com as duas mãos (ou uma).',
      'Balance o peso entre as pernas e estenda o quadril com força.',
      'Deixe o kettlebell subir até a linha do peito pela inércia.',
      'Receba o peso de volta dobrando o quadril e repita em ritmo contínuo.'
    ],
    postureTips: [
      'É uma dobradiça de quadril explosiva, não um agachamento.',
      'Os braços não levantam o peso: quem lança é o quadril.'
    ],
    breathing: 'Expire com força na extensão do quadril, inspire na descida.',
    commonErrors: ['Agachar em vez de dobrar o quadril.', 'Levantar o peso com os ombros.'],
    errorCorrections: ['Treine o stiff antes; o swing é o mesmo padrão com velocidade.'],
    variations: ['Swing Unilateral', 'Levantamento Terra Romeno'],
    substitutions: ['legs_terra_romeno', 'glutes_elevacao_pelvica'],
    safetyWarnings: ['Espaço livre à frente é obrigatório; nunca solte o kettlebell no alto.'],
    type: 'main'
  },
  {
    id: 'functional_escalador',
    name: 'Escalador (Mountain Climber)',
    thumbnail: '⛰️ Escalador',
    muscleGroup: 'functional',
    secondaryMuscles: ['abs', 'shoulders', 'legs'],
    equipment: 'Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Comece em posição de prancha alta, mãos sob os ombros.',
      'Traga um joelho em direção ao peito.',
      'Troque as pernas em movimento alternado e ritmado.',
      'Mantenha o quadril baixo e o core firme durante todo o exercício.'
    ],
    postureTips: [
      'Ombros sobre os punhos o tempo todo.',
      'Quadril na linha do corpo: nem empinado, nem caído.'
    ],
    breathing: 'Respiração ritmada acompanhando a troca de pernas.',
    commonErrors: ['Empinar o quadril para facilitar.', 'Quicar os ombros para trás a cada troca.'],
    errorCorrections: ['Diminua a velocidade até estabilizar a prancha, depois acelere.'],
    variations: ['Prancha', 'Burpee'],
    substitutions: ['abs_prancha_abdominal', 'cardio_pular_corda'],
    safetyWarnings: ['Punhos sensíveis? Faça com as mãos em halteres hexagonais.'],
    type: 'finisher'
  },
  {
    id: 'functional_farmer_walk',
    name: 'Caminhada do Fazendeiro (Farmer Walk)',
    thumbnail: '🧑‍🌾 Farmer Walk',
    muscleGroup: 'functional',
    secondaryMuscles: ['back', 'abs', 'legs'],
    equipment: 'Halteres ou Kettlebells',
    level: 'beginner',
    executionSteps: [
      'Segure um haltere pesado em cada mão ao lado do corpo.',
      'Fique ereto, ombros para trás e core contraído.',
      'Caminhe em linha reta com passos curtos e controlados.',
      'Complete a distância ou o tempo definido e apoie os pesos com segurança.'
    ],
    postureTips: [
      'Postura de "orgulho": peito aberto, olhar à frente.',
      'Não deixe o tronco inclinar para nenhum lado.'
    ],
    breathing: 'Respiração curta e constante, sem prender o ar por longos períodos.',
    commonErrors: ['Ombros enrolados para frente sob a carga.', 'Passos longos e apressados perdendo o controle.'],
    errorCorrections: ['Reduza a carga até conseguir caminhar perfeitamente ereto.'],
    variations: ['Farmer Walk Unilateral (Mala)', 'Encolhimento com Halteres'],
    substitutions: ['back_encolhimento_halteres', 'functional_kettlebell_swing'],
    safetyWarnings: ['Levante os pesos do chão com a técnica do terra, não com a lombar.'],
    type: 'finisher'
  },
  {
    id: 'functional_battle_rope',
    name: 'Corda Naval (Battle Rope)',
    thumbnail: '🌊 Corda Naval',
    muscleGroup: 'functional',
    secondaryMuscles: ['shoulders', 'abs', 'back'],
    equipment: 'Corda Naval',
    level: 'intermediate',
    executionSteps: [
      'Segure uma ponta da corda em cada mão, joelhos semiflexionados.',
      'Incline levemente o tronco à frente com o core firme.',
      'Crie ondas alternadas batendo os braços para cima e para baixo.',
      'Mantenha as ondas contínuas por 20 a 40 segundos.'
    ],
    postureTips: [
      'A base é meio agachada e estável: as pernas absorvem o movimento.',
      'Ondas rápidas e curtas valem mais que braçadas gigantes.'
    ],
    breathing: 'Respiração contínua; não prenda o ar durante as ondas.',
    commonErrors: ['Ficar de pernas retas balançando só os braços.', 'Perder o ritmo nas primeiras ondas por excesso de força.'],
    errorCorrections: ['Comece com intervalos curtos (15 a 20 segundos) e progrida o tempo.'],
    variations: ['Ondas Simultâneas', 'Slam na Corda'],
    substitutions: ['functional_kettlebell_swing', 'cardio_pular_corda'],
    safetyWarnings: ['Alta demanda cardiovascular: respeite os intervalos de descanso.'],
    type: 'finisher'
  },

  // ===== MOBILIDADE =====
  {
    id: 'mobility_alongamento_posterior',
    name: 'Alongamento de Posterior de Coxa',
    thumbnail: '🧘 Along. Posterior',
    muscleGroup: 'mobility',
    secondaryMuscles: ['legs'],
    equipment: 'Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Sente no chão com uma perna estendida e a outra dobrada.',
      'Com a coluna alongada, incline o tronco à frente sobre a perna estendida.',
      'Vá até sentir o alongamento atrás da coxa, sem dor.',
      'Mantenha por 20 a 30 segundos e troque de perna.'
    ],
    postureTips: [
      'Incline a partir do quadril, mantendo o peito aberto.',
      'Pé da perna estendida relaxado ou em flexão leve.'
    ],
    breathing: 'Respire fundo e solte o ar aprofundando levemente o alongamento.',
    commonErrors: ['Arredondar as costas para alcançar o pé.', 'Forçar até sentir dor.'],
    errorCorrections: ['Alcance menos e mantenha a coluna longa: o alvo é a coxa, não as costas.'],
    variations: ['Alongamento em Pé no Banco', 'Alongamento Deitado com Faixa'],
    substitutions: ['mobility_flexores_quadril', 'mobility_alongamento_quadriceps'],
    safetyWarnings: ['Alongue sem molejo (sem "pulsinhos") para não ativar o reflexo de contração.'],
    type: 'stretch'
  },
  {
    id: 'mobility_alongamento_quadriceps',
    name: 'Alongamento de Quadríceps em Pé',
    thumbnail: '🧘 Along. Quadríceps',
    muscleGroup: 'mobility',
    secondaryMuscles: ['legs'],
    equipment: 'Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Em pé, segure num apoio com uma das mãos para equilibrar.',
      'Dobre um joelho e segure o peito do pé atrás do corpo.',
      'Puxe o calcanhar em direção ao glúteo mantendo os joelhos próximos.',
      'Mantenha 20 a 30 segundos e troque de perna.'
    ],
    postureTips: [
      'Quadril encaixado (leve retroversão) intensifica o alongamento.',
      'Tronco ereto, sem inclinar à frente.'
    ],
    breathing: 'Respiração calma e profunda durante a posição.',
    commonErrors: ['Joelho apontando para fora.', 'Arquear a lombar puxando o pé com força.'],
    errorCorrections: ['Alinhe os joelhos lado a lado e contraia levemente o glúteo.'],
    variations: ['Alongamento de Quadríceps Deitado', 'Flexores de Quadril Ajoelhado'],
    substitutions: ['mobility_flexores_quadril', 'mobility_alongamento_posterior'],
    safetyWarnings: ['Problemas de equilíbrio? Faça deitado de lado.'],
    type: 'stretch'
  },
  {
    id: 'mobility_gato_coluna',
    name: 'Gato-Vaca (Mobilidade de Coluna)',
    thumbnail: '🐈 Gato-Vaca',
    muscleGroup: 'mobility',
    secondaryMuscles: ['back', 'abs'],
    equipment: 'Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Posicione-se em quatro apoios, mãos sob os ombros e joelhos sob o quadril.',
      'Arredonde a coluna para cima empurrando o chão, olhando para o umbigo (gato).',
      'Inverta arqueando a coluna para baixo e olhando à frente (vaca).',
      'Alterne devagar entre as duas posições por 8 a 12 ciclos.'
    ],
    postureTips: [
      'Movimente a coluna por inteiro, vértebra por vértebra.',
      'Sincronize o movimento com a respiração.'
    ],
    breathing: 'Expire ao arredondar (gato), inspire ao arquear (vaca).',
    commonErrors: ['Mover só o pescoço e o quadril.', 'Fazer rápido demais sem controle.'],
    errorCorrections: ['Deixe cada ciclo durar uma respiração completa.'],
    variations: ['Rotação Torácica em Quatro Apoios', 'Alongamento da Criança'],
    substitutions: ['mobility_flexores_quadril', 'mobility_alongamento_posterior'],
    safetyWarnings: ['Ótimo aquecimento de coluna antes de terra e agachamento.'],
    type: 'stretch'
  },
  {
    id: 'mobility_alongamento_peitoral',
    name: 'Alongamento Dinâmico de Peitoral',
    thumbnail: '🧘 Along. Peitoral',
    muscleGroup: 'mobility',
    secondaryMuscles: ['chest', 'shoulders'],
    equipment: 'Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Fique em pé com os braços estendidos à frente na altura dos ombros.',
      'Abra os braços para trás em arco, expandindo o peito.',
      'Retorne à frente e repita o movimento de forma controlada.',
      'Faça 10 a 15 aberturas aumentando a amplitude gradualmente.'
    ],
    postureTips: [
      'Ombros para baixo, longe das orelhas, durante as aberturas.',
      'Core firme para não arquear a lombar ao abrir.'
    ],
    breathing: 'Inspire ao abrir os braços, expire ao fechar.',
    commonErrors: ['Jogar os braços com violência para trás.', 'Compensar arqueando a lombar.'],
    errorCorrections: ['Amplitude progressiva: as primeiras repetições são menores.'],
    variations: ['Alongamento de Peitoral na Porta', 'Gato-Vaca'],
    substitutions: ['mobility_gato_coluna', 'shoulder_face_pull'],
    safetyWarnings: ['Ideal antes de treinos de peito e ombro.'],
    type: 'stretch'
  },
  {
    id: 'mobility_flexores_quadril',
    name: 'Alongamento de Flexores de Quadril (Ajoelhado)',
    thumbnail: '🧎 Flexores de Quadril',
    muscleGroup: 'mobility',
    secondaryMuscles: ['legs', 'glutes'],
    equipment: 'Peso Corporal',
    level: 'beginner',
    executionSteps: [
      'Ajoelhe com uma perna à frente, formando 90 graus nos dois joelhos.',
      'Encaixe o quadril (retroversão) e contraia o glúteo da perna de trás.',
      'Avance levemente o corpo até sentir alongar a frente do quadril.',
      'Mantenha 20 a 30 segundos e troque de perna.'
    ],
    postureTips: [
      'O segredo é a retroversão da pelve, não avançar muito o corpo.',
      'Tronco ereto, sem arquear a lombar.'
    ],
    breathing: 'Respire fundo, relaxando o quadril a cada expiração.',
    commonErrors: ['Arquear a lombar em vez de alongar o quadril.', 'Avançar demais o joelho da frente.'],
    errorCorrections: ['Contraia o glúteo de trás primeiro; o alongamento aparece quase sem avançar.'],
    variations: ['Alongamento de Quadríceps', 'Gato-Vaca'],
    substitutions: ['mobility_alongamento_quadriceps', 'mobility_gato_coluna'],
    safetyWarnings: ['Use um colchonete sob o joelho apoiado.'],
    type: 'stretch'
  }
];

// GOAL-09: toda a curadoria tem 2 imagens locais baixadas por scripts/import-exercises.mjs
// (validado pela suíte src/mock/exercises.test.ts). Exercícios sem pasta local ficam sem images.
const withLocalImages = (exercise: Exercise): Exercise => ({
  ...exercise,
  images: exercise.images ?? [
    `/assets/exercises/${exercise.id}/0.jpg`,
    `/assets/exercises/${exercise.id}/1.jpg`
  ]
});

export const MOCK_EXERCISES: Exercise[] = [...BASE_EXERCISES, ...EXPANSION_EXERCISES].map(withLocalImages);
