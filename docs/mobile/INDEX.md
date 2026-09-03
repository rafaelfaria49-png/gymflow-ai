# Índice de Documentação Mobile & Cross-Platform — GymFlow AI
**ID do Documento:** `docs/mobile/INDEX.md`  
**Última Atualização:** Setembro de 2026  
**Status do Ecossistema:** Android Pronto para Google Play / iOS Pronto para Handoff Mac  

---

## 1. Visão Geral da Arquitetura Mobile

O GymFlow AI adota uma arquitetura híbrida de alto desempenho utilizando **Capacitor 7** sobre uma base de código unificada em **Next.js 16 + React 19 + TypeScript**. A aplicação é empacotada em modo estático (`npm run build:mobile` -> pasta `out/`) e consumida diretamente pelos motores nativos de WebView:
- **Android:** Android System WebView (esquema `https://localhost`)
- **iOS:** WebKit WKWebView (esquema `capacitor://localhost`)

---

## 2. Mapa dos Marcos de Execução (Milestones)

| Documento | Marco (GOAL) | Escopo Principal | Status |
|---|---|---|---|
| [MOBILE_CROSS_PLATFORM_AUDIT_001.md](file:///c:/Projetos/gymflow-ai/docs/mobile/MOBILE_CROSS_PLATFORM_AUDIT_001.md) | `MOBILE-001` | Auditoria inicial de compatibilidade Android & iOS, mapeamento de blockers e estratégia de transição. | Concluído |
| [MOBILE_CROSS_PLATFORM_002.md](file:///c:/Projetos/gymflow-ai/docs/mobile/MOBILE_CROSS_PLATFORM_002.md) | `MOBILE-002` | Fundação nativa iOS (`ios/`), integração de plugins essenciais Capacitor 7 (StatusBar, Keyboard, Splash, App) e alinhamento de Bundle ID. | Concluído |
| [MOBILE_CROSS_PLATFORM_003.md](file:///c:/Projetos/gymflow-ai/docs/mobile/MOBILE_CROSS_PLATFORM_003.md) | `MOBILE-003` | Padronização visual da marca: Master Icon 1024x1024 opaco, Adaptive Icons Android, AppIcon iOS, Splash Screen nativa e safe areas. | Concluído |
| [MOBILE_CROSS_PLATFORM_004.md](file:///c:/Projetos/gymflow-ai/docs/mobile/MOBILE_CROSS_PLATFORM_004.md) | `MOBILE-004` | Hardening de mídia offline, isolamento em `Directory.Data`, reprodução streaming via `convertFileSrc`, exportação via Share Sheet e paridade Web/PWA. | Concluído |
| [MOBILE_CROSS_PLATFORM_005.md](file:///c:/Projetos/gymflow-ai/docs/mobile/MOBILE_CROSS_PLATFORM_005.md) | `MOBILE-005` | Prontidão técnica Android / Google Play Store: elevação para compileSdk/targetSdk 36, suporte 16 KB page size, geração de AAB e Play App Signing. | Concluído |
| [MOBILE_CROSS_PLATFORM_006.md](file:///c:/Projetos/gymflow-ai/docs/mobile/MOBILE_CROSS_PLATFORM_006.md) | `MOBILE-006` | Prontidão técnica iOS / App Store: unificação e registro de Privacy Manifest, Info.plist de menor privilégio, ATS estrito, testes estáticos e scorecard. | Concluído |

---

## 3. Guias Operacionais de Publicação

- [IOS_MAC_HANDOFF.md](file:///c:/Projetos/gymflow-ai/docs/mobile/IOS_MAC_HANDOFF.md) — Guia de execução no Mac, abertura de workspace, configuração de assinatura, build em simulador/device, roteiro de smoke test de 19 itens e submissão App Store Connect.
