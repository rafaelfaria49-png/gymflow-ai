import { VideoLesson, TechniqueTrail } from '../types';

export const MOCK_VIDEOS: VideoLesson[] = [
  // Aulas de Agachamento (Trail: Agachamento)
  {
    id: 'vid_agachamento_1',
    title: 'Bases e Posicionamento do Agachamento',
    thumbnail: '🎬 Agachamento Base',
    duration: '4:20',
    instructor: 'Lucas Martins (Mestre em Fisiologia)',
    level: 'beginner',
    category: 'posture',
    tags: ['agachamento', 'pernas', 'postura'],
    checklist: ['Pés na largura dos ombros', 'Pontas levemente para fora', 'Peito aberto e lombar firme'],
    errorsToAvoid: ['Tirar calcanhar do chão', 'Entrar os joelhos'],
    learned: false,
    progressPercent: 0,
    trailId: 'trail_agachamento'
  },
  {
    id: 'vid_agachamento_2',
    title: 'Como Corrigir o Valgo Dinâmico',
    thumbnail: '🎬 Valgo Dinâmico',
    duration: '5:15',
    instructor: 'Lucas Martins (Mestre em Fisiologia)',
    level: 'intermediate',
    category: 'injury-prevention',
    tags: ['joelhos', 'valgo', 'correção'],
    checklist: ['Forçar joelhos para fora na subida', 'Ativar glúteos médio e mínimo'],
    errorsToAvoid: ['Deixar joelhos cederem para dentro'],
    learned: false,
    progressPercent: 0,
    trailId: 'trail_agachamento'
  },
  {
    id: 'vid_agachamento_3',
    title: 'Mobilidade de Tornozelo para Agachar Mais Fundo',
    thumbnail: '🎬 Tornozelo Mobilidade',
    duration: '6:30',
    instructor: 'Dr. Rodrigo Mendes (Fisioterapeuta)',
    level: 'beginner',
    category: 'mobility',
    tags: ['tornozelo', 'mobilidade', 'flexibilidade'],
    checklist: ['Alongar tendão de Aquiles', 'Avançar joelhos sem tirar calcanhar'],
    errorsToAvoid: ['Ignorar rigidez no tornozelo'],
    learned: false,
    progressPercent: 0,
    trailId: 'trail_agachamento'
  },

  // Aulas de Supino (Trail: Supino)
  {
    id: 'vid_supino_1',
    title: 'Retração de Escápulas no Supino Reto',
    thumbnail: '🎬 Supino Escápulas',
    duration: '4:55',
    instructor: 'Juliana Silva (Especialista Biomecânica)',
    level: 'beginner',
    category: 'technique',
    tags: ['supino', 'escapulas', 'peito'],
    checklist: ['Aproximar escápulas e prender atrás', 'Manter ombros longe da orelha'],
    errorsToAvoid: ['Fazer supino com ombros soltos para frente'],
    learned: false,
    progressPercent: 0,
    trailId: 'trail_supino'
  },
  {
    id: 'vid_supino_2',
    title: 'Entendendo a Trajetória da Barra',
    thumbnail: '🎬 Caminho da Barra',
    duration: '3:45',
    instructor: 'Juliana Silva (Especialista Biomecânica)',
    level: 'intermediate',
    category: 'technique',
    tags: ['barra', 'supino', 'trajetoria'],
    checklist: ['Descer a barra no peito médio', 'Subir em leve curva para trás'],
    errorsToAvoid: ['Descer reto demais na garganta'],
    learned: false,
    progressPercent: 0,
    trailId: 'trail_supino'
  },
  {
    id: 'vid_supino_3',
    title: 'Leg Drive: Usando as Pernas para Empurrar Carga',
    thumbnail: '🎬 Leg Drive Aula',
    duration: '5:10',
    instructor: 'Juliana Silva',
    level: 'advanced',
    category: 'technique',
    tags: ['legdrive', 'força', 'supino'],
    checklist: ['Empurrar calcanhares contra o chão', 'Tensionar coxas e glúteos'],
    errorsToAvoid: ['Tirar os glúteos do banco'],
    learned: false,
    progressPercent: 0,
    trailId: 'trail_supino'
  },

  // Aulas de Remada (Trail: Remada)
  {
    id: 'vid_remada_1',
    title: 'Ângulo de Inclinação na Remada Curvada',
    thumbnail: '🎬 Remada Inclinação',
    duration: '4:12',
    instructor: 'Felipe Neves (Personal Trainer)',
    level: 'intermediate',
    category: 'posture',
    tags: ['remada', 'costas', 'postura'],
    checklist: ['Tronco inclinado a 45 graus', 'Coluna lombar neutra e travada'],
    errorsToAvoid: ['Ficar muito em pé', 'Arredondar a coluna'],
    learned: false,
    progressPercent: 0,
    trailId: 'trail_remada'
  },
  {
    id: 'vid_remada_2',
    title: 'Conexão Mente-Músculo nas Costas',
    thumbnail: '🎬 Costas Conexão',
    duration: '5:02',
    instructor: 'Felipe Neves',
    level: 'beginner',
    category: 'technique',
    tags: ['costas', 'dorsal', 'mente'],
    checklist: ['Puxar com os cotovelos', 'Imaginar as mãos como ganchos'],
    errorsToAvoid: ['Fazer toda a força com o bíceps'],
    learned: false,
    progressPercent: 0,
    trailId: 'trail_remada'
  },

  // Aulas de Levantamento Terra (Trail: Levantamento Terra)
  {
    id: 'vid_terra_1',
    title: 'Posicionamento Inicial no Levantamento Terra',
    thumbnail: '🎬 Terra Setup',
    duration: '6:10',
    instructor: 'Dr. Rodrigo Mendes',
    level: 'intermediate',
    category: 'posture',
    tags: ['terra', 'deadlift', 'postura'],
    checklist: ['Barra no meio do pé', 'Canelas tocando a barra', 'Ombros ligeiramente à frente'],
    errorsToAvoid: ['Barra muito longe das pernas'],
    learned: false,
    progressPercent: 0,
    trailId: 'trail_terra'
  },
  {
    id: 'vid_terra_2',
    title: 'Stiff (RDL) Biomecânica Perfeita',
    thumbnail: '🎬 Stiff Biomecânica',
    duration: '5:50',
    instructor: 'Dr. Rodrigo Mendes',
    level: 'intermediate',
    category: 'injury-prevention',
    tags: ['stiff', 'posterior', 'biomecânica'],
    checklist: ['Empurrar quadril para trás', 'Manter barra colada nas coxas'],
    errorsToAvoid: ['Curvar a lombar', 'Dobrar muito o joelho'],
    learned: false,
    progressPercent: 0,
    trailId: 'trail_terra'
  }
];

// PROGRAMMATIC VIDEO LESSON GENERATION (to guarantee 42+ total videos)
const VIDEO_CATEGORIES: ('posture' | 'technique' | 'machines' | 'warmup' | 'mobility' | 'injury-prevention')[] = [
  'posture', 'technique', 'machines', 'warmup', 'mobility', 'injury-prevention'
];

const VIDEO_LEVELS: ('beginner' | 'intermediate' | 'advanced' | 'all')[] = [
  'beginner', 'intermediate', 'advanced', 'all'
];

const INSTRUCTORS = ['Lucas Martins', 'Juliana Silva', 'Dr. Rodrigo Mendes', 'Felipe Neves', 'Mariana Rios'];

// Generate up to 42 videos (10 static + 32 generated)
for (let i = 1; i <= 32; i++) {
  const cat = VIDEO_CATEGORIES[i % VIDEO_CATEGORIES.length];
  const lvl = VIDEO_LEVELS[i % VIDEO_LEVELS.length];
  const inst = INSTRUCTORS[i % INSTRUCTORS.length];
  const id = `extra_vid_${cat}_${i}`;

  MOCK_VIDEOS.push({
    id,
    title: `Aula Técnica de ${cat.toUpperCase()} #${i} com ${inst}`,
    thumbnail: `🎬 Vídeo ${cat} ${i}`,
    duration: `${3 + (i % 6)}:${10 + (i % 45)}`,
    instructor: `${inst} (Especialista GymFlow)`,
    level: lvl,
    category: cat,
    tags: [cat, 'técnica', 'instruções'],
    checklist: [
      'Alinhe a articulação principal',
      'Contraia o abdômen antes de mover o peso',
      'Mantenha cadência lenta na descida'
    ],
    errorsToAvoid: ['Realizar movimentos rápidos', 'Usar peso excessivo'],
    learned: false,
    progressPercent: 0,
    trailId: i % 4 === 0 ? 'trail_iniciante' : i % 4 === 1 ? 'trail_legpress' : i % 4 === 2 ? 'trail_pelvica' : 'trail_respiracao'
  });
}

// 8 Trilhas de Técnica
export const MOCK_TRAILS: TechniqueTrail[] = [
  {
    id: 'trail_agachamento',
    name: 'Aprenda Agachamento',
    description: 'Do iniciante ao agachamento com barra profunda. Domine a mobilidade e o alinhamento do joelho.',
    videoIds: ['vid_agachamento_1', 'vid_agachamento_2', 'vid_agachamento_3'],
    level: 'all'
  },
  {
    id: 'trail_supino',
    name: 'Aprenda Supino',
    description: 'Maximize o recrutamento do peito e proteja seus ombros usando Leg Drive e retração escapular.',
    videoIds: ['vid_supino_1', 'vid_supino_2', 'vid_supino_3'],
    level: 'intermediate'
  },
  {
    id: 'trail_remada',
    name: 'Aprenda Remada',
    description: 'Desenvolva dorsais densas sem sobrecarregar a coluna com a inclinação correta do tronco.',
    videoIds: ['vid_remada_1', 'vid_remada_2'],
    level: 'beginner'
  },
  {
    id: 'trail_terra',
    name: 'Aprenda Levantamento Terra',
    description: 'Descubra a postura perfeita de saída e a técnica do Stiff RDL para glúteos e posteriores.',
    videoIds: ['vid_terra_1', 'vid_terra_2'],
    level: 'intermediate'
  },
  {
    id: 'trail_legpress',
    name: 'Aprenda Leg Press',
    description: 'Como posicionar os pés na plataforma para isolar quadríceps, glúteos ou adutores com segurança.',
    videoIds: ['extra_vid_machines_1', 'extra_vid_machines_5'],
    level: 'beginner'
  },
  {
    id: 'trail_pelvica',
    name: 'Aprenda Elevação Pélvica',
    description: 'A técnica definitiva para construir glúteos fortes. Alinhamento de joelho, pescoço e pelve.',
    videoIds: ['extra_vid_technique_2', 'extra_vid_technique_6'],
    level: 'intermediate'
  },
  {
    id: 'trail_iniciante',
    name: 'Guia do Iniciante na Academia',
    description: 'Regras de ouro de etiqueta da academia, como ajustar polias, bancos e aparelhos guiados.',
    videoIds: ['extra_vid_machines_4', 'extra_vid_posture_4', 'extra_vid_warmup_4'],
    level: 'beginner'
  },
  {
    id: 'trail_respiracao',
    name: 'Respiração e Mobilidade',
    description: 'Técnicas de respiração diafragmática sob pressão lombar e aquecimentos dinâmicos articulares.',
    videoIds: ['extra_vid_technique_3', 'extra_vid_mobility_3'],
    level: 'all'
  }
];
