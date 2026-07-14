'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useGymFlow, XpNotification } from '../providers/GymFlowContext';
import { Award, Zap, X } from 'lucide-react';

// GOAL-15: duração do auto-dismiss por tipo (simples 4s, level up 6s).
const DURATION_MS: Record<XpNotification['kind'], number> = {
  xp: 4000,
  levelup: 6000,
};

const displayText = (n: XpNotification) => {
  if (n.count > 1) {
    // "Série concluída!" consolidada vira "N séries concluídas".
    if (n.text === 'Série concluída!') return `${n.count} séries concluídas`;
    return `${n.text} (${n.count}×)`;
  }
  return n.text;
};

/**
 * GOAL-15: notificações de XP no Treino Ativo. Antes empilhavam sem limite,
 * cobriam a tela e só sumiam com um timer único de 4s que reiniciava a cada
 * novo evento. Agora: no máximo 2 visíveis, eventos repetidos consolidados,
 * auto-dismiss por card e fechamento manual (botão X ou swipe horizontal).
 */
export const XPBadgeNotification = () => {
  const { xpNotifications, dismissXpNotification } = useGymFlow();

  if (xpNotifications.length === 0) return null;

  // Cap defensivo de 2 (o contexto já limita); posicionado abaixo da TopBar,
  // respeitando a safe-area e sem cobrir os campos de série (mais abaixo).
  const visible = xpNotifications.slice(-2);

  return (
    <div
      className="fixed z-50 inset-x-0 flex flex-col items-center gap-2 px-4 pointer-events-none
        top-[calc(4rem+env(safe-area-inset-top))]
        md:inset-x-auto md:items-end md:right-4 md:px-0 md:top-[calc(1rem+env(safe-area-inset-top))]"
    >
      {visible.map((n) => (
        <XpCard key={n.id} notif={n} onDismiss={() => dismissXpNotification(n.id)} />
      ))}
    </div>
  );
};

const XpCard = ({ notif, onDismiss }: { notif: XpNotification; onDismiss: () => void }) => {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const [dragX, setDragX] = useState(0);
  const startXRef = useRef<number | null>(null);

  // Auto-dismiss — reinicia quando createdAt muda (evento consolidado renova o tempo).
  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), DURATION_MS[notif.kind]);
    return () => clearTimeout(timer);
  }, [notif.createdAt, notif.kind]);

  const isLevelUp = notif.kind === 'levelup';
  const Icon = isLevelUp || /🏆|🎓/.test(notif.text) ? Award : Zap;

  const handlePointerDown = (e: React.PointerEvent) => {
    startXRef.current = e.clientX;
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (startXRef.current !== null) setDragX(e.clientX - startXRef.current);
  };
  const endDrag = () => {
    if (Math.abs(dragX) > 80) {
      onDismissRef.current(); // swipe horizontal remove o card
      return;
    }
    startXRef.current = null;
    setDragX(0);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        transform: dragX ? `translateX(${dragX}px)` : undefined,
        opacity: dragX ? Math.max(0, 1 - Math.abs(dragX) / 200) : undefined,
        touchAction: 'pan-y',
      }}
      className="pointer-events-auto w-full max-w-sm md:w-80 glass border border-gym-accent/30 rounded-2xl p-3.5 shadow-2xl flex items-center gap-3 animate-toast-in select-none"
    >
      <div className="bg-gym-accent/20 p-2 rounded-lg text-gym-accent flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white leading-snug">{displayText(notif)}</p>
        <p className="text-xs text-gym-accent font-bold">+{notif.xp} XP{isLevelUp ? '' : ' ganhos'}</p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Fechar notificação"
        className="flex-shrink-0 text-gym-text-muted hover:text-white w-11 h-11 -m-2.5 flex items-center justify-center rounded-lg"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
