'use client';

import React, { useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { SocialShareModal } from '../components/SocialShareModal';
import { useToast } from '../components/ui/Toast';
import {
  Heart,
  MessageCircle,
  Share2,
  Send,
  Plus,
  Award,
  Flame,
  TrendingUp,
  Image as ImageIcon,
  CheckCircle,
  Users
} from 'lucide-react';

export const CommunityFeed = () => {
  const { communityPosts, likePost, commentOnPost, addPost, user } = useGymFlow();
  const toast = useToast();
  const [newPostText, setNewPostText] = useState('');
  const [commentInputs, setCommentInputs] = useState<{ [postId: string]: string }>({});
  const [activeSubTab, setActiveSubTab] = useState<'feed' | 'ranking' | 'groups'>('feed');

  // Sharing state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareData, setShareData] = useState<any | null>(null);

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostText.trim()) return;
    addPost(newPostText);
    setNewPostText('');
  };

  const handleLike = (postId: string) => {
    likePost(postId);
  };

  const handleCommentSubmit = (postId: string) => {
    const text = commentInputs[postId];
    if (!text || !text.trim()) return;
    commentOnPost(postId, text);
    setCommentInputs({ ...commentInputs, [postId]: '' });
  };

  const triggerShareWorkoutPost = (postContent: string) => {
    setShareData({
      type: 'workout',
      title: `Treino Concluído com Sucesso!`,
      subtitle: postContent,
      badgeIcon: '🔥',
      stats: [
        { label: 'Duração', value: '55 minutos' },
        { label: 'Calorias', value: '450 Kcal' },
        { label: 'Esforço (RPE)', value: '8 / 10' },
        { label: 'XP Conquistado', value: '+180 XP' }
      ]
    });
    setShareModalOpen(true);
  };

  // Mock Ranking Data
  const rankingList = [
    { rank: 1, name: 'Rodrigo Faro', xp: 5400, avatar: '🥇', streak: 18 },
    { rank: 2, name: 'Jéssica Alencar', xp: 4890, avatar: '🥈', streak: 12 },
    { rank: 3, name: 'Gabriel Medeiros', xp: 4200, avatar: '🥉', streak: 9 },
    { rank: 4, name: 'Rafael Silveira (Você)', xp: user?.xp || 2450, avatar: '🔥', streak: user?.streak || 5 },
    { rank: 5, name: 'Patrícia Gomes', xp: 2100, avatar: '👩‍⚕️', streak: 4 }
  ];

  return (
    <div className="space-y-6 pb-20 lg:pb-6 max-w-4xl mx-auto">
      {/* TÍTULO E SUBTABS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">Comunidade GymFlow</h1>
          <p className="text-xs text-gym-text-muted mt-0.5 font-medium">
            Compartilhe treinos, comemore recordes de carga e dispute consistência no ranking.
          </p>
        </div>

        {/* SUBTABS */}
        <div className="flex bg-gym-card p-1 rounded-2xl border border-white/5 gap-1 self-start sm:self-auto">
          {[
            { id: 'feed', label: 'Feed Social' },
            { id: 'ranking', label: 'Ranking Semanal' }
          ].map((sub) => (
            <button
              key={sub.id}
              onClick={() => setActiveSubTab(sub.id as any)}
              className={`py-2 px-4 rounded-xl text-xs font-bold transition-all ${
                activeSubTab === sub.id
                  ? 'bg-white/10 text-white'
                  : 'text-gym-text-muted hover:text-white'
              }`}
            >
              {sub.label}
            </button>
          ))}
        </div>
      </div>

      {activeSubTab === 'feed' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LADO ESQUERDO: POSTS FEED */}
          <div className="lg:col-span-2 space-y-6">
            {/* CRIAR NOVO POST */}
            <form onSubmit={handleCreatePost} className="glass p-4 rounded-3xl border border-white/5 space-y-3">
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-gym-accent to-gym-emerald flex items-center justify-center font-bold text-sm text-gym-dark">
                  {user?.name.charAt(0) || 'U'}
                </div>
                <textarea
                  placeholder="Compartilhe seus resultados de hoje... #NoPainNoGain"
                  value={newPostText}
                  onChange={(e) => setNewPostText(e.target.value)}
                  className="flex-1 bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-2xl py-3 px-4 text-xs text-white placeholder-gym-text-muted outline-none transition-all h-20 resize-none"
                  required
                />
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => toast.info('Selecione uma imagem mockada (foto adicionada automaticamente)')}
                  className="text-xs text-gym-text-muted hover:text-white flex items-center gap-1.5 font-bold"
                >
                  <ImageIcon className="w-4 h-4 text-gym-accent" />
                  Adicionar Foto
                </button>

                <button
                  type="submit"
                  className="bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold px-4 py-2 rounded-xl text-xs transition-all flex items-center gap-1"
                >
                  <Send className="w-3.5 h-3.5 fill-gym-dark" />
                  Publicar
                </button>
              </div>
            </form>

            {/* LISTAGEM DE POSTS */}
            <div className="space-y-6">
              {communityPosts.map((post) => (
                <div key={post.id} className="glass p-5 rounded-3xl border border-white/5 space-y-4">
                  {/* Autor e data */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="text-2xl w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                        {post.authorAvatar}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white leading-none">{post.authorName}</h4>
                        <p className="text-[10px] text-gym-text-muted mt-1">{post.time}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => triggerShareWorkoutPost(post.content)}
                      className="p-1.5 text-gym-text-muted hover:text-gym-accent hover:bg-white/5 rounded-lg transition-all"
                      title="Compartilhar Card"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Conteúdo */}
                  <p className="text-xs text-white/90 leading-relaxed pl-1">{post.content}</p>

                  {/* Foto anexada (mocked unsplash) */}
                  {post.image && (
                    <div className="aspect-[16/9] w-full rounded-2xl overflow-hidden border border-white/10">
                      <img src={post.image} alt="Imagem do Treino" className="w-full h-full object-cover" />
                    </div>
                  )}

                  {/* Likes e Comments count */}
                  <div className="flex items-center gap-6 pt-3 border-t border-white/5 text-xs">
                    <button
                      onClick={() => handleLike(post.id)}
                      className={`flex items-center gap-1.5 font-bold transition-all ${
                        post.userLiked ? 'text-gym-rose' : 'text-gym-text-muted hover:text-white'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${post.userLiked ? 'fill-current' : ''}`} />
                      <span>{post.likes}</span>
                    </button>

                    <div className="flex items-center gap-1.5 text-gym-text-muted font-bold">
                      <MessageCircle className="w-4 h-4" />
                      <span>{post.comments.length} comentários</span>
                    </div>
                  </div>

                  {/* Comentários list */}
                  {post.comments.length > 0 && (
                    <div className="space-y-2 bg-white/5 p-3 rounded-2xl max-h-[160px] overflow-y-auto pr-1">
                      {post.comments.map((comm) => (
                        <div key={comm.id} className="text-[11px] leading-relaxed border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
                          <div className="flex items-center gap-1.5 font-bold text-white mb-0.5">
                            <span>{comm.authorAvatar}</span>
                            <span>{comm.authorName}</span>
                            <span className="text-[9px] font-normal text-gym-text-muted ml-auto">{comm.time}</span>
                          </div>
                          <p className="text-gym-text-muted pl-5">{comm.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Digitar Comentário */}
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Deixe um comentário encorajador..."
                      value={commentInputs[post.id] || ''}
                      onChange={(e) => setCommentInputs({ ...commentInputs, [post.id]: e.target.value })}
                      className="flex-1 bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-3 py-2 text-[11px] text-white outline-none"
                    />
                    <button
                      onClick={() => handleCommentSubmit(post.id)}
                      className="bg-white/5 hover:bg-gym-accent/15 border border-white/10 hover:border-gym-accent/20 text-gym-text-muted hover:text-gym-accent p-2 rounded-xl transition-all"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* LADO DIREITO: RESUMO GRUPOS E CONQUISTAS */}
          <div className="space-y-6">
            <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Users className="w-4 h-4 text-gym-accent" />
                Grupos por Objetivo
              </h3>
              <p className="text-xs text-gym-text-muted">Participe de discussões e treinos em grupo.</p>
              <div className="space-y-2">
                {[
                  { name: '🔥 Projeto Hipertrofia', members: '1.4k membros', active: true },
                  { name: '🏃 Definição Máxima', members: '820 membros', active: false },
                  { name: '🏋️ Powerlifters Unidos', members: '430 membros', active: false }
                ].map((gr, idx) => (
                  <div key={idx} className="bg-white/5 border border-white/15 p-3 rounded-2xl flex justify-between items-center text-xs">
                    <div>
                      <h4 className="font-bold text-white">{gr.name}</h4>
                      <span className="text-[10px] text-gym-text-muted">{gr.members}</span>
                    </div>
                    <button className="text-[10px] bg-gym-accent/10 border border-gym-accent/20 text-gym-accent font-bold px-2.5 py-1 rounded-lg">
                      Entrar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ABA DE RANKING SEMANAL */
        <div className="glass p-6 rounded-3xl border border-white/5 space-y-6 max-w-2xl mx-auto">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-white flex items-center justify-center gap-2">
              <Award className="w-6 h-6 text-gym-accent animate-pulse" />
              Consistência Semanal
            </h2>
            <p className="text-xs text-gym-text-muted max-w-sm mx-auto">
              Ganhe XP completando treinos, batendo PRs e assistindo aulas técnicas. O ranking reinicia todo domingo!
            </p>
          </div>

          <div className="space-y-3">
            {rankingList.map((rank) => {
              const isUser = rank.name.includes('(Você)');
              return (
                <div
                  key={rank.rank}
                  className={`p-4 rounded-2xl flex items-center justify-between border transition-all ${
                    isUser
                      ? 'bg-gym-accent/10 border-gym-accent/30 text-gym-accent shadow'
                      : 'bg-white/5 border-transparent text-white'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <span className="text-lg font-extrabold w-8 text-center">{rank.rank}º</span>
                    <span className="text-2xl">{rank.avatar}</span>
                    <div>
                      <h4 className="text-xs font-bold">{rank.name}</h4>
                      <p className="text-[10px] text-gym-text-muted mt-0.5 flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 text-gym-accent" /> {rank.streak} dias de streak
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-extrabold font-mono">{rank.xp} XP</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SHARE MODAL MOUNTED */}
      <SocialShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareData={shareData}
      />
    </div>
  );
};
