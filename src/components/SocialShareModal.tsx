'use client';

import React, { useState } from 'react';
import { X, Share2, Eye, EyeOff, Shield, Check } from 'lucide-react';
import { useGymFlow } from '../providers/GymFlowContext';
import { useToast } from './ui/Toast';

interface ShareData {
  type: 'workout' | 'pr' | 'streak' | 'achievement' | 'evolution';
  title: string;
  subtitle?: string;
  stats?: { label: string; value: string }[];
  accentText?: string;
  badgeIcon?: string;
  image?: string;
}

interface SocialShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareData: ShareData | null;
}

export const SocialShareModal = ({ isOpen, onClose, shareData }: SocialShareModalProps) => {
  const { user } = useGymFlow();
  const toast = useToast();
  const [privacy, setPrivacy] = useState({
    profilePublic: true,
    hideWeight: false,
    hideMeasurements: false,
    hidePhotos: false,
    shareAchievementsOnly: false,
  });
  const [copiedLink, setCopiedLink] = useState(false);
  const [sharedPlatform, setSharedPlatform] = useState<string | null>(null);

  if (!isOpen || !shareData) return null;

  const handleSimulatedShare = (platform: string) => {
    setSharedPlatform(platform);
    setTimeout(() => {
      setSharedPlatform(null);
      toast.success(`Compartilhado com sucesso no ${platform}!`);
    }, 1500);
  };

  const handleCopyLink = () => {
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Filtrar estatísticas baseado nas configurações de privacidade
  const filteredStats = shareData.stats?.filter((stat) => {
    if (privacy.hideWeight && (stat.label.toLowerCase().includes('peso') || stat.label.toLowerCase().includes('kg'))) {
      return false;
    }
    if (privacy.hideMeasurements && (stat.label.toLowerCase().includes('medida') || stat.label.toLowerCase().includes('cm'))) {
      return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gym-dark border border-white/10 rounded-3xl w-full max-w-4xl p-6 lg:p-8 flex flex-col lg:flex-row gap-8 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gym-text-muted hover:text-white p-2 rounded-lg bg-white/5"
        >
          <X className="w-5 h-5" />
        </button>

        {/* LADO ESQUERDO: Preview do Story / Card Premium */}
        <div className="flex-1 flex flex-col items-center">
          <h3 className="text-sm font-bold text-gym-text-muted uppercase tracking-widest mb-3">Card de Compartilhamento</h3>

          <div
            id="share-card"
            className="w-full max-w-[340px] aspect-[9/16] rounded-2xl p-6 relative overflow-hidden bg-gradient-to-b from-gym-dark to-black border border-white/15 flex flex-col justify-between shadow-2xl"
          >
            {/* Background glowing gradients */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-gym-accent/10 rounded-full blur-3xl -z-10"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-gym-emerald/10 rounded-full blur-3xl -z-10"></div>

            {/* Top header */}
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-gym-accent to-gym-emerald flex items-center justify-center font-bold text-xs text-gym-dark">
                  GF
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">{user?.name || 'Membro GymFlow'}</h4>
                  <p className="text-[9px] text-gym-text-muted">@gymflow.ai</p>
                </div>
              </div>
              <span className="text-[10px] font-extrabold text-gym-accent tracking-tighter">
                GYMFLOW<span className="text-white">AI</span>
              </span>
            </div>

            {/* Center Content */}
            <div className="my-auto flex flex-col items-center text-center py-4">
              {shareData.badgeIcon && (
                <div className="w-20 h-20 bg-gym-accent/10 rounded-full flex items-center justify-center text-4xl mb-4 border border-gym-accent/30 animate-pulse">
                  {shareData.badgeIcon}
                </div>
              )}

              {shareData.type === 'streak' && (
                <div className="text-5xl font-extrabold text-gym-accent mb-2 drop-shadow-[0_0_15px_rgba(163,230,53,0.3)]">
                  {shareData.accentText || '7 dias'}
                </div>
              )}

              <h2 className="text-xl font-bold text-white tracking-tight leading-tight">{shareData.title}</h2>
              {shareData.subtitle && <p className="text-xs text-gym-text-muted mt-1 px-4">{shareData.subtitle}</p>}

              {/* Stats Grid */}
              {filteredStats && filteredStats.length > 0 && (
                <div className="grid grid-cols-2 gap-3 w-full mt-6 bg-white/5 border border-white/10 rounded-2xl p-4">
                  {filteredStats.map((stat, idx) => (
                    <div key={idx} className="flex flex-col items-center">
                      <span className="text-[10px] text-gym-text-muted uppercase tracking-wider">{stat.label}</span>
                      <span className="text-sm font-extrabold text-gym-accent font-mono">{stat.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Footer */}
            <div className="w-full text-center border-t border-white/5 pt-3">
              <p className="text-[9px] text-gym-text-muted">Baixe o app e crie seus treinos inteligentes</p>
              <p className="text-[10px] font-semibold text-gym-accent mt-0.5">gymflow.ai/invite</p>
            </div>
          </div>
        </div>

        {/* LADO DIREITO: Configurações de Privacidade e Canais de Share */}
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight mb-2 flex items-center gap-2">
              <Share2 className="w-6 h-6 text-gym-accent" />
              Compartilhar Conquista
            </h2>
            <p className="text-sm text-gym-text-muted mb-6">
              Mostre sua evolução e inspire outras pessoas no feed social do GymFlow AI e nas suas redes preferidas.
            </p>

            {/* Privacidade */}
            <div className="bg-gym-card rounded-2xl p-5 border border-white/5 mb-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gym-accent mb-4 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                Privacidade do Compartilhamento
              </h4>
              <div className="flex flex-col gap-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-medium text-white flex items-center gap-2">
                    {privacy.profilePublic ? <Eye className="w-4 h-4 text-gym-accent" /> : <EyeOff className="w-4 h-4" />}
                    Perfil Público (visível na comunidade)
                  </span>
                  <input
                    type="checkbox"
                    checked={privacy.profilePublic}
                    onChange={(e) => setPrivacy({ ...privacy, profilePublic: e.target.checked })}
                    className="rounded border-white/10 bg-white/5 text-gym-accent focus:ring-gym-accent w-4 h-4"
                  />
                </label>

                {shareData.type === 'evolution' && (
                  <>
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs font-medium text-white">Ocultar peso corporal (kg)</span>
                      <input
                        type="checkbox"
                        checked={privacy.hideWeight}
                        onChange={(e) => setPrivacy({ ...privacy, hideWeight: e.target.checked })}
                        className="rounded border-white/10 bg-white/5 text-gym-accent w-4 h-4"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs font-medium text-white">Ocultar medidas corporais (cm)</span>
                      <input
                        type="checkbox"
                        checked={privacy.hideMeasurements}
                        onChange={(e) => setPrivacy({ ...privacy, hideMeasurements: e.target.checked })}
                        className="rounded border-white/10 bg-white/5 text-gym-accent w-4 h-4"
                      />
                    </label>
                  </>
                )}

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-medium text-white">Compartilhar apenas medalhas/conquistas</span>
                  <input
                    type="checkbox"
                    checked={privacy.shareAchievementsOnly}
                    onChange={(e) => setPrivacy({ ...privacy, shareAchievementsOnly: e.target.checked })}
                    className="rounded border-white/10 bg-white/5 text-gym-accent w-4 h-4"
                  />
                </label>
              </div>
            </div>

            {/* Redes Sociais */}
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Plataformas Disponíveis</h4>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { name: 'Instagram Stories', color: 'bg-gradient-to-tr from-pink-500 via-red-500 to-yellow-500' },
                { name: 'Instagram Feed', color: 'bg-zinc-800 border border-white/10' },
                { name: 'WhatsApp', color: 'bg-green-600' },
                { name: 'TikTok', color: 'bg-slate-900 border border-white/10' },
                { name: 'Facebook', color: 'bg-blue-600' },
                { name: 'X / Twitter', color: 'bg-black border border-white/10' }
              ].map((plat) => (
                <button
                  key={plat.name}
                  disabled={sharedPlatform !== null}
                  onClick={() => handleSimulatedShare(plat.name)}
                  className={`py-3 px-2 rounded-xl text-center text-[10px] font-bold text-white transition-all transform hover:-translate-y-0.5 active:scale-95 ${plat.color} flex items-center justify-center min-h-[44px]`}
                >
                  {sharedPlatform === plat.name ? (
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full border-t-2 border-white animate-spin"></span>
                      Enviando...
                    </span>
                  ) : (
                    plat.name
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Copy link */}
          <div className="flex gap-2">
            <button
              onClick={handleCopyLink}
              className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-xs text-white transition-all flex items-center justify-center gap-2"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-gym-accent" />
                  Copiado!
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-gym-text-muted" />
                  Copiar Link Compartilhável
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="px-6 py-3 bg-gym-accent hover:bg-gym-accent-hover rounded-xl font-bold text-xs text-gym-dark transition-all"
            >
              Concluído
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
