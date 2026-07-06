# Android Build (Capacitor) — GymFlow AI

Empacota o GymFlow AI como app Android local (APK de debug) para testar no
celular sem abrir URL no navegador. O WebView carrega o **export estático** do
Next (`out/`) — 100% offline dos arquivos locais, sem servidor, sem
`localhost`, sem `192.168.x.x`.

> Pré-requisitos: **JDK 17** e **Android SDK** (platform-tools + platform
> android-35/36 + build-tools). Para gerar APK pela linha de comando basta o
> SDK e o `ANDROID_HOME`/`local.properties`; o Android Studio só é necessário
> para editar/rodar o projeto pela IDE ou usar o emulador.

## 1. Gerar o build mobile (pasta `out/`)

```bash
npm run build:mobile
```

Roda `next build` com `BUILD_TARGET=mobile`, que liga `output: "export"` e
gera `out/` (HTML/CSS/JS + `assets/`, `icons/`, `manifest.webmanifest`, `sw.js`).
O build web normal (`npm run build`) **não muda** — continua padrão do Next.

## 2. Sincronizar com o projeto Android

```bash
npm run cap:sync
```

Faz `build:mobile` + `cap sync android` (copia `out/` para
`android/app/src/main/assets/public` e atualiza os plugins nativos).

## 3. Abrir no Android Studio (opcional)

```bash
npm run android:open
```

Na IDE: **Run ▶** para instalar no emulador/dispositivo, ou
**Build → Build Bundle(s)/APK(s) → Build APK(s)** para gerar o APK.

## 4. Gerar o APK de debug pela linha de comando

```bash
npm run android:build
```

Roda o wrapper do Gradle (`gradlew assembleDebug`). O APK sai em:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

> Se o Gradle reclamar do SDK, confira `android/local.properties`
> (`sdk.dir=...`) ou a variável de ambiente `ANDROID_HOME`.

## 5. Instalar no celular

1. Ative **Depuração USB** no Android (Opções do desenvolvedor) e conecte o
   cabo — OU copie o `app-debug.apk` para o celular e abra-o (permita
   "instalar de fontes desconhecidas").
2. Via ADB (com o celular conectado):

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

O `-r` reinstala por cima mantendo os dados (localStorage preservado).

## 6. Atualizar o app depois de mudar o código

```bash
npm run cap:sync          # rebuild do out/ + copia p/ o Android
npm run android:build     # novo APK
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Um único comando encadeado: `npm run cap:sync && npm run android:build`.

## 7. Limitações conhecidas

- **APK de debug**, não assinado para produção (`webContentsDebuggingEnabled`
  ligado). Não serve para publicar; serve para testar.
- **Sem backend**: tudo é local (localStorage). Nada sincroniza entre
  aparelhos. Zerar dados do app / desinstalar apaga tudo.
- O **service worker** é redundante dentro do WebView (os assets já são locais),
  mas não atrapalha — segue com fallback offline da shell.
- Requer refazer `cap:sync` a cada mudança de código web (o WebView usa o
  `out/` copiado, não o dev server).
- `poc-3d` entra no build por ser rota do app, mas não tem `.glb` ativo
  (placeholder honesto) — não pesa no APK.

## 8. APK local × PWA × Play Store

| | APK local (este doc) | PWA ("Adicionar à tela") | Play Store |
|---|---|---|---|
| Instalação | copiar/`adb install` | pelo navegador | loja oficial |
| Assinatura | debug (não assinado p/ release) | n/a | release assinado |
| Distribuição | manual (você mesmo) | qualquer navegador via URL | pública/revisada |
| Atualização | reinstalar APK | recarregar a página/SW | update pela loja |
| Uso | testar como app real no celular | testar rápido pelo navegador | produção |

O **PWA** (GOAL-10) continua funcionando por URL. O **APK** é o mesmo app
empacotado num WebView para instalar/testar como aplicativo. **Play Store**
exige assinatura de release, ícones/políticas e ainda backend — fora do escopo
do Lote 1.
