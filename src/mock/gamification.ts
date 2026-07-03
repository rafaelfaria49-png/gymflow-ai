import { Challenge, Achievement } from '../types';

export const MOCK_CHALLENGES: Challenge[] = [
  {
    id: 'chal_1',
    name: 'Foco Total: 7 Dias Consecutivos',
    durationDays: 7,
    xpReward: 300,
    description: 'Conclua pelo menos uma atividade física (treino, cardio ou mobilidade) por 7 dias seguidos.',
    progress: 57, // 4 de 7 dias
    completed: false,
    type: '7-days'
  },
  {
    id: 'chal_2',
    name: 'Guerreiro da Consistência: 14 Dias',
    durationDays: 14,
    xpReward: 750,
    description: 'Mantenha a rotina ativa por 14 dias treinando nos dias programados.',
    progress: 28,
    completed: false,
    type: '14-days'
  },
  {
    id: 'chal_3',
    name: 'Estilo de Vida GymFlow: 30 Dias',
    durationDays: 30,
    xpReward: 2000,
    description: 'Transforme seu corpo em 1 mês. Conclua seu cronograma de treinos planejado.',
    progress: 10,
    completed: false,
    type: '30-days'
  },
  {
    id: 'chal_4',
    name: 'Desafio Queimador de Calorias',
    durationDays: 7,
    xpReward: 400,
    description: 'Gaste um total acumulado de 3000 kcal em treinos e cardios cadastrados na semana.',
    progress: 80,
    completed: false,
    type: '7-days'
  },
  {
    id: 'chal_5',
    name: 'Força Bruta: Recorde no Supino',
    durationDays: 7,
    xpReward: 350,
    description: 'Gere um volume total de 5000kg levantados no Supino durante a semana.',
    progress: 40,
    completed: false,
    type: '7-days'
  },
  {
    id: 'chal_6',
    name: 'Mestre da Hidratação Semanal',
    durationDays: 7,
    xpReward: 250,
    description: 'Bata sua meta diária de água por 7 dias consecutivos.',
    progress: 71,
    completed: false,
    type: '7-days'
  },
  {
    id: 'chal_7',
    name: 'Fidelidade de Aço: 14 Dias de Dieta',
    durationDays: 14,
    xpReward: 600,
    description: 'Registre suas calorias e macros todos os dias por duas semanas.',
    progress: 50,
    completed: false,
    type: '14-days'
  },
  {
    id: 'chal_8',
    name: 'Explorador da Academia',
    durationDays: 14,
    xpReward: 500,
    description: 'Execute pelo menos 15 exercícios diferentes na biblioteca durante o desafio.',
    progress: 33,
    completed: false,
    type: '14-days'
  },
  {
    id: 'chal_9',
    name: 'Estudioso de Biomecânica',
    durationDays: 7,
    xpReward: 300,
    description: 'Assista e marque como aprendido 5 videoaulas técnicas da academia.',
    progress: 20,
    completed: false,
    type: '7-days'
  },
  {
    id: 'chal_10',
    name: 'Hábito Vitalício: 30 Dias de Streak',
    durationDays: 30,
    xpReward: 2500,
    description: 'Mantenha um streak ativo de visitas ao app e treinos por 30 dias seguidos.',
    progress: 16,
    completed: false,
    type: '30-days'
  }
];

export const MOCK_ACHIEVEMENTS: Achievement[] = [
  { id: 'ach_1', name: 'Primeiro Passo', description: 'Concluiu o primeiro treino no GymFlow AI.', icon: '🏆', unlocked: true, unlockedAt: '2026-05-24' },
  { id: 'ach_2', name: 'Monstro do Supino', description: 'Alcançou 100kg ou mais no Supino Reto.', icon: '⚡', unlocked: false },
  { id: 'ach_3', name: 'Consistência de Aço', description: 'Bateu 7 dias seguidos de streak.', icon: '🔥', unlocked: true, unlockedAt: '2026-05-26' },
  { id: 'ach_4', name: 'Hidratação Nível Elite', description: 'Bateu a meta de água por 5 dias consecutivos.', icon: '💧', unlocked: false },
  { id: 'ach_5', name: 'Membro Fundador', description: 'Cadastrou-se no aplicativo GymFlow AI.', icon: '🎖️', unlocked: true, unlockedAt: '2026-05-23' },
  { id: 'ach_6', name: 'IA Lover', description: 'Fez 10 interações de treino com o IA Coach.', icon: '🤖', unlocked: false },
  { id: 'ach_7', name: 'Rei do Leg Press', description: 'Empurrou mais de 200kg no Leg Press 45º.', icon: '🎢', unlocked: false },
  { id: 'ach_8', name: 'Glúteos de Aço', description: 'Alcançou 100kg na Elevação Pélvica.', icon: '🍑', unlocked: false },
  { id: 'ach_9', name: 'Poder de Tração', description: 'Executou 10 repetições perfeitas de Barra Fixa.', icon: '🧗', unlocked: false },
  { id: 'ach_10', name: 'Fidelidade Extrema', description: 'Bateu 14 dias seguidos de streak de treinos.', icon: '🛡️', unlocked: false },
  { id: 'ach_11', name: 'Erudito Fitness', description: 'Completou a Trilha de Agachamento inteira.', icon: '🎓', unlocked: false },
  { id: 'ach_12', name: 'Estilo de Vida Ativo', description: 'Acumulou 10 treinos registrados no histórico.', icon: '💪', unlocked: false },
  { id: 'ach_13', name: 'Sem Faltas', description: 'Concluiu a planilha semanal de 4 dias perfeitamente.', icon: '📅', unlocked: false },
  { id: 'ach_14', name: 'Dieta Regulada', description: 'Bateu a meta de proteínas por 3 dias seguidos.', icon: '🥩', unlocked: false },
  { id: 'ach_15', name: 'Influenciador', description: 'Compartilhou 5 treinos nas redes sociais simuladas.', icon: '📱', unlocked: false },
  { id: 'ach_16', name: 'Admin Helper', description: 'Criou e adicionou um exercício customizado à biblioteca.', icon: '🔧', unlocked: false },
  { id: 'ach_17', name: 'Sem Máquinas', description: 'Executou uma sessão inteira substituindo máquinas por halteres.', icon: '🏠', unlocked: false },
  { id: 'ach_18', name: 'Guerreiro de Ferro', description: 'Levantou um volume acumulado de 10.000kg num único treino.', icon: '⚓', unlocked: false },
  { id: 'ach_19', name: 'Cardio Lover', description: 'Queimou 500 kcal numa única corrida na esteira.', icon: '🏃', unlocked: false },
  { id: 'ach_20', name: 'Membro Elite', description: 'Assinou o plano GymFlow Elite e entrou no grupo VIP.', icon: '👑', unlocked: false }
];
