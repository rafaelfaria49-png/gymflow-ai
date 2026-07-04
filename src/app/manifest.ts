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
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
