'use client';

import React from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { TopBar, SideNavigation, BottomNavigation } from '../components/Navigation';
import { WorkoutSheetNotification } from '../components/WorkoutSheetNotification';
import { XPBadgeNotification } from '../components/XPBadgeNotification';

// Import Views
import { LandingPage } from '../modules/LandingPage';
import { LoginPage, RegisterPage, RecoveryPage } from '../modules/AuthPages';
import { OnboardingFlow } from '../modules/OnboardingFlow';
import { Dashboard } from '../modules/Dashboard';
import { WorkoutsTab } from '../modules/WorkoutsTab';
import { ActiveWorkoutPage } from '../modules/ActiveWorkoutPage';
import { ExerciseLibrary } from '../modules/ExerciseLibrary';
import { EducationalVideos } from '../modules/EducationalVideos';
import { AiCoachChat } from '../modules/AiCoachChat';
import { EvolutionDashboard } from '../modules/EvolutionDashboard';
import { CommunityFeed } from '../modules/CommunityFeed';
import { NutritionPage } from '../modules/NutritionPage';
import { PremiumUpgrade } from '../modules/PremiumUpgrade';
import { AdminPanel } from '../modules/AdminPanel';
import { PlannerView } from '../modules/PlannerView';

// Import Global Components
import { GlobalVideoPlayer } from '../components/GlobalVideoPlayer';

export default function Home() {
  const { activeView, user } = useGymFlow();

  // Se o usuário não estiver logado, mostramos telas de entrada / onboarding
  if (!user) {
    switch (activeView) {
      case 'login':
        return <LoginPage />;
      case 'register':
        return <RegisterPage />;
      case 'recovery':
        return <RecoveryPage />;
      case 'onboarding':
        return <OnboardingFlow />;
      case 'landing':
      default:
        return <LandingPage />;
    }
  }

  // Se o usuário estiver logado, renderizamos o shell do aplicativo principal
  const renderLoggedInView = () => {
    switch (activeView) {
      case 'workouts':
        return <WorkoutsTab />;
      case 'active-workout':
        return <ActiveWorkoutPage />;
      case 'exercises':
        return <ExerciseLibrary />;
      case 'videos':
        return <EducationalVideos />;
      case 'ai-coach':
        return <AiCoachChat />;
      case 'evolution':
        return <EvolutionDashboard />;
      case 'community':
        return <CommunityFeed />;
      case 'nutrition':
        return <NutritionPage />;
      case 'premium':
        return <PremiumUpgrade />;
      case 'admin':
        return <AdminPanel />;
      case 'planner':
        return <PlannerView />;
      case 'dashboard':
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gym-dark text-white select-none">
      {/* Barra superior de progresso e perfil */}
      <TopBar />

      <div className="flex flex-1 relative">
        {/* Barra lateral desktop */}
        <SideNavigation />

        {/* Conteúdo principal scrollable */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full transition-all duration-300">
          {/* Espaço extra no mobile p/ a bottom nav + safe-area + FAB de treino não cobrirem conteúdo */}
          <div className="pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0">
            {renderLoggedInView()}
          </div>
        </main>
      </div>

      {/* Barra de notificação de treino ativo no background */}
      <WorkoutSheetNotification />

      {/* Floating XP Badge e conquistas */}
      <XPBadgeNotification />

      {/* Unified Global Video Player */}
      <GlobalVideoPlayer />

      {/* Barra inferior de navegação mobile */}
      <BottomNavigation />
    </div>
  );
}
