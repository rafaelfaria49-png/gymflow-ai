import type { AppView } from '../providers/GymFlowContext';

export type BackHandler = () => boolean;

export interface BackHandlerEntry {
  id: string;
  handler: BackHandler;
  priority: number;
}

/**
 * Registro de ações prioritárias de retorno (ex.: fechar modais, sheets, alertas).
 * Handlers com maior prioridade executam primeiro; entre prioridades iguais,
 * o último registrado executa primeiro (LIFO).
 */
export class BackActionRegistry {
  private handlers: BackHandlerEntry[] = [];
  private nextId = 1;

  register(handler: BackHandler, priority = 10): () => void {
    const id = `back_handler_${this.nextId++}`;
    this.handlers.push({ id, handler, priority });

    return () => {
      this.handlers = this.handlers.filter((h) => h.id !== id);
    };
  }

  dispatch(): boolean {
    if (this.handlers.length === 0) return false;

    // Invertemos para LIFO (último registrado primeiro), e ordenamos estável por prioridade decrescente
    const sorted = [...this.handlers].reverse().sort((a, b) => b.priority - a.priority);

    for (const entry of sorted) {
      try {
        const handled = entry.handler();
        if (handled) {
          return true;
        }
      } catch (err) {
        console.error('Erro ao executar back handler:', err);
      }
    }

    return false;
  }

  hasHandlers(): boolean {
    return this.handlers.length > 0;
  }

  clear(): void {
    this.handlers = [];
  }
}

export const globalBackActionRegistry = new BackActionRegistry();

export interface BackNavigationPolicyInput {
  currentView: AppView;
  isLoggedIn: boolean;
  hasActiveWorkout: boolean;
  history: AppView[];
  builderReturnView?: AppView;
}

export type BackNavigationPolicyDecision =
  | { type: 'navigate'; targetView: AppView; remainingHistory: AppView[] }
  | { type: 'protect-active-workout'; targetView: 'active-workout'; reason: 'workout-in-progress' }
  | { type: 'exit-app' };

/**
 * Resolve de forma pura e determinística o que o botão Voltar deve fazer
 * quando nenhum overlay/modal capturou o evento.
 */
export function resolveBackNavigationPolicy(
  input: BackNavigationPolicyInput
): BackNavigationPolicyDecision {
  const { currentView, isLoggedIn, hasActiveWorkout, history, builderReturnView } = input;

  // 1. Cenário: Usuário Deslogado
  if (!isLoggedIn) {
    if (currentView !== 'landing') {
      return {
        type: 'navigate',
        targetView: 'landing',
        remainingHistory: [],
      };
    }
    // Raiz deslogada: saída nativa permitida
    return { type: 'exit-app' };
  }

  // 2. Cenário: Construtor de Treino
  if (currentView === 'workout-builder') {
    const targetView = builderReturnView ?? 'planner';
    const remaining = history.filter((v) => v !== 'workout-builder');
    return {
      type: 'navigate',
      targetView,
      remainingHistory: remaining,
    };
  }

  // 3. Cenário: Treino Ativo em execução
  if (currentView === 'active-workout') {
    // Voltar do treino ativo navega para o dashboard mantendo o treino
    // rodando no background (visível pelo WorkoutSheetNotification)
    return {
      type: 'navigate',
      targetView: 'dashboard',
      remainingHistory: history.filter((v) => v !== 'active-workout'),
    };
  }

  // 4. Cenário: Telas internas logadas (workouts, exercises, videos, planner, etc.)
  if (currentView !== 'dashboard') {
    // Se temos histórico recente, voltamos para a tela anterior
    const cleanedHistory = history.filter((v) => v !== currentView);
    const targetView = cleanedHistory.length > 0
      ? cleanedHistory[cleanedHistory.length - 1]
      : 'dashboard';

    return {
      type: 'navigate',
      targetView: targetView ?? 'dashboard',
      remainingHistory: cleanedHistory.slice(0, -1),
    };
  }

  // 5. Cenário: Usuário no Dashboard (nível raiz)
  if (hasActiveWorkout) {
    // PROTEÇÃO MANDATÓRIA: não encerra o app silenciosamente se houver treino ativo
    return {
      type: 'protect-active-workout',
      targetView: 'active-workout',
      reason: 'workout-in-progress',
    };
  }

  // Nível raiz sem pendências nem treino ativo: encerramento nativo
  return { type: 'exit-app' };
}

import { useEffect } from 'react';

/**
 * Hook utilitário para registrar fechamento de modais/overlays quando o botão
 * voltar físico (Android) ou comando de saída for disparado.
 */
export function useBackHandler(active: boolean, onBack: () => void, priority = 20): void {
  useEffect(() => {
    if (!active) return;
    return globalBackActionRegistry.register(() => {
      onBack();
      return true;
    }, priority);
  }, [active, onBack, priority]);
}

