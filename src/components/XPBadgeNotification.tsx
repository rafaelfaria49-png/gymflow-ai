'use client';

import React, { useEffect } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { Award, Zap } from 'lucide-react';

export const XPBadgeNotification = () => {
  const { xpNotifications, clearXpNotifications } = useGymFlow();

  useEffect(() => {
    if (xpNotifications.length > 0) {
      const timer = setTimeout(() => {
        clearXpNotifications();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [xpNotifications, clearXpNotifications]);

  if (xpNotifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4">
      {xpNotifications.map((notif, idx) => (
        <div
          key={idx}
          className="glass border border-gym-accent/30 rounded-xl p-4 shadow-2xl flex items-center gap-3 animate-bounce"
          style={{ animationDuration: '0.6s' }}
        >
          <div className="bg-gym-accent/20 p-2 rounded-lg text-gym-accent">
            {notif.text.includes('🏆') ? <Award className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">{notif.text}</p>
            <p className="text-xs text-gym-accent font-semibold">+{notif.xp} XP Ganhos</p>
          </div>
        </div>
      ))}
    </div>
  );
};
