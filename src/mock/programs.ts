import { WorkoutProgram, WeeklyWorkoutDay } from '../types';

export const MOCK_PROGRAMS: WorkoutProgram[] = [
  // INICIANTE
  {
    id: 'prog_beg_1',
    name: 'Primeira Semana na Academia',
    durationWeeks: 1,
    frequencyDays: 3,
    level: 'beginner',
    objective: 'Adaptação neurológica e coordenação de aparelhos',
    description: 'Um programa introdutório focado na familiarização com as cargas e na execução postural dos aparelhos mais fáceis.',
    targetAudience: 'Unissex (Iniciantes)',
    contraindications: ['Hérnia de disco aguda sem orientação', 'Lesões no manguito rotador sem liberação'],
    exercises: [
      { exerciseId: 'chest_peck_deck', sets: 3, reps: '12-15', type: 'main' },
      { exerciseId: 'back_puxada_pulley', sets: 3, reps: '12-15', type: 'main' },
      { exerciseId: 'legs_cadeira_extensora', sets: 3, reps: '12-15', type: 'accessory' },
      { exerciseId: 'abs_prancha_abdominal', sets: 3, reps: '30s', type: 'finisher' }
    ]
  },
  {
    id: 'prog_beg_2',
    name: 'Full Body 3x por semana',
    durationWeeks: 4,
    frequencyDays: 3,
    level: 'beginner',
    objective: 'Condicionamento físico global',
    description: 'Ficha ideal para quem quer treinar o corpo inteiro 3 vezes na semana com intervalo de descanso completo de 48h entre sessões.',
    targetAudience: 'Unissex',
    contraindications: ['Cardiopatias graves sem liberação médica'],
    exercises: [
      { exerciseId: 'legs_leg_press', sets: 3, reps: '12', type: 'main' },
      { exerciseId: 'chest_supino_reto', sets: 3, reps: '10', type: 'main' },
      { exerciseId: 'back_remada_baixa', sets: 3, reps: '12', type: 'accessory' },
      { exerciseId: 'shoulder_elevecao_lateral', sets: 3, reps: '12', type: 'accessory' }
    ]
  },
  {
    id: 'prog_beg_3',
    name: 'Aprendendo Máquinas Guiadas',
    durationWeeks: 3,
    frequencyDays: 3,
    level: 'beginner',
    objective: 'Estabilização articular guiada',
    description: 'Treino exclusivo com aparelhos de trilhos mecânicos para diminuir o risco de lesão enquanto constrói força básica.',
    targetAudience: 'Unissex',
    contraindications: ['Dores agudas no joelho (evitar cadeira extensora pesada)'],
    exercises: [
      { exerciseId: 'chest_peck_deck', sets: 3, reps: '15', type: 'main' },
      { exerciseId: 'back_puxada_pulley', sets: 3, reps: '15', type: 'main' },
      { exerciseId: 'legs_cadeira_extensora', sets: 3, reps: '15', type: 'accessory' },
      { exerciseId: 'legs_mesa_flexora', sets: 3, reps: '15', type: 'accessory' }
    ]
  },
  {
    id: 'prog_beg_4',
    name: 'Emagrecimento Inicial',
    durationWeeks: 6,
    frequencyDays: 3,
    level: 'beginner',
    objective: 'Aceleração do gasto calórico basal',
    description: 'Combina musculação de alta repetição com curtos descansos e finalização em esteira para queima de gordura.',
    targetAudience: 'Unissex',
    contraindications: ['Hipertensão arterial descompensada'],
    exercises: [
      { exerciseId: 'legs_leg_press', sets: 3, reps: '15', type: 'main' },
      { exerciseId: 'chest_peck_deck', sets: 3, reps: '15', type: 'main' },
      { exerciseId: 'cardio_corrida_esteira', sets: 1, reps: '15min HIIT', type: 'finisher' }
    ]
  },
  {
    id: 'prog_beg_5',
    name: 'Ganho de Massa Inicial',
    durationWeeks: 6,
    frequencyDays: 3,
    level: 'beginner',
    objective: 'Hipertrofia miofibrilar básica',
    description: 'Foco em construir a base do tecido muscular com pesos livres leves e progressão lenta de cargas.',
    targetAudience: 'Unissex',
    contraindications: ['Limitações graves de punho/antebraço'],
    exercises: [
      { exerciseId: 'chest_supino_reto', sets: 3, reps: '10', type: 'main' },
      { exerciseId: 'back_remada_baixa', sets: 3, reps: '10', type: 'main' },
      { exerciseId: 'biceps_rosca_direta', sets: 3, reps: '12', type: 'accessory' }
    ]
  },

  // INTERMEDIÁRIO
  {
    id: 'prog_int_1',
    name: 'ABC Hipertrofia Masculino',
    durationWeeks: 8,
    frequencyDays: 5,
    level: 'intermediate',
    objective: 'Volume e hipertrofia de membros superiores e pernas',
    description: 'Divisão clássica focada em estética, proporção de ombros (deltoide lateral) e peitoral.',
    targetAudience: 'Masculino (Foco ombro/peito)',
    contraindications: ['Dores agudas no tendão patelar'],
    exercises: [
      { exerciseId: 'chest_supino_reto', sets: 4, reps: '8-10', type: 'main' },
      { exerciseId: 'chest_supino_inclinado_haltere', sets: 3, reps: '10', type: 'main' },
      { exerciseId: 'shoulder_desenvolvimento_haltere', sets: 3, reps: '10', type: 'main' },
      { exerciseId: 'triceps_testa', sets: 3, reps: '10', type: 'accessory' },
      { exerciseId: 'shoulder_elevecao_lateral', sets: 4, reps: '12', type: 'accessory' }
    ]
  },
  {
    id: 'prog_int_2',
    name: 'ABC Glúteo e Pernas Feminino',
    durationWeeks: 8,
    frequencyDays: 4,
    level: 'intermediate',
    objective: 'Hipertrofia de quadríceps, glúteos e posteriores',
    description: 'O programa favorito das mulheres. Foco máximo em elevação pélvica, stiff e agachamento profundo.',
    targetAudience: 'Feminino',
    contraindications: ['Dor patelofemoral aguda'],
    exercises: [
      { exerciseId: 'glutes_elevacao_pelvica', sets: 4, reps: '10-12', type: 'main' },
      { exerciseId: 'legs_agachamento_barra', sets: 4, reps: '8-10', type: 'main' },
      { exerciseId: 'legs_stiff', sets: 4, reps: '10', type: 'main' },
      { exerciseId: 'glutes_gluteo_cabo', sets: 3, reps: '12', type: 'accessory' }
    ]
  },
  {
    id: 'prog_int_3',
    name: 'Upper / Lower 4x na Semana',
    durationWeeks: 6,
    frequencyDays: 4,
    level: 'intermediate',
    objective: 'Hipertrofia geral distribuída',
    description: 'Divide os treinos em 2 dias de membros superiores e 2 dias de membros inferiores. Excelente equilíbrio entre estímulo e descanso.',
    targetAudience: 'Unissex',
    contraindications: ['Problemas crônicos de lombar sem liberação'],
    exercises: [
      { exerciseId: 'chest_supino_reto', sets: 4, reps: '8-10', type: 'main' },
      { exerciseId: 'back_remada_curvada', sets: 4, reps: '8-10', type: 'main' },
      { exerciseId: 'legs_leg_press', sets: 4, reps: '10-12', type: 'main' }
    ]
  },

  // AVANÇADO
  {
    id: 'prog_adv_1',
    name: 'Push Pull Legs 6x (Avançado)',
    durationWeeks: 12,
    frequencyDays: 6,
    level: 'advanced',
    objective: 'Volume máximo e densidade de fibra',
    description: 'Divisão clássica de fisiculturismo que divide o corpo em Empurrar, Puxar e Pernas. Alta frequência e alta intensidade.',
    targetAudience: 'Avançado / Atleta',
    contraindications: ['Sinais de overtraining ativo', 'Dores agudas no cotovelo/ombro'],
    exercises: [
      { exerciseId: 'chest_supino_reto', sets: 4, reps: '8-10', type: 'main' },
      { exerciseId: 'shoulder_desenvolvimento_haltere', sets: 3, reps: '10', type: 'main' },
      { exerciseId: 'back_barra_fixa', sets: 4, reps: '10', type: 'main' },
      { exerciseId: 'back_remada_curvada', sets: 4, reps: '8-10', type: 'main' },
      { exerciseId: 'legs_agachamento_barra', sets: 4, reps: '8-10', type: 'main' }
    ]
  },
  {
    id: 'prog_adv_2',
    name: 'Glúteo Avançado Feminino',
    durationWeeks: 8,
    frequencyDays: 5,
    level: 'advanced',
    objective: 'Construção extrema de volume no glúteo máximo e médio',
    description: 'Usa técnicas de alta tensão (Rest-Pause, Isometria no topo) em exercícios multiarticulares pesados.',
    targetAudience: 'Feminino',
    contraindications: ['Dores agudas no quadril e lombar'],
    exercises: [
      { exerciseId: 'glutes_elevacao_pelvica', sets: 5, reps: '8 + Rest-Pause', type: 'main' },
      { exerciseId: 'legs_agachamento_barra', sets: 4, reps: '8 (lento)', type: 'main' },
      { exerciseId: 'legs_stiff', sets: 4, reps: '8', type: 'main' },
      { exerciseId: 'glutes_gluteo_cabo', sets: 4, reps: '10 (isometria)', type: 'accessory' }
    ]
  },
  {
    id: 'prog_adv_3',
    name: 'Powerbuilding (Força + Estética)',
    durationWeeks: 10,
    frequencyDays: 4,
    level: 'advanced',
    objective: 'Aumento de carga nos grandes e densidade muscular',
    description: 'Mescla a força máxima do powerlifting com a rotina de isolamento do bodybuilding. Cargas pesadas nos compostos.',
    targetAudience: 'Unissex',
    contraindications: ['Hérnia discal lombar grave'],
    exercises: [
      { exerciseId: 'legs_agachamento_barra', sets: 5, reps: '5', type: 'main' },
      { exerciseId: 'chest_supino_reto', sets: 5, reps: '5', type: 'main' },
      { exerciseId: 'back_remada_curvada', sets: 4, reps: '6-8', type: 'main' }
    ]
  },

  // ATLETA
  {
    id: 'prog_atl_1',
    name: 'Força Máxima de Powerlifting',
    durationWeeks: 12,
    frequencyDays: 4,
    level: 'athlete',
    objective: 'Alcançar 1 Repetição Máxima nos 3 Grandes',
    description: 'Rotina de altíssima intensidade neural, baixo volume de repetições e alto tempo de descanso (3-5 min).',
    targetAudience: 'Atletas de Força',
    contraindications: ['Tendinopatias crônicas', 'Histórico de rompimento ligamentar recente'],
    exercises: [
      { exerciseId: 'legs_agachamento_barra', sets: 5, reps: '3', type: 'main' },
      { exerciseId: 'chest_supino_reto', sets: 5, reps: '3', type: 'main' },
      { exerciseId: 'legs_stiff', sets: 4, reps: '5', type: 'main' }
    ]
  }
];

// 8 Templates Semanais (Weekly split templates)
export const MOCK_WEEKLY_TEMPLATES = [
  {
    name: 'Feminino - Pernas & Glúteos',
    profile: 'female',
    goal: 'hypertrophy',
    days: [
      { dayName: 'Segunda', workoutName: 'Quadríceps + Glúteo Foco', muscleGroups: ['legs', 'glutes'], duration: 65, exerciseCount: 5, isRest: false },
      { dayName: 'Terça', workoutName: 'Superiores Leve + Abdômen', muscleGroups: ['chest', 'back', 'abs'], duration: 45, exerciseCount: 4, isRest: false },
      { dayName: 'Quarta', workoutName: 'Descanso Ativo / Mobilidade', muscleGroups: ['mobility'], duration: 30, exerciseCount: 2, isRest: true },
      { dayName: 'Quinta', workoutName: 'Posteriores de Coxa + Glúteo', muscleGroups: ['legs', 'glutes'], duration: 60, exerciseCount: 5, isRest: false },
      { dayName: 'Sexta', workoutName: 'Ombro + Costas + Braços', muscleGroups: ['shoulders', 'back', 'biceps'], duration: 50, exerciseCount: 4, isRest: false },
      { dayName: 'Sábado', workoutName: 'Glúteo Foco Máximo (Isoladores)', muscleGroups: ['glutes'], duration: 55, exerciseCount: 4, isRest: false },
      { dayName: 'Domingo', workoutName: 'Descanso e Regeneração', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true }
    ]
  },
  {
    name: 'Masculino - ABCDE Hipertrofia',
    profile: 'male',
    goal: 'hypertrophy',
    days: [
      { dayName: 'Segunda', workoutName: 'Peito + Tríceps', muscleGroups: ['chest', 'triceps'], duration: 60, exerciseCount: 5, isRest: false },
      { dayName: 'Terça', workoutName: 'Costas + Bíceps', muscleGroups: ['back', 'biceps'], duration: 60, exerciseCount: 5, isRest: false },
      { dayName: 'Quarta', workoutName: 'Descanso / Alongamento', muscleGroups: ['mobility'], duration: 25, exerciseCount: 2, isRest: true },
      { dayName: 'Quinta', workoutName: 'Pernas Completas', muscleGroups: ['legs', 'glutes', 'calves'], duration: 70, exerciseCount: 6, isRest: false },
      { dayName: 'Sexta', workoutName: 'Ombros + Abdômen', muscleGroups: ['shoulders', 'abs'], duration: 50, exerciseCount: 4, isRest: false },
      { dayName: 'Sábado', workoutName: 'Bíceps + Tríceps (Pump)', muscleGroups: ['biceps', 'triceps'], duration: 45, exerciseCount: 4, isRest: false },
      { dayName: 'Domingo', workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true }
    ]
  },
  {
    name: 'Unissex - Full Body 3x',
    profile: 'neutral',
    goal: 'conditioning',
    days: [
      { dayName: 'Segunda', workoutName: 'FullBody Estimulação A', muscleGroups: ['legs', 'chest', 'back'], duration: 50, exerciseCount: 5, isRest: false },
      { dayName: 'Terça', workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true },
      { dayName: 'Quarta', workoutName: 'FullBody Estimulação B', muscleGroups: ['legs', 'shoulders', 'abs'], duration: 50, exerciseCount: 5, isRest: false },
      { dayName: 'Quinta', workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true },
      { dayName: 'Sexta', workoutName: 'FullBody Estimulação C', muscleGroups: ['glutes', 'back', 'biceps'], duration: 55, exerciseCount: 5, isRest: false },
      { dayName: 'Sábado', workoutName: 'Cardio Leve Contínuo', muscleGroups: ['cardio'], duration: 40, exerciseCount: 1, isRest: false },
      { dayName: 'Domingo', workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true }
    ]
  },
  {
    name: 'Feminino - Emagrecimento HIIT',
    profile: 'female',
    goal: 'slimming',
    days: [
      { dayName: 'Segunda', workoutName: 'Cardio HIIT + Pernas Foco', muscleGroups: ['cardio', 'legs'], duration: 55, exerciseCount: 5, isRest: false },
      { dayName: 'Terça', workoutName: 'Superior Express + Abs', muscleGroups: ['chest', 'back', 'abs'], duration: 40, exerciseCount: 4, isRest: false },
      { dayName: 'Quarta', workoutName: 'Corrida na Esteira HIIT', muscleGroups: ['cardio'], duration: 30, exerciseCount: 1, isRest: false },
      { dayName: 'Quinta', workoutName: 'Glúteos e Posteriores HIIT', muscleGroups: ['glutes', 'legs'], duration: 50, exerciseCount: 5, isRest: false },
      { dayName: 'Sexta', workoutName: 'Cardio Funcional Corda', muscleGroups: ['functional'], duration: 45, exerciseCount: 3, isRest: false },
      { dayName: 'Sábado', workoutName: 'Descanso Ativo', muscleGroups: ['mobility'], duration: 30, exerciseCount: 2, isRest: true },
      { dayName: 'Domingo', workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true }
    ]
  },
  {
    name: 'Masculino - Powerbuilding Força',
    profile: 'male',
    goal: 'strength',
    days: [
      { dayName: 'Segunda', workoutName: 'Agachamento Dia Pesado', muscleGroups: ['legs'], duration: 65, exerciseCount: 4, isRest: false },
      { dayName: 'Terça', workoutName: 'Supino Dia Pesado', muscleGroups: ['chest', 'triceps'], duration: 60, exerciseCount: 4, isRest: false },
      { dayName: 'Quarta', workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true },
      { dayName: 'Quinta',
        workoutName: 'Levantamento Terra RDL Dia', muscleGroups: ['back', 'legs'], duration: 65, exerciseCount: 4, isRest: false },
      { dayName: 'Sexta', workoutName: 'Membro Superior Volume', muscleGroups: ['shoulders', 'biceps', 'back'], duration: 55, exerciseCount: 5, isRest: false },
      { dayName: 'Sábado', workoutName: 'Descanso e Regeneração', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true },
      { dayName: 'Domingo', workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true }
    ]
  },
  {
    name: 'Unissex - Condicionamento GPP',
    profile: 'neutral',
    goal: 'conditioning',
    days: [
      { dayName: 'Segunda', workoutName: 'Funcional Kettlebell Circuit', muscleGroups: ['functional', 'legs'], duration: 50, exerciseCount: 4, isRest: false },
      { dayName: 'Terça', workoutName: 'Corrida Esteira HIIT', muscleGroups: ['cardio'], duration: 40, exerciseCount: 1, isRest: false },
      { dayName: 'Quarta', workoutName: 'Mobilidade Quadril / Ombros', muscleGroups: ['mobility'], duration: 35, exerciseCount: 3, isRest: false },
      { dayName: 'Quinta', workoutName: 'Funcional Pull-ups e Core', muscleGroups: ['back', 'abs'], duration: 45, exerciseCount: 4, isRest: false },
      { dayName: 'Sexta', workoutName: 'Circuito Queimador Total', muscleGroups: ['functional', 'cardio'], duration: 50, exerciseCount: 5, isRest: false },
      { dayName: 'Sábado', workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true },
      { dayName: 'Domingo', workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true }
    ]
  },
  {
    name: 'Feminino - Glúteos Avançado 5x',
    profile: 'female',
    goal: 'athlete',
    days: [
      { dayName: 'Segunda', workoutName: 'Agachamento + Pelvica Força', muscleGroups: ['legs', 'glutes'], duration: 70, exerciseCount: 5, isRest: false },
      { dayName: 'Terça', workoutName: 'Posteriores + Glúteo Isolamento', muscleGroups: ['legs', 'glutes'], duration: 60, exerciseCount: 5, isRest: false },
      { dayName: 'Quarta', workoutName: 'Superiores Hipertrofia Foco', muscleGroups: ['back', 'shoulders'], duration: 45, exerciseCount: 4, isRest: false },
      { dayName: 'Quinta', workoutName: 'Glúteo Pélvica Rest-Pause', muscleGroups: ['glutes'], duration: 60, exerciseCount: 4, isRest: false },
      { dayName: 'Sexta', workoutName: 'Pernas Completas Hack', muscleGroups: ['legs', 'glutes'], duration: 65, exerciseCount: 5, isRest: false },
      { dayName: 'Sábado', workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true },
      { dayName: 'Domingo', workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true }
    ]
  },
  {
    name: 'Masculino - PPL 6x Hipertrofia',
    profile: 'male',
    goal: 'athlete',
    days: [
      { dayName: 'Segunda', workoutName: 'Push A (Peito/Ombro/Tríceps)', muscleGroups: ['chest', 'shoulders', 'triceps'], duration: 65, exerciseCount: 5, isRest: false },
      { dayName: 'Terça', workoutName: 'Pull A (Costas/Deltoide/Bíceps)', muscleGroups: ['back', 'shoulders', 'biceps'], duration: 65, exerciseCount: 5, isRest: false },
      { dayName: 'Quarta', workoutName: 'Legs A (Perna Foco Quadríceps)', muscleGroups: ['legs', 'calves'], duration: 70, exerciseCount: 6, isRest: false },
      { dayName: 'Quinta', workoutName: 'Push B (Supino/Elevação)', muscleGroups: ['chest', 'shoulders', 'triceps'], duration: 60, exerciseCount: 5, isRest: false },
      { dayName: 'Sexta', workoutName: 'Pull B (Remada/Rosca)', muscleGroups: ['back', 'shoulders', 'biceps'], duration: 60, exerciseCount: 5, isRest: false },
      { dayName: 'Sábado', workoutName: 'Legs B (Perna Foco Posterior)', muscleGroups: ['legs', 'glutes'], duration: 65, exerciseCount: 5, isRest: false },
      { dayName: 'Domingo', workoutName: 'Descanso', muscleGroups: [], duration: 0, exerciseCount: 0, isRest: true }
    ]
  }
];
