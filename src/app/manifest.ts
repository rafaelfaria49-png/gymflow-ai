import type { MetadataRoute } from 'next';

// PWA manifest (App Router file convention — Next 16).
// Permite "Adicionar à tela inicial" no celular para teste em modo standalone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GymFlow AI — Treino Inteligente',
    short_name: 'GymFlow AI',
    description:
      'Treinos adaptados por IA, planejador semanal, técnica e evolução. App mobile-first para teste real.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#09090b',
    theme_color: '#09090b',
    categories: ['health', 'fitness', 'lifestyle'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}
