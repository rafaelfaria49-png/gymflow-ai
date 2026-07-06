import type { CapacitorConfig } from '@capacitor/cli';

// GOAL-12 — Configuração do app Android local (Capacitor).
// O WebView carrega os arquivos estáticos gerados por `npm run build:mobile`
// (pasta `out/`). Nenhum servidor externo, localhost ou 192.168.x.x envolvido.
const config: CapacitorConfig = {
  appId: 'com.gymflowai.app',
  appName: 'GymFlow AI',
  webDir: 'out',
  android: {
    // Fundo escuro do WebView: evita o flash branco no boot e casa com o
    // design system (dark + verde-lima). Mesmo tom do background_color do PWA.
    backgroundColor: '#09090b',
    // Permite inspecionar o WebView via chrome://inspect durante o
    // desenvolvimento/teste do APK de debug.
    webContentsDebuggingEnabled: true,
  },
  server: {
    // https://localhost -> contexto seguro (service worker + localStorage
    // persistem entre execuções) e mantém os assets servidos localmente.
    androidScheme: 'https',
  },
};

export default config;
