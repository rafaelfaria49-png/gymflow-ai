'use client';

import React, { useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { SocialShareModal } from '../components/SocialShareModal';
import { useToast } from '../components/ui/Toast';
import {
  TrendingUp,
  Scale,
  Ruler,
  Image as ImageIcon,
  Plus,
  Share2,
  Calendar,
  Award,
  Zap,
  Activity,
  Flame
} from 'lucide-react';

export const EvolutionDashboard = () => {
  const {
    user,
    updateUserProfile,
    weightHistory,
    addWeightLog,
    measurementsHistory,
    addMeasurementLog,
    workoutHistory,
    achievements
  } = useGymFlow();
  const toast = useToast();

  // Inputs
  const [weightInput, setWeightInput] = useState('');
  const [chestInput, setChestInput] = useState('');
  const [waistInput, setWaistInput] = useState('');
  const [hipsInput, setHipsInput] = useState('');
  const [armsInput, setArmsInput] = useState('');

  // Evolution photos mock list
  const [photos, setPhotos] = useState<string[]>([
    'https://images.unsplash.com/photo-1578762560072-483c47779673?q=80&w=400&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=400&auto=format&fit=crop'
  ]);

  // Social Share states
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareData, setShareData] = useState<any | null>(null);

  const handleWeightSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!weightInput) return;
    addWeightLog(Number(weightInput));
    setWeightInput('');
    toast.success('Peso registrado com sucesso!');
  };

  const handleMeasurementsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chestInput || !waistInput || !hipsInput || !armsInput) return;
    addMeasurementLog(Number(chestInput), Number(waistInput), Number(hipsInput), Number(armsInput));
    setChestInput('');
    setWaistInput('');
    setHipsInput('');
    setArmsInput('');
    toast.success('Medidas registradas com sucesso!');
  };

  const handleSimulatePhotoUpload = () => {
    const mockPhoto = 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=400&auto=format&fit=crop';
    setPhotos([mockPhoto, ...photos]);
    toast.success('Foto de evolução adicionada!');
  };

  const triggerSharePR = (prName: string, prWeight: string) => {
    setShareData({
      type: 'pr',
      title: `Recorde de Força Batido!`,
      subtitle: `Superei minhas cargas usando as planilhas do GymFlow AI!`,
      accentText: prWeight,
      badgeIcon: '⚡',
      stats: [
        { label: 'Exercício', value: prName },
        { label: 'Carga Máxima', value: prWeight },
        { label: 'XP Bônus', value: '+150 XP' }
      ]
    });
    setShareModalOpen(true);
  };

  const triggerShareEvolution = () => {
    const currentWeight = weightHistory[0]?.value || 80.5;
    const initialWeight = weightHistory[weightHistory.length - 1]?.value || 82.5;
    const diff = (initialWeight - currentWeight).toFixed(1);

    setShareData({
      type: 'evolution',
      title: `Evolução Física GymFlow`,
      subtitle: `Resultados obtidos com treinos de IA e consistência diária.`,
      badgeIcon: '🏆',
      stats: [
        { label: 'Peso Inicial', value: `${initialWeight} kg` },
        { label: 'Peso Atual', value: `${currentWeight} kg` },
        { label: 'Diferença', value: `-${diff} kg` },
        { label: 'Nível Atual', value: `Nível ${Math.floor((user?.xp || 0) / 1000) + 1}` }
      ]
    });
    setShareModalOpen(true);
  };

  // Mock PRs
  const personalRecords = [
    { exercise: 'Supino Reto com Barra', weight: '100 kg', date: '2026-05-24' },
    { exercise: 'Agachamento Livre com Barra', weight: '140 kg', date: '2026-05-20' },
    { exercise: 'Levantamento Terra', weight: '160 kg', date: '2026-05-18' }
  ];

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight">Evolução e Métricas</h1>
          <p className="text-xs text-gym-text-muted mt-0.5 font-medium">
            Histórico corporal, fotos de evolução e recordes pessoais (PRs).
          </p>
        </div>

        <button
          onClick={triggerShareEvolution}
          className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-gym-accent/30 text-white hover:text-gym-accent font-bold px-5 py-3 rounded-2xl transition-all flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider cursor-pointer"
        >
          <Share2 className="w-4 h-4" />
          Compartilhar Progresso
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* COLUNA ESQUERDA: REGISTRAR PESO E MEDIDAS */}
        <div className="space-y-6">
          {/* REGISTRAR PESO */}
          <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-gym-accent" />
              Registrar Peso Corporal
            </h3>
            <form onSubmit={handleWeightSubmit} className="flex gap-2">
              <input
                type="number"
                step="0.1"
                placeholder="Ex: 80.5 kg"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="flex-1 bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-4 py-2.5 text-xs text-white placeholder-gym-text-muted outline-none transition-all"
                required
              />
              <button
                type="submit"
                className="bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold px-4 py-2.5 rounded-xl text-xs transition-all"
              >
                Salvar
              </button>
            </form>

            <div className="space-y-2 mt-2 max-h-[140px] overflow-y-auto pr-1">
              {weightHistory.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs py-1.5 border-b border-white/5">
                  <span className="text-gym-text-muted">{item.date}</span>
                  <span className="font-bold text-white">{item.value} kg</span>
                </div>
              ))}
            </div>
          </div>

          {/* REGISTRAR MEDIDAS */}
          <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Ruler className="w-4 h-4 text-gym-emerald" />
              Medidas Corporais (cm)
            </h3>
            <form onSubmit={handleMeasurementsSubmit} className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Peito"
                value={chestInput}
                onChange={(e) => setChestInput(e.target.value)}
                className="bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-3 py-2 text-xs text-white outline-none"
                required
              />
              <input
                type="number"
                placeholder="Cintura"
                value={waistInput}
                onChange={(e) => setWaistInput(e.target.value)}
                className="bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-3 py-2 text-xs text-white outline-none"
                required
              />
              <input
                type="number"
                placeholder="Quadril"
                value={hipsInput}
                onChange={(e) => setHipsInput(e.target.value)}
                className="bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-3 py-2 text-xs text-white outline-none"
                required
              />
              <input
                type="number"
                placeholder="Braço"
                value={armsInput}
                onChange={(e) => setArmsInput(e.target.value)}
                className="bg-gym-dark/60 border border-white/10 focus:border-gym-accent rounded-xl px-3 py-2 text-xs text-white outline-none"
                required
              />
              <button
                type="submit"
                className="col-span-2 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold py-2.5 rounded-xl text-xs transition-all"
              >
                Salvar Medidas
              </button>
            </form>

            <div className="space-y-2 mt-2 max-h-[140px] overflow-y-auto pr-1">
              {measurementsHistory.map((item, idx) => (
                <div key={idx} className="text-xs py-2 border-b border-white/5 space-y-1">
                  <div className="flex justify-between font-bold text-white">
                    <span>{item.date}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[10px] text-gym-text-muted">
                    <span>P: {item.chest}cm</span>
                    <span>C: {item.waist}cm</span>
                    <span>Q: {item.hips}cm</span>
                    <span>B: {item.arms}cm</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* COLUNA DO MEIO: PRs E HISTÓRICO DE TREINOS */}
        <div className="space-y-6">
          {/* PRs (RECORDES PESSOAIS) */}
          <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Award className="w-4 h-4 text-gym-accent animate-pulse" />
              Recordes de Carga (PRs)
            </h3>
            <div className="space-y-3">
              {personalRecords.map((pr, idx) => (
                <div
                  key={idx}
                  className="bg-white/5 border border-white/10 p-3 rounded-2xl flex items-center justify-between"
                >
                  <div>
                    <h4 className="text-xs font-bold text-white">{pr.exercise}</h4>
                    <p className="text-[9px] text-gym-text-muted">{pr.date}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-extrabold text-gym-accent font-mono">{pr.weight}</span>
                    <button
                      onClick={() => triggerSharePR(pr.exercise, pr.weight)}
                      className="p-1.5 text-gym-text-muted hover:text-gym-accent hover:bg-white/5 rounded-lg transition-all"
                      title="Compartilhar PR"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* HISTÓRICO DOS ÚLTIMOS TREINOS */}
          <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-gym-emerald" />
              Últimos Treinos Concluídos
            </h3>
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {workoutHistory.length === 0 ? (
                <p className="text-xs text-gym-text-muted text-center py-4">Nenhum treino concluído ainda nesta semana.</p>
              ) : (
                workoutHistory.map((sess, idx) => (
                  <div
                    key={idx}
                    className="bg-white/5 border border-white/10 p-3 rounded-2xl flex items-center justify-between"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-white">{sess.name}</h4>
                      <p className="text-[10px] text-gym-text-muted">
                        {sess.date} • {Math.ceil(sess.duration / 60)} min
                      </p>
                    </div>
                    <span className="text-[10px] bg-gym-accent/15 text-gym-accent font-mono font-bold px-2 py-1 rounded-lg">
                      +{sess.calories} Kcal
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: FOTOS DE EVOLUÇÃO */}
        <div className="glass p-5 rounded-3xl border border-white/5 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-gym-accent" />
                Diário Visual de Evolução
              </h3>
              <button
                onClick={handleSimulatePhotoUpload}
                className="p-1 bg-gym-accent/15 hover:bg-gym-accent/25 border border-gym-accent/30 text-gym-accent rounded-lg transition-all"
                title="Adicionar Foto"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gym-text-muted leading-relaxed">
              Tire fotos semanais no mesmo espelho para acompanhar de forma clara a queima de gordura e ganho de volume muscular.
            </p>

            <div className="grid grid-cols-2 gap-3 mt-4">
              {photos.map((url, idx) => (
                <div key={idx} className="aspect-[3/4] bg-zinc-950 rounded-2xl overflow-hidden border border-white/10 relative group">
                  <img src={url} alt={`Evolução ${idx + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-2 left-2 bg-black/70 text-white font-bold text-[9px] px-2 py-0.5 rounded-md">
                    {idx === 0 ? 'Atual' : 'Há 2 semanas'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gym-card border border-white/5 p-4 rounded-2xl mt-4">
            <h4 className="text-xs font-bold text-white">Relatório Semanal IA</h4>
            <p className="text-[10px] text-gym-text-muted mt-1 leading-relaxed">
              "Você treinou 3 vezes esta semana. O volume semanal do peito atingiu 14 séries, que está na faixa ideal hipertrófica. Reduza o volume de quadríceps na próxima sessão para evitar overreaching."
            </p>
          </div>
        </div>
      </div>

      {/* SEÇÃO DE CONFIGURAÇÕES DE PERFIL E INTEGRAÇÃO SOCIAL */}
      <div className="glass p-6 rounded-3xl border border-white/5 space-y-6">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-gym-accent" />
            Configurações e Conexões de Perfil
          </h3>
          <p className="text-xs text-gym-text-muted mt-0.5">
            Ajuste seu gênero para treinos inteligentes personalizados e conecte suas redes sociais mockadas.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          {/* GÊNERO E PREFERÊNCIAS */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Ajuste Biológico (Divisões IA)</h4>
            <div className="space-y-2">
              <label className="text-[10px] text-gym-text-muted font-bold block">Gênero do Perfil</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'male', label: 'Masculino' },
                  { value: 'female', label: 'Feminino' },
                  { value: 'neutral', label: 'Neutro' }
                ].map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => updateUserProfile({ gender: g.value as any })}
                    className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                      user?.gender === g.value
                        ? 'bg-gym-accent text-gym-dark border-gym-accent font-black'
                        : 'bg-white/5 text-gym-text-muted border-white/5 hover:text-white'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-gym-text-muted leading-relaxed">
                *O gênero altera as sugestões biomecânicas da IA Coach (ex: maior volume de glúteos e pernas para o perfil feminino).
              </p>
            </div>
          </div>

          {/* REDES SOCIAIS MOCKADAS */}
          <div className="space-y-4 border-y md:border-y-0 md:border-x border-white/5 py-4 md:py-0 md:px-6">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Integrações Sociais</h4>
            <div className="space-y-3">
              {[
                { name: 'Instagram', connected: true },
                { name: 'TikTok', connected: false },
                { name: 'Strava', connected: true },
                { name: 'Apple Health', connected: false }
              ].map((platform) => (
                <div key={platform.name} className="flex justify-between items-center bg-white/5 p-2.5 rounded-xl border border-white/5">
                  <span className="text-xs text-white font-medium">{platform.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      toast.success(`${platform.name} conectado com sucesso (Simulação Premium).`);
                    }}
                    className={`text-[9px] font-extrabold uppercase px-2.5 py-1 rounded-lg transition-all ${
                      platform.connected
                        ? 'bg-gym-accent/15 text-gym-accent border border-gym-accent/20'
                        : 'bg-white/5 text-gym-text-muted border border-white/10 hover:text-white'
                    }`}
                  >
                    {platform.connected ? 'Conectado' : 'Conectar'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* PRIVACIDADE E FEED */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Privacidade e Feed</h4>
            <div className="space-y-3">
              {[
                { key: 'publicProfile', label: 'Perfil Público na Comunidade', desc: 'Permite que outros vejam suas conquistas no feed' },
                { key: 'showWeights', label: 'Compartilhar Cargas nos Posts', desc: 'Mostra o volume total levantado em kg nos posts automáticos' },
                { key: 'privateStreaks', label: 'Esconder Dias Consecutivos (Streak)', desc: 'Esconde seu contador de streak no cabeçalho superior' }
              ].map((opt) => (
                <div key={opt.key} className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs text-white font-medium block">{opt.label}</span>
                    <p className="text-[9px] text-gym-text-muted mt-0.5 leading-tight">{opt.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    defaultChecked
                    onChange={() => {
                      toast.info('Preferência de privacidade atualizada localmente.');
                    }}
                    className="w-4 h-4 rounded border-white/10 accent-gym-accent bg-gym-dark focus:ring-0 focus:ring-offset-0 cursor-pointer mt-0.5"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SHARE MODAL MOUNTED */}
      <SocialShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareData={shareData}
      />
    </div>
  );
};
