'use client';

import React, { useState } from 'react';
import { useGymFlow, AppView } from '../providers/GymFlowContext';
import {
  LayoutDashboard,
  Dumbbell,
  BookOpen,
  Video,
  MessageSquare,
  TrendingUp,
  Users,
  Utensils,
  Shield,
  Award,
  LogOut,
  Flame,
  Menu,
  ChevronRight,
  Calendar,
  X
} from 'lucide-react';

export const TopBar = () => {
  const { user, logout, setActiveView } = useGymFlow();

  if (!user) return null;

  const currentLevel = Math.floor(user.xp / 1000) + 1;
  const xpInCurrentLevel = user.xp % 1000;
  const xpProgressPercent = (xpInCurrentLevel / 1000) * 100;

  return (
    // GOAL-15: paddingTop reserva a safe-area do topo (status bar do Android/notch).
    // No web env(safe-area-inset-top)=0, então fica só o py-3 de sempre; no APK o
    // fundo glass preenche a status bar e o logo GYMFLOWAI não fica mais cortado.
    <header
      className="sticky top-0 z-40 w-full glass border-b border-white/5 pb-3 px-4 flex items-center justify-between"
      style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setActiveView('dashboard')}>
          <span className="text-xl font-extrabold bg-gradient-to-r from-gym-accent to-gym-emerald bg-clip-text text-transparent tracking-tighter pl-0.5">
            GYMFLOW<span className="text-white">AI</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Streak */}
        <div className="flex items-center gap-1 bg-gym-card/60 px-2.5 py-1 rounded-full border border-white/5 cursor-pointer hover:border-gym-accent/30 transition-all" onClick={() => setActiveView('evolution')}>
          <Flame className="w-4 h-4 text-gym-accent animate-pulse" />
          <span className="text-xs font-bold">{user.streak}d</span>
        </div>

        {/* Level badge */}
        <div className="hidden sm:flex items-center gap-2 bg-gym-card/60 px-3 py-1 rounded-full border border-white/5">
          <Award className="w-3.5 h-3.5 text-gym-accent" />
          <span className="text-xs font-bold text-gym-accent">LVL {currentLevel}</span>
          <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gym-accent to-gym-emerald transition-all duration-500"
              style={{ width: `${xpProgressPercent}%` }}
            ></div>
          </div>
        </div>

        {/* User avatar/profile info */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full bg-gradient-to-tr from-gym-accent to-gym-emerald flex items-center justify-center font-bold text-sm text-gym-dark shadow-md cursor-pointer hover:scale-105 transition-all"
            onClick={() => setActiveView('evolution')}
          >
            {user.name.charAt(0)}
          </div>
          <button
            onClick={logout}
            className="p-2 text-gym-text-muted hover:text-gym-rose hover:bg-gym-rose/10 rounded-lg transition-all"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

interface NavItem {
  view: AppView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { view: 'dashboard', label: 'Painel', icon: LayoutDashboard },
  { view: 'planner', label: 'Planejador', icon: Calendar },
  { view: 'workouts', label: 'Treinos', icon: Dumbbell },
  { view: 'exercises', label: 'Exercícios', icon: BookOpen },
  { view: 'videos', label: 'Vídeos', icon: Video },
  { view: 'ai-coach', label: 'IA Coach', icon: MessageSquare },
  { view: 'evolution', label: 'Evolução', icon: TrendingUp },
  { view: 'community', label: 'Feed', icon: Users },
  { view: 'nutrition', label: 'Nutrição', icon: Utensils },
  { view: 'premium', label: 'Assinatura', icon: Award },
  { view: 'admin', label: 'Admin', icon: Shield, adminOnly: true }
];

export const SideNavigation = () => {
  const { activeView, setActiveView, user } = useGymFlow();

  if (!user) return null;

  return (
    <aside className="hidden lg:flex flex-col w-64 glass border-r border-white/5 p-4 flex-shrink-0 h-[calc(100vh-57px)] sticky top-[57px]">
      <div className="flex-1 flex flex-col gap-1.5 py-4">
        {navItems.map((item) => {
          if (item.adminOnly && user.email !== 'rafael.demo@gymflow.ai') return null; // Apenas admin simulado demo tem acesso
          const Icon = item.icon;
          const isActive = activeView === item.view;

          return (
            <button
              key={item.view}
              onClick={() => setActiveView(item.view)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left font-medium ${
                isActive
                  ? 'bg-gradient-to-r from-gym-accent/15 to-gym-emerald/5 text-gym-accent border-l-4 border-gym-accent font-semibold pl-3'
                  : 'text-gym-text-muted hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-gym-accent' : ''}`} />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight className="w-4 h-4 text-gym-accent" />}
            </button>
          );
        })}
      </div>

      <div className="p-3 bg-gym-card/40 border border-white/5 rounded-xl text-center">
        <p className="text-xs text-gym-text-muted">Versão Pro Ativa</p>
        <p className="text-[10px] text-gym-accent font-bold mt-0.5">GymFlow AI v1.0</p>
      </div>
    </aside>
  );
};

// Views que moram dentro do bottom sheet "Mais" (GOAL-05): telas principais que não
// cabem nos 4 slots fixos da bottom nav. IA Coach sai da barra principal por decisão
// do GOAL-05 e volta ao destaque quando virar uma IA real mais forte.
const MORE_MENU_ITEMS: NavItem[] = [
  { view: 'ai-coach', label: 'IA Coach', icon: MessageSquare },
  { view: 'workouts', label: 'Treinos', icon: Dumbbell },
  { view: 'videos', label: 'Vídeos', icon: Video },
  { view: 'nutrition', label: 'Nutrição', icon: Utensils },
  { view: 'community', label: 'Feed', icon: Users },
  { view: 'premium', label: 'Assinatura', icon: Award },
  { view: 'admin', label: 'Admin', icon: Shield, adminOnly: true }
];
const MORE_MENU_VIEWS: AppView[] = MORE_MENU_ITEMS.map((item) => item.view);

export const BottomNavigation = () => {
  const { activeView, setActiveView, user, activeWorkout } = useGymFlow();
  const [showMoreSheet, setShowMoreSheet] = useState(false);

  if (!user) return null;

  // Acesso rápido pensado para o polegar: Hoje, Planejar, Exercícios, Evolução + Mais.
  const mobileNavItems: NavItem[] = [
    { view: 'dashboard', label: 'Hoje', icon: LayoutDashboard },
    { view: 'planner', label: 'Planejar', icon: Calendar },
    { view: 'exercises', label: 'Exercícios', icon: BookOpen },
    { view: 'evolution', label: 'Evolução', icon: TrendingUp },
  ];

  const isMoreActive = MORE_MENU_VIEWS.includes(activeView);
  const isAdmin = user.email === 'rafael.demo@gymflow.ai'; // Mesma regra do SideNavigation

  const handleSelectMoreItem = (view: AppView) => {
    setActiveView(view);
    setShowMoreSheet(false);
  };

  const hasActive = !!activeWorkout;
  // Dentro do próprio Treino Ativo o FAB "Continuar" é substituído pela ActionBar
  // fixa da página (ver ActiveWorkoutPage.tsx) — evita duas barras fixas competindo
  // pelo mesmo espaço e cobrindo conteúdo (GOAL-04).
  const showFab = !(hasActive && activeView === 'active-workout');

  return (
    <>
      {/* Botão principal de treino (FAB) — flutua acima da barra, alcançável pelo polegar */}
      {showFab && (
        <button
          onClick={() => setActiveView(hasActive ? 'active-workout' : 'workouts')}
          className="lg:hidden fixed right-4 z-50 flex items-center gap-1.5 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-black uppercase tracking-wider text-xs pl-3.5 pr-4 py-3 rounded-2xl shadow-lg shadow-gym-accent/30 tap-target active:scale-95 transition-all"
          style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}
          aria-label={hasActive ? 'Continuar treino' : 'Iniciar treino'}
        >
          {hasActive ? <Flame className="w-4 h-4" /> : <Dumbbell className="w-4 h-4" />}
          {hasActive ? 'Continuar' : 'Treinar'}
        </button>
      )}

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-gym-dark/95 backdrop-blur-xl border-t border-white/10 px-1.5 pt-1 pb-safe flex justify-around items-stretch">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.view;

          return (
            <button
              key={item.view}
              onClick={() => setActiveView(item.view)}
              className={`flex flex-col items-center justify-center flex-1 tap-target py-1.5 rounded-xl transition-all active:scale-95 ${
                isActive ? 'text-gym-accent' : 'text-gym-text-muted hover:text-white'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="text-[9px] font-bold tracking-tight leading-none">{item.label}</span>
            </button>
          );
        })}

        {/* Aba "Mais" — abre o bottom sheet com o restante das telas principais */}
        <button
          onClick={() => setShowMoreSheet(true)}
          className={`flex flex-col items-center justify-center flex-1 tap-target py-1.5 rounded-xl transition-all active:scale-95 ${
            isMoreActive ? 'text-gym-accent' : 'text-gym-text-muted hover:text-white'
          }`}
          aria-current={isMoreActive ? 'page' : undefined}
          aria-haspopup="true"
          aria-expanded={showMoreSheet}
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span className="text-[9px] font-bold tracking-tight leading-none">Mais</span>
        </button>
      </nav>

      <MoreMenuSheet
        isOpen={showMoreSheet}
        onClose={() => setShowMoreSheet(false)}
        activeView={activeView}
        isAdmin={isAdmin}
        onSelect={handleSelectMoreItem}
      />
    </>
  );
};

interface MoreMenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: AppView;
  isAdmin: boolean;
  onSelect: (view: AppView) => void;
}

const MoreMenuSheet = ({ isOpen, onClose, activeView, isAdmin, onSelect }: MoreMenuSheetProps) => {
  if (!isOpen) return null;

  const items = MORE_MENU_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div
      className="lg:hidden fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Mais opções"
        className="w-full bg-gym-dark border-t border-white/10 rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl animate-sheet-up"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-black text-white uppercase tracking-wider">Mais Opções</h2>
          <button
            onClick={onClose}
            className="tap-target flex items-center justify-center text-gym-text-muted hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.view;

            return (
              <button
                key={item.view}
                onClick={() => onSelect(item.view)}
                className={`flex flex-col items-center justify-center gap-2 min-h-[80px] rounded-2xl border transition-all active:scale-95 ${
                  isActive
                    ? 'bg-gym-accent/15 border-gym-accent/30 text-gym-accent'
                    : 'bg-white/5 border-white/5 text-white hover:bg-white/10'
                }`}
              >
                <Icon className={`w-6 h-6 ${isActive ? 'text-gym-accent' : 'text-gym-text-muted'}`} />
                <span className="text-xs font-bold">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
