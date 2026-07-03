import { CommunityPost } from '../types';

export const MOCK_COMMUNITY: CommunityPost[] = [
  {
    id: 'post_1',
    authorName: 'Gabriel Medeiros',
    authorAvatar: '👨‍🚀',
    time: 'Há 10 minutos',
    content: 'Treino de pernas finalizado! Agachamento livre com 120kg hoje. A evolução é lenta, mas é constante. Foco no processo! 🔥💪 #GymFlow #LegDay #Evolução',
    image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=600&auto=format&fit=crop',
    likes: 24,
    comments: [
      { id: 'c_1', authorName: 'Jessica Alencar', authorAvatar: '👩‍🎤', content: 'Bela carga! Inspiração pura!', time: 'Há 5 minutos' },
      { id: 'c_2', authorName: 'Thiago Costa', authorAvatar: '👨‍💻', content: 'Próxima semana é 130kg hein?! Mandou muito.', time: 'Há 2 minutos' }
    ],
    userLiked: false,
    shares: 2
  },
  {
    id: 'post_2',
    authorName: 'Beatriz Vasconcelos',
    authorAvatar: '🧘‍♀️',
    time: 'Há 2 horas',
    content: 'Aula de mobilidade de quadril concluída com o Dr. Rodrigo no app GymFlow. Minha postura no agachamento melhorou demais nas últimas semanas, recomendo muito esse vídeo educativo!',
    likes: 18,
    comments: [
      { id: 'c_3', authorName: 'Patricia Gomes', authorAvatar: '👩‍⚕️', content: 'Qual vídeo você assistiu? Também estou precisando.', time: 'Há 1 hora' },
      { id: 'c_4', authorName: 'Beatriz Vasconcelos', authorAvatar: '🧘‍♀️', content: 'Chama "Levantamento Terra RDL (Stiff) Sem Dor na Lombar" no app!', time: 'Há 45 minutos' }
    ],
    userLiked: true,
    shares: 0
  },
  {
    id: 'post_3',
    authorName: 'Carlos Eduardo (Cadu)',
    authorAvatar: '🦁',
    time: 'Há 1 dia',
    content: 'Novo Recorde Pessoal (PR) batido no Levantamento Terra! 160kg para 3 reps. O IA Coach sugeriu a progressão hoje e deu super certo. Sentindo-me imparável!',
    image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=600&auto=format&fit=crop',
    likes: 56,
    comments: [],
    userLiked: false,
    shares: 8
  },
  {
    id: 'post_4',
    authorName: 'Jéssica Alencar',
    authorAvatar: '👩‍🎤',
    time: 'Há 2 dias',
    content: 'Hoje fiz o treino "ABC Glúteo e Pernas Feminino". A elevação pélvica rest-pause foi insana! Quem aí treinou hoje? 🍑🏋️‍♀️',
    likes: 38,
    comments: [
      { id: 'c_5', authorName: 'Beatriz Vasconcelos', authorAvatar: '🧘‍♀️', content: 'Eu fiz inferiores hoje também, a perna tá bamba!', time: 'Há 1 dia' }
    ],
    userLiked: false,
    shares: 1
  },
  {
    id: 'post_5',
    authorName: 'Rodrigo Faro',
    authorAvatar: '🥇',
    time: 'Há 3 dias',
    content: 'Bati 18 dias de streak seguidos no app! Consistência é a única chave para o sucesso. Bora quebrar tudo!',
    likes: 42,
    comments: [],
    userLiked: false,
    shares: 4
  },
  {
    id: 'post_6',
    authorName: 'Patrícia Gomes',
    authorAvatar: '👩‍⚕️',
    time: 'Há 4 dias',
    content: 'Dica de ouro: bebam água! Hoje bati minha meta de 3L logo às 17h. O corpo agradece na hora do treino.',
    likes: 19,
    comments: [],
    userLiked: false,
    shares: 0
  },
  {
    id: 'post_7',
    authorName: 'Thiago Costa',
    authorAvatar: '👨‍💻',
    time: 'Há 5 dias',
    content: 'Troquei o supino máquina por supino com halteres hoje devido à academia cheia e foi ótimo. Sentimento de dever cumprido.',
    likes: 15,
    comments: [],
    userLiked: false,
    shares: 1
  },
  {
    id: 'post_8',
    authorName: 'Felipe Neves',
    authorAvatar: '🏋️',
    time: 'Há 6 dias',
    content: 'Parabéns a todos os alunos que completaram seus desafios de 7 dias nesta semana. Orgulho do time GymFlow AI!',
    likes: 67,
    comments: [],
    userLiked: false,
    shares: 12
  },
  {
    id: 'post_9',
    authorName: 'Mariana Rios',
    authorAvatar: '🏃‍♀️',
    time: 'Há 1 semana',
    content: 'Alongamento dinâmico antes do agachamento salva joelhos. Façam a rotina de mobilidade que postamos nas aulas!',
    likes: 49,
    comments: [],
    userLiked: false,
    shares: 5
  },
  {
    id: 'post_10',
    authorName: 'Lucas Martins',
    authorAvatar: '🧠',
    time: 'Há 1 semana',
    content: 'Sejam bem-vindos ao feed! Aqui compartilhamos nossas PRs, treinos e nos apoiamos rumo aos objetivos. TMJ!',
    likes: 80,
    comments: [
      { id: 'c_6', authorName: 'Rodrigo Faro', authorAvatar: '🥇', content: 'Tamo junto, mestre!', time: 'Há 1 semana' }
    ],
    userLiked: false,
    shares: 7
  }
];
