import { Exercise } from '../types';

export const MOCK_EXERCISES: Exercise[] = [
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
    substitutions: ['chest_supino_haltere', 'chest_supino_maquina', 'extra_chest_flexao'],
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
    substitutions: ['chest_peck_deck', 'extra_chest_crossover_baixo'],
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
    substitutions: ['chest_crucifixo_polia', 'extra_chest_fly_haltere'],
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
    substitutions: ['triceps_mergulho_banco', 'chest_supino_declinado'],
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
    substitutions: ['back_puxada_pulley', 'extra_back_puxada_pulley_neutra'],
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
    substitutions: ['back_barra_fixa', 'extra_back_puxada_articulada'],
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
    substitutions: ['back_remada_baixa', 'extra_back_serrote'],
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
    substitutions: ['back_remada_curvada', 'extra_back_serrote'],
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
    substitutions: ['extra_shoulder_desenvolvimento_maquina', 'extra_shoulder_desenvolvimento_barra'],
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
    substitutions: ['extra_shoulder_elevecao_lateral_cabo', 'extra_shoulder_remada_alta'],
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
    substitutions: ['extra_shoulder_face_pull', 'extra_shoulder_peck_deck_invertido'],
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
    substitutions: ['biceps_rosca_martelo', 'extra_biceps_rosca_scott'],
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
    substitutions: ['biceps_rosca_direta', 'extra_biceps_rosca_martelo_cabo'],
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
    substitutions: ['triceps_testa', 'extra_triceps_coice'],
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
    substitutions: ['triceps_polia_corda', 'extra_triceps_frances_haltere'],
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
    substitutions: ['legs_leg_press', 'extra_legs_hack_machine', 'extra_legs_goblet_squat'],
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
    substitutions: ['legs_agachamento_barra', 'extra_legs_hack_machine', 'extra_legs_goblet_squat'],
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
    substitutions: ['extra_legs_afundo', 'legs_leg_press'],
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
    substitutions: ['legs_stiff', 'extra_legs_cadeira_flexora'],
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
    substitutions: ['legs_mesa_flexora', 'extra_legs_cadeira_flexora'],
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
    substitutions: ['extra_glutes_sumo_squat', 'extra_glutes_passada'],
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
    substitutions: ['glutes_elevacao_pelvica', 'extra_glutes_coice_quatro_apoios'],
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
    substitutions: ['extra_abs_1', 'extra_abs_13'],
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
    substitutions: ['extra_cardio_2', 'extra_cardio_14'],
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

// PROGRAMMATIC EXTRA EXERCISES GENERATION (to guarantee 85+ total exercises)
const MUSCLE_GROUPS: ('chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'glutes' | 'abs' | 'calves' | 'cardio' | 'mobility' | 'functional')[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'abs', 'calves', 'cardio', 'mobility', 'functional'
];

const EQUIP_PRESETS = [
  { name: 'Halteres', type: 'accessory' },
  { name: 'Barra', type: 'main' },
  { name: 'Polia', type: 'accessory' },
  { name: 'Máquina', type: 'main' },
  { name: 'Peso Corporal', type: 'accessory' },
  { name: 'Kettlebell', type: 'main' }
];

// Let's generate up to 85 exercises (18 static + 67 generated)
for (let i = 1; i <= 68; i++) {
  const muscle = MUSCLE_GROUPS[i % MUSCLE_GROUPS.length];
  const eqPreset = EQUIP_PRESETS[i % EQUIP_PRESETS.length];
  const id = `extra_${muscle}_${i}`;

  MOCK_EXERCISES.push({
    id,
    name: `Exercício Extra ${muscle.toUpperCase()} #${i} (${eqPreset.name})`,
    thumbnail: `💪 Ex ${muscle} ${i}`,
    muscleGroup: muscle,
    equipment: eqPreset.name,
    level: i % 4 === 0 ? 'beginner' : i % 4 === 1 ? 'intermediate' : i % 4 === 2 ? 'advanced' : 'athlete',
    executionSteps: [
      `Posicione o equipamento: ${eqPreset.name}.`,
      `Alinhe a coluna e trave o abdômen.`,
      `Execute o movimento mantendo a articulação do ombro estável.`,
      `Segure a contração por 1 segundo na fase concêntrica.`,
      `Retorne à posição inicial resistindo de forma controlada.`
    ],
    postureTips: [
      `Mantenha os calcanhares fixos se for em pé.`,
      `Não use impulsos da coluna para levantar a carga.`
    ],
    breathing: 'Expire no esforço, inspire no retorno.',
    commonErrors: [`Balançar o corpo.`, `Realizar amplitude incompleta.`],
    errorCorrections: [`Diminua a carga para garantir a execução correta.`],
    variations: [`Variação unilateral com ${eqPreset.name}`],
    substitutions: [`extra_${muscle}_${i > 5 ? i - 3 : i + 3}`], // Substitutos dinâmicos simples para teste
    safetyWarnings: [`Use travas e treine com segurança.`],
    type: eqPreset.type as any
  });
}
