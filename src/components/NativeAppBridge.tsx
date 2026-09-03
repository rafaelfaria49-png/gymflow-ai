'use client';

import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { useGymFlow } from '../providers/GymFlowContext';
import { useToast } from './ui/Toast';
import { isCapacitorNative, isCapacitorAndroid } from '../lib/platform';
import { globalBackActionRegistry, resolveBackNavigationPolicy } from '../lib/back-navigation';

export function NativeAppBridge() {
  const {
    activeView,
    setActiveView,
    user,
    activeWorkout,
    viewHistory,
    popViewHistory,
    builderReturnView,
  } = useGymFlow();
  const toast = useToast();

  // Refs atualizados para o listener do botão voltar não capturar closures desatualizadas
  const stateRef = useRef({
    activeView,
    user,
    activeWorkout,
    viewHistory,
    builderReturnView,
  });

  useEffect(() => {
    stateRef.current = {
      activeView,
      user,
      activeWorkout,
      viewHistory,
      builderReturnView,
    };
  }, [activeView, user, activeWorkout, viewHistory, builderReturnView]);

  // Configuração inicial de plugins nativos (StatusBar, Keyboard, SplashScreen)
  useEffect(() => {
    if (!isCapacitorNative()) return;

    // Status Bar escura com ícones claros (#09090b)
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {
      /* noop em plataformas parciais */
    });

    if (isCapacitorAndroid()) {
      StatusBar.setBackgroundColor({ color: '#09090b' }).catch(() => {
        /* noop */
      });
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {
        /* noop */
      });
    }

    // Keyboard com redimensionamento de corpo (evita salto de viewport)
    Keyboard.setResizeMode({ mode: KeyboardResize.Body }).catch(() => {
      /* noop */
    });

    // SplashScreen: esconde com fade suave após carregamento da aplicação
    const timer = setTimeout(() => {
      SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {
        /* noop */
      });
    }, 150);

    return () => clearTimeout(timer);
  }, []);

  // Listener do botão físico Voltar do Android (@capacitor/app)
  useEffect(() => {
    const handleBackButtonEvent = () => {
      // 1. Modais e overlays registrados têm prioridade máxima de fechamento
      if (globalBackActionRegistry.dispatch()) {
        return;
      }

      // 2. Avalia a política de navegação conforme as regras do GymFlow
      const current = stateRef.current;
      const decision = resolveBackNavigationPolicy({
        currentView: current.activeView,
        isLoggedIn: !!current.user,
        hasActiveWorkout: !!current.activeWorkout,
        history: current.viewHistory,
        builderReturnView: current.builderReturnView,
      });

      switch (decision.type) {
        case 'navigate':
          popViewHistory();
          setActiveView(decision.targetView);
          break;

        case 'protect-active-workout':
          toast.info('Treino em andamento! Finalize ou cancele a sessão antes de sair.');
          setActiveView('active-workout');
          break;

        case 'exit-app':
          if (isCapacitorNative()) {
            CapApp.exitApp().catch(() => {
              /* noop */
            });
          }
          break;
      }
    };

    if (isCapacitorNative()) {
      const listenerPromise = CapApp.addListener('backButton', handleBackButtonEvent);
      return () => {
        listenerPromise.then((handle) => handle.remove()).catch(() => {});
      };
    }

    // Paridade na Web/Desktop: tecla ESC aciona os back handlers (fechar modais)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        globalBackActionRegistry.dispatch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [popViewHistory, setActiveView, toast]);

  return null;
}
