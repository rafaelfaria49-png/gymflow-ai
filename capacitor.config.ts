import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

// GOAL-12 & GOAL-MOBILE-002 — Configuração cross-platform Android + iOS (Capacitor 7).
// O WebView carrega os arquivos estáticos gerados por `npm run build:mobile` (pasta `out/`).
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
  ios: {
    // Fundo escuro no WKWebView: evita o flash branco de inicialização no iOS
    backgroundColor: '#09090b',
    contentInset: 'automatic',
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  server: {
    // https://localhost -> contexto seguro (service worker + localStorage
    // persistem entre execuções) e mantém os assets servidos localmente.
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      // Ocultação programática via React após a hidratação da UI
      launchShowDuration: 2000,
      launchAutoHide: false,
      backgroundColor: '#09090b',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // Ícones claros sobre status bar escura (#09090b)
      style: 'DARK',
      backgroundColor: '#09090b',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
