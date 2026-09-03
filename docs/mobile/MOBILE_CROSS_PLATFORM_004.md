# MOBILE_CROSS_PLATFORM_004 — Hardening de Mídia Offline, Filesystem, Backups e WKWebView

**Status:** Concluído  
**Data:** 2026-09-02  
**Dependências do Capacitor 7:**
- `@capacitor/filesystem`: `^7.1.8`
- `@capacitor/file-transfer`: `^1.0.12`
- `@capacitor/share`: `^7.0.4`

---

## 1. Visão Geral e Contexto

No `MOBILE-002`, o GymFlow foi estruturado para compilar e executar nativamente no Android e no iOS via Capacitor 7. No `MOBILE-003`, ativos de splash, ícones e a identidade visual escura foram normalizados.

A auditoria arquitetural inicial detectou que certos recursos fundamentais dependiam de APIs do navegador incompatíveis ou instáveis nos WebViews nativos (Android WebView e WKWebView no iOS):
1. **Vídeo offline via Cache Storage e Blob URL:** `URL.createObjectURL(blob)` não lida de forma eficiente com reprodução contínua e range requests de streaming em WebViews e pode sofrer com limitações de memória e CORS local.
2. **Exportação de backup via `<a download>`:** `document.createElement('a').download` é ignorado pelo motor nativo de download do WebView sem ganchos ou listeners customizados.
3. **Privacidade Apple (iOS):** O acesso a APIs de filesystem sem o devido `PrivacyInfo.xcprivacy` impede aprovação na App Store Connect.

O objetivo do **MOBILE-004** foi tornar toda a camada de mídia offline e exportação de backups 100% compatível com Android e iOS nativos, **preservando integralmente** o comportamento da Web/PWA existente.

---

## 2. Matriz de Arquitetura: Web versus Nativo

| Recurso | Web / PWA | Android & iOS (Capacitor Nativo) |
| :--- | :--- | :--- |
| **Driver de Storage** | `WebMediaStorageDriver` (`webStorage.ts`) | `NativeMediaStorageDriver` (`nativeStorage.ts`) |
| **Tecnologia de Armazenamento** | Cache Storage API (`caches.open('gymflow-media-v1')`) | `@capacitor/filesystem` (`Directory.Data`) |
| **Namespace Isolado** | Cache nomeado `gymflow-media-v1` | Subdiretório privado `gymflow-media/` |
| **Estratégia de Download** | `fetch(url)` -> `cache.put(url, response)` | `@capacitor/file-transfer` -> `downloadFile` para `.tmp` |
| **Nomenclatura do Arquivo** | URL remota canônica | Determinística: `${assetId}_v${version}.mp4` |
| **Formato de Reprodução** | `URL.createObjectURL(blob)` (Blob URL) | `Capacitor.convertFileSrc(fileUri)` (File Source URL) |
| **Invalidação de Versão** | Prune contra manifest ativo | Prune de versões anteriores de `${assetId}_v*.mp4` e `.tmp` |
| **Exportação de Backup** | `<a download="...">` com Blob URL | `Directory.Cache` + `@capacitor/share` (Share Sheet) |
| **Importação de Backup** | `<input type="file">` | `<input type="file">` (suportado nativamente no WebView) |
| **Service Worker** | Habilitado em produção | **Desabilitado** (`isCapacitorNative() === true`) |

---

## 3. Diretórios e Permissões Nativas

### 3.1. Diretórios Utilizados
- **Mídia Offline:** `Directory.Data` (`context.filesDir` no Android / `Library/NoCloud` ou `Documents` privado no iOS), dentro do subdiretório `gymflow-media/`.
  - Motivo: Área privada do aplicativo, excluída automaticamente na desinstalação.
  - Zero exposição pública indesejada e zero interferência com dados pessoais do usuário.
- **Exportação Temporária de Backup:** `Directory.Cache` (`context.cacheDir` no Android / `Caches` no iOS).
  - Motivo: Já registrado no `file_paths.xml` do Android (`<cache-path name="my_cache_images" path="." />`), dispensando alterações na configuração do `FileProvider`.

### 3.2. Política Estrita de Permissões
- Não foram adicionadas permissões de armazenamento amplo (`READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` ou `MANAGE_EXTERNAL_STORAGE`).
- O `AndroidManifest.xml` permanece enxuto com apenas:
  ```xml
  <uses-permission android:name="android.permission.INTERNET" />
  ```
- No iOS, nenhuma chave invasiva de privacidade foi adicionada ao `Info.plist`.

---

## 4. Estratégia de URI e Reprodução no Player

No ambiente nativo, navegadores modernos e WebViews (WebKit e Chromium) tratam o protocolo `file://` com fortes restrições de CORS e segurança entre origens. A criação de Blob URLs de vídeos inteiros em memória causa picos excessivos de RAM.

A solução oficial adotada:
1. Resolução do caminho nativo via `Filesystem.getUri({ directory: Directory.Data, path: 'gymflow-media/asset.mp4' })`, obtendo uma URI do tipo `file:///data/user/0/com.gymflowai.app/files/gymflow-media/asset.mp4`.
2. Conversão da URI para o esquema de streaming do Capacitor via `Capacitor.convertFileSrc(uri)`:
   - Android: `https://localhost/_capacitor_file_/data/user/0/.../asset.mp4`
   - iOS: `capacitor://localhost/_capacitor_file_/var/mobile/.../asset.mp4`
3. O player `<video>` consome essa URL diretamente, com suporte a streaming, seek e byte-range requests nativos.
4. **Regra de ouro:** Nunca se utiliza Blob URL para vídeos no runtime nativo.

---

## 5. Integridade do Cache e Prevenção de Corrupção

1. **Download Atômico / Anti-Interrupção:**
   - O arquivo é baixado primeiramente com a extensão temporária `.tmp` (`gymflow-media/${filename}.tmp`).
   - Após o término do download, o arquivo temporário é inspecionado via `Filesystem.stat`.
   - Se o arquivo não existir ou tiver tamanho 0 bytes, é imediatamente excluído e a operação falha.
   - Somente após a validação completa o arquivo é renomeado atómicamente (`Filesystem.rename`) para o nome final `${filename}`.
   - Downloads cancelados, abortados ou interrompidos nunca constam como concluídos.
2. **Invalidação de Versão (Manifest Bump):**
   - Na atualização de versão de um asset (ex.: `v1` para `v2`), a rotina `pruneObsolete` detecta a existência do arquivo anterior e o remove, evitando acúmulo de arquivos órfãos.
3. **Fallback Resiliente:**
   - Se o arquivo físico for deletado pelo sistema operacional, `Filesystem.stat` falha e o driver reporta `isCached = false`, retornando a URL do CDN.
   - Caso ocorra falha de decodificação no player, o evento `onError` desvia instantaneamente para a cadeia de fallback: Tier 2 (sequência técnica de frames) ou Tier 3 (thumbnail).
4. **Limpeza Seletiva (`clearMediaCache`):**
   - O comando de limpeza atua estritamente sobre os arquivos contidos em `gymflow-media/`. Nenhum arquivo de preferências, banco de dados ou estado do usuário é tocado.

---

## 6. Fluxo de Exportação e Compartilhamento de Backup

1. **Web:**
   - Mantém `downloadTextFile` criando um Blob em memória e disparando `<a download="gymflow-backup-....json">`.
2. **Android & iOS:**
   - Grava o conteúdo JSON do backup em `Directory.Cache` com o nome determinístico do backup.
   - Obtém a URI local `file://`.
   - Invoca a folha de compartilhamento do sistema operacional via `Share.share({ url: fileUri, title: filename, dialogTitle: 'Exportar Backup GymFlow' })`.
   - Permite que o usuário envie o arquivo para o Google Drive, WhatsApp, E-mail, iCloud Files ou salve no disco.
   - Agenda uma limpeza de segurança do arquivo temporário no cache.
3. **Importação:**
   - O input padrão `<input type="file" accept=".json,application/json">` do `AdminPanel.tsx` é suportado de forma nativa por Android WebChromeClient e iOS WKWebView. Nenhuma intervenção no formato lógico de backup ou no `schemaVersion` foi necessária.

---

## 7. Apple Privacy Manifest (`PrivacyInfo.xcprivacy`)

Para atender às diretrizes da Apple em vigor desde maio de 2024 para o `@capacitor/filesystem`:
- **Arquivo:** `ios/App/PrivacyInfo.xcprivacy` (e espelho em `ios/App/App/PrivacyInfo.xcprivacy`)
- **Categoria Registrada:** `NSPrivacyAccessedAPICategoryFileTimestamp`
- **Razão Oficial:** `C617.1` ("Acessar os timestamps de arquivos dentro do próprio container ou sandbox do aplicativo para validação e integridade local").
- Nenhuma outra API de rastreamento ou dados de telemetria de terceiros foi declarada indevidamente.

---

## 8. Cobertura de Testes

Foram implementadas suítes dedicadas de testes automatizados com mocks de Capacitor e Cache Storage:
- `src/domain/media/mediaCache.crossplatform.test.ts`:
  - Cache hit/miss no Web e no Nativo;
  - Bloqueio de download para status `draft` (QA Gate);
  - Geração de Blob URL na Web e `convertFileSrc` no Nativo;
  - Validação de download atômico com `.tmp` e rename;
  - Limpeza de arquivos temporários em download interrompido ou vazio (0 bytes);
  - Invalidação automática de versão obsoleta em manifest bump;
  - Limpeza isolada e seletiva no namespace `gymflow-media`;
  - Seleção dinâmica do driver conforme o ambiente (`isCapacitorNative()`).
- `src/lib/storage-export.crossplatform.test.ts`:
  - Execução de download via `<a>` e Blob URL na Web;
  - Gravação em `Directory.Cache` e acionamento de `Share.share` no Nativo;
  - Limpeza agendada de temporários no cache nativo;
  - Tratamento resiliente de cancelamento pelo usuário no share sheet.

---

## 9. Limitações Conhecidas e Próximos Passos (MOBILE-006)

- **Ambiente de Desenvolvimento Windows:**
  - A validação do iOS foi realizada no nível estrutural, estático, TypeScript, sincronização (`cap sync ios`) e integridade do manifesto de privacidade.
  - O smoke test real de reprodução de vídeo em dispositivo físico iPhone/iPad com WKWebView está formalmente registrado como dependência da fase **MOBILE-006** (esteira de homologação iOS em macOS).
