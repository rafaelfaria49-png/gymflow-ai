'use client';

import React, { useState } from 'react';
import { useGymFlow, STORAGE_KEY } from '../providers/GymFlowContext';
import { clearState } from '../lib/storage';
import { Exercise } from '../types';
import { Shield, Plus, Trash2, Users, Dumbbell, Award, Video, TrendingUp, BarChart2, HardDrive } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export const AdminPanel = () => {
  const { exercises, addNewExercise, deleteExercise, user } = useGymFlow();
  const toast = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleResetLocalData = () => {
    clearState(STORAGE_KEY);
    window.location.reload();
  };

  // Form states for new exercise
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState<'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'glutes' | 'abs' | 'calves' | 'cardio' | 'mobility' | 'functional'>('chest');
  const [equipment, setEquipment] = useState('Halteres');
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'advanced' | 'athlete'>('beginner');
  const [steps, setSteps] = useState('');
  const [tips, setTips] = useState('');

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !steps) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }

    const newEx: Exercise = {
      id: `admin_ex_${Date.now()}`,
      name,
      thumbnail: '🔧 Exercício Admin',
      muscleGroup: muscle,
      equipment,
      level,
      executionSteps: steps.split('\n').filter(Boolean),
      postureTips: tips.split('\n').filter(Boolean),
      breathing: 'Inspire no retorno, expire no esforço máximo.',
      commonErrors: ['Executar com pressa.'],
      errorCorrections: ['Controle o movimento.'],
      variations: [],
      substitutions: [],
      safetyWarnings: ['Monitore a coluna e articulações.']
    };

    addNewExercise(newEx);
    setName('');
    setSteps('');
    setTips('');
    setShowAddForm(false);
    toast.success('Exercício criado e publicado com sucesso!');
  };

  // Mock analytics data
  const stats = [
    { label: 'Usuários Registrados', value: '14,240', change: '+12% esta semana', icon: Users, color: 'text-gym-accent' },
    { label: 'Treinos Concluídos', value: '85,420', change: '+18% este mês', icon: Dumbbell, color: 'text-gym-emerald' },
    { label: 'Assinaturas Pro/Elite', value: '4,890', change: '+24% conver.', icon: Award, color: 'text-yellow-500' }
  ];

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gym-rose/15 border border-gym-rose/25 rounded-2xl flex items-center justify-center text-gym-rose">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">Painel Administrativo</h1>
            <p className="text-xs text-gym-text-muted mt-0.5 font-medium">
              Controle de base de dados, estatísticas de uso e moderação de conteúdo (Modo Mock).
            </p>
          </div>
        </div>
      </div>

      {/* ANALYTICS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="glass p-5 rounded-3xl border border-white/5 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-gym-text-muted uppercase tracking-wider">{stat.label}</span>
                <div className={`p-2 bg-white/5 rounded-xl ${stat.color}`}>
                  <Icon className="w-4.5 h-4.5" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-black text-white">{stat.value}</span>
                <span className="block text-[10px] text-gym-emerald font-bold mt-1">{stat.change}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* CONTENT MANAGEMENT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ESQUERDA: LISTA E CADASTRO EXERCÍCIOS */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-white/5">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Dumbbell className="w-4 h-4 text-gym-accent" />
                Gerenciar Exercícios ({exercises.length})
              </h3>

              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> Novo Exercício
              </button>
            </div>

            {/* ADD FORM */}
            {showAddForm && (
              <form onSubmit={handleAddSubmit} className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-3.5 animate-fade-in">
                <h4 className="text-xs font-bold text-white">Adicionar Exercício à Biblioteca</h4>
                <div>
                  <label className="block text-[10px] font-bold text-gym-text-muted uppercase mb-1">Nome do Exercício *</label>
                  <input
                    type="text"
                    placeholder="Ex: Crucifixo Reto com Halteres"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-gym-dark border border-white/10 rounded-xl py-2 px-3 text-xs text-white outline-none focus:border-gym-accent"
                    required
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gym-text-muted uppercase mb-1">Músculo</label>
                    <select
                      value={muscle}
                      onChange={(e) => setMuscle(e.target.value as any)}
                      className="w-full bg-gym-dark border border-white/10 rounded-xl py-2 px-2 text-[10px] text-white outline-none"
                    >
                      {['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'abs', 'calves', 'cardio', 'mobility', 'functional'].map((m) => (
                        <option key={m} value={m}>{m.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gym-text-muted uppercase mb-1">Aparelho</label>
                    <input
                      type="text"
                      placeholder="Ex: Halteres"
                      value={equipment}
                      onChange={(e) => setEquipment(e.target.value)}
                      className="w-full bg-gym-dark border border-white/10 rounded-xl py-2 px-2 text-[10px] text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gym-text-muted uppercase mb-1">Nível</label>
                    <select
                      value={level}
                      onChange={(e) => setLevel(e.target.value as any)}
                      className="w-full bg-gym-dark border border-white/10 rounded-xl py-2 px-2 text-[10px] text-white outline-none"
                    >
                      {['beginner', 'intermediate', 'advanced', 'athlete'].map((l) => (
                        <option key={l} value={l}>{l.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gym-text-muted uppercase mb-1">Passos (1 por linha) *</label>
                  <textarea
                    placeholder="Deite no banco...&#10;Segure os pesos...&#10;Suba os pesos..."
                    value={steps}
                    onChange={(e) => setSteps(e.target.value)}
                    className="w-full bg-gym-dark border border-white/10 rounded-xl py-2 px-3 text-xs text-white outline-none h-20 resize-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gym-text-muted uppercase mb-1">Postura (1 por linha)</label>
                  <textarea
                    placeholder="Mantenha as escápulas retraídas...&#10;Lombar apoiada..."
                    value={tips}
                    onChange={(e) => setTips(e.target.value)}
                    className="w-full bg-gym-dark border border-white/10 rounded-xl py-2 px-3 text-xs text-white outline-none h-16 resize-none"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 py-2 bg-white/5 rounded-xl text-xs font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-gym-accent text-gym-dark font-extrabold rounded-xl text-xs"
                  >
                    Publicar Exercício
                  </button>
                </div>
              </form>
            )}

            {/* LISTA EXERCÍCIOS ADMIN */}
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {exercises.map((ex) => (
                <div
                  key={ex.id}
                  className="bg-white/5 border border-white/5 p-3 rounded-2xl flex items-center justify-between"
                >
                  <div>
                    <h4 className="text-xs font-bold text-white">{ex.name}</h4>
                    <p className="text-[9px] text-gym-text-muted capitalize">
                      {ex.muscleGroup} • Nível: {ex.level} • {ex.equipment}
                    </p>
                  </div>

                  <button
                    onClick={() => deleteExercise(ex.id)}
                    className="p-2 text-gym-text-muted hover:text-gym-rose hover:bg-gym-rose/10 rounded-lg transition-all"
                    title="Excluir Exercício"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* DIREITA: HISTÓRICO DE AUDITORIA ADMIN */}
        <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <BarChart2 className="w-4.5 h-4.5 text-gym-emerald" />
            Histórico de Eventos
          </h3>
          <div className="space-y-3.5 text-xs">
            {[
              { type: 'user', text: 'Novo usuário joao.silva@outlook.com cadastrado.', time: 'Há 2 minutos' },
              { type: 'sub', text: 'Upgrade de assinatura: user@gymflow.ai migrou para o Elite.', time: 'Há 14 minutos' },
              { type: 'post', text: 'Filtro automático ocultou comentário inapropriado no feed.', time: 'Há 1 hora' },
              { type: 'exercise', text: 'Admin publicou "Supino Reto com Barra W".', time: 'Há 3 horas' },
              { type: 'system', text: 'Backup automático de dados mockados executado.', time: 'Há 6 horas' }
            ].map((ev, idx) => (
              <div key={idx} className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-1">
                <div className="flex justify-between items-center">
                  <span className={`text-[9px] font-black uppercase ${ev.type === 'sub' ? 'text-yellow-500' : ev.type === 'user' ? 'text-gym-accent' : 'text-gym-text-muted'}`}>
                    {ev.type}
                  </span>
                  <span className="text-[9px] text-gym-text-muted">{ev.time}</span>
                </div>
                <p className="text-white/95 leading-relaxed text-[11px]">{ev.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DADOS LOCAIS */}
      <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
          <HardDrive className="w-4.5 h-4.5 text-gym-rose" />
          Dados locais
        </h3>
        <p className="text-[11px] text-gym-text-muted leading-relaxed">
          Todo o progresso (perfil, treinos, XP, histórico) fica salvo somente neste aparelho.
          Zerar os dados apaga tudo e reinicia o app do zero.
        </p>
        <button
          onClick={() => setShowResetConfirm(true)}
          className="w-full min-h-[44px] py-3 px-4 rounded-2xl text-xs font-extrabold bg-gym-rose/15 border border-gym-rose/25 text-gym-rose hover:bg-gym-rose/25 transition-all"
        >
          Zerar dados do app
        </button>
      </div>

      <ConfirmDialog
        isOpen={showResetConfirm}
        variant="destructive"
        title="Zerar todos os dados do app?"
        description="Perfil, treinos, XP, histórico e tudo o mais salvo neste aparelho será apagado permanentemente. Essa ação não pode ser desfeita."
        confirmLabel="Zerar dados"
        cancelLabel="Cancelar"
        onConfirm={handleResetLocalData}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
};
