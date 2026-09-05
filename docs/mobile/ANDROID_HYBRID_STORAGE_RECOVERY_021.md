# Relatório Técnico: Recuperação Segura de Armazenamento Híbrido no Android

**ID do Documento:** `docs/mobile/ANDROID_HYBRID_STORAGE_RECOVERY_021.md`  
**GOAL:** `GYMFLOW-ANDROID-HYBRID-STORAGE-RECOVERY-021B`  
**Data:** 04 de Setembro de 2026  
**Status:** IMPLEMENTADO & VALIDADO (Incorporação do Caso Físico Real e Candidato 4)  
**Branch de Destino:** `fix/android-hybrid-storage-recovery-021` (PR #26 direcionado para `master`)  
**Package:** `com.gymflowai.app`  

---

## 1. Contexto e Diagnóstico da Causa-Raiz

### 1.1. Sintoma Observado no Aparelho Real (Samsung Galaxy S22 — SM-S901E)
Ao executar o GymFlow AI no aparelho físico (instalado preservando dados com `adb install -r`), a interface exibia permanentemente o banner do componente `StorageRecoveryNotice.tsx`:
- *"Recuperação segura necessária"*
- *"Armazenamento local não disponível para concluir recuperação"*
- *"Dados preservados, carregamento suspenso, autosave pausado"*
- *"Armazenamento híbrido não pôde ser validado"*

### 1.2. Rastreamento e Auditoria Física dos Dados do Aparelho
Durante a auditoria física via extração de dados do WebView (`Local Storage/leveldb` e `IndexedDB/leveldb`), foram identificados os seguintes fatos:
1. **LocalStorage Principal (`gymflow:state:v1`):**
   - Envelope físico `v2` válido.
   - `historyStorage.generationId`: `"generation-4317ec26-ae8c-4e03-8c00-dd1a955d7895"`.
   - Dados de perfil, programas customizados, plano semanal e exercícios intactos.
2. **IndexedDB (`gymflow-history`):**
   - `metadata.migrationStatus`: `"not-started"`.
   - `metadata.activeGeneration`: `null`.
   - Stores `workoutHistory`, `legacySnapshots` e `generationManifests`: vazias (zero registros).
3. **LocalStorage Backup (`gymflow:state:v1:backup`):**
   - Envelope físico `v1` válido e parseável.
   - `workoutHistory`: `[]` (array válido).
   - Dados de domínio idênticos ao core `v2`.

### 1.3. Causa da Falha da Primeira Tentativa (HEAD `b3fb598`)
A primeira implementação do PR #26 avaliava exclusivamente 3 candidatos dentro do IndexedDB:
- Candidato 1: Geração existente e íntegra no IndexedDB.
- Candidato 2: Snapshot legado íntegro em `legacySnapshots` do IndexedDB.
- Candidato 3: Manifest de histórico vazio em `generationManifests` do IndexedDB.

Como o IndexedDB do aparelho estava completamente em estado `not-started` com stores vazias, nenhum dos 3 candidatos foi satisfeito. Conforme a regra de fail-closed, o reconciliador retornou `null`, resultando em `blocked-storage-unavailable`. A primeira implementação falhou no aparelho real por não contemplar a evidência física existente no backup v1 do `localStorage`.

---

## 2. Solução Definitiva: Candidato 4 (`VERIFIED_LOCAL_V1_BACKUP`)

A solução foi expandida em `src/lib/storage-boot-recovery.ts` para reconciliar o estado órfão a partir do backup físico v1 comprovado, sem comprometer as guardas de segurança.

### 2.1. Requisitos e Validação do Backup v1
O backup localizado em `${KEY}${STORAGE_BACKUP_SUFFIX}` (`gymflow:state:v1:backup`) é submetido a validação rigorosa:
1. Presença física e parsing sem erros.
2. Envelope físico `v1` (`parsePhysicalEnvelope(raw).version === 1`).
3. Formato `PersistedState` válido e `workoutHistory` comprovadamente array.
4. Normalização e migração sem perdas através de `normalizeSessionState()`.

### 2.2. Prova Estrita de Linhagem (Lineage Proof)
Antes de autorizar o uso do histórico do backup, o sistema executa a função pura `verifyBackupV1Lineage(backupData, coreData)`.
- Todos os domínios canônicos são comparados:
  - `user` (id, nome, email, etc.)
  - `gymProfile`
  - `weeklyPlan`
  - `customPrograms`
  - `activeWorkout`
  - `weightHistory`
  - `measurementsHistory`
  - `nutrition`
  - `achievements`, `challenges`, `favoriteExercises`, `recentlyViewedVideoIds`
- Somente diferenças estruturais inerentes à migração `v1 → v2` são permitidas:
  - `workoutHistory` presente no v1 e ausente no core v2.
  - `historyStorage` presente no core v2 e ausente no v1.
- Qualquer divergência real em dados de negócio invalida o candidato e força `fail-closed` (`blocked-storage-unavailable`).

### 2.3. Sequência de Transição Segura e Não-Destrutiva
1. **Preservação Pré-Mutação:** Confirmação do backup v1 existente. O backup de segurança adicional é gravado em `${KEY}${HYBRID_CORE_BACKUP_SUFFIX}` com readback imediato, sem jamais sobrescrever o backup v1 original.
2. **Snapshot Legado no IndexedDB:** O backup v1 é persistido no adapter IndexedDB via `saveLegacySnapshot(candidateBackupRaw)`.
3. **Preparação e Ativação da Geração:**
   - As sessões comprovadas do backup v1 (sejam vazias `[]` ou com treinos históricos) são preparadas via `prepareHistoryGeneration(provenSessions)`.
   - Snapshot e manifest gerados são integralmente verificados (`verifyHistoryGeneration()`).
   - Ativação atômica via `activateHistoryGeneration()` e finalização dos metadados (`migrationStatus: 'completed'`).
4. **Alinhamento do Core v2:**
   - O core no `localStorage` é alinhado com o `generationId` ativado e salvo via `saveHybridCoreResult()`.
   - Readback atesta consistência do envelope v2.
5. **Inspeção de Administração:** `inspectStorageAdministration()` é invocado e atesta status `'ready'`.
6. **Resultado:** Retorna `ready('ready-after-settled', false)`, liberando a hidratação e desbloqueando o autosave.
7. **Idempotência no Segundo Boot:** Em reinicializações subsequentes, o IndexedDB já possui a geração ativa e metadados concluídos, retornando diretamente `ready('ready-no-operation', false)` (`HYBRID_RECOVERY_REPEATS = NO`).

---

## 3. Matriz Completa de Testes Automatizados

| Suíte de Testes | Testes | Resultado | Cobertura / Destaques |
|---|---|---|---|
| `src/lib/storage-boot-recovery.test.ts` | 66 | **PASS** (66/66) | Guardas arquiteturais, ausência de verbos proibidos, reconciliação genérica |
| `src/lib/storage-android-recovery.test.ts` | 20 | **PASS** (20/20) | Fixture física exata do Samsung SM-S901E, sessões reais, 10 testes negativos de divergência e formato, pure lineage proof |
| `src/providers/GymFlowContext.storage-recovery.test.tsx` | 21 | **PASS** (21/21) | Barreira de recuperação, integridade do autosave, diagnóstico formatado em logcat |
| **Total Workspace (`npm test`)** | **2.655** | **PASS** (2655/2655, 110 suítes) | **Zero falhas**, exit code 0 |
| `npx tsc --noEmit` | Workspace | **PASS** (Exit 0) | Zero erros de tipagem estática |
| `npm run build:mobile` | Next.js 16 | **PASS** (Exit 0) | Build estático exportado com Turbopack |
| `npx cap sync android` | Capacitor 7 | **PASS** (Exit 0) | Assets sincronizados com sucesso |
| `npm run android:build` | Gradle | **PASS** (Exit 0) | APK gerado em `android/app/build/outputs/apk/debug/app-debug.apk` |

---

## 4. Auditoria de Instalação e Teste no Aparelho Samsung SM-S901E

1. **Instalação Canônica:**
   - Executado exclusivamente `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.
   - Proibição estrita respeitada: nenhum `adb uninstall`, nenhum `pm clear`, nenhuma limpeza manual de storage.
2. **Diagnóstico de Inicialização:**
   - `[GymFlow Storage Boot Diagnosis]` serializado em formato JSON estruturado no console do Capacitor.
   - Outcome comprovado: transição segura de estado órfão para pronto.
3. **Persistência e Autosave:**
   - Autosave liberado após recuperação com sucesso.
   - Idempotência validada: reinicializações subsequentes não executam recovery redundante.
