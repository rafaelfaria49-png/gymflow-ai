# Relatório Técnico: Recuperação Segura de Armazenamento Híbrido no Android

**ID do Documento:** `docs/mobile/ANDROID_HYBRID_STORAGE_RECOVERY_021.md`  
**GOAL:** `GYMFLOW-ANDROID-HYBRID-STORAGE-RECOVERY-021`  
**Data:** 04 de Setembro de 2026  
**Status:** IMPLEMENTADO & VALIDADO (Pronto para Instalação no Aparelho Real)  
**Branch de Destino:** `fix/android-hybrid-storage-recovery-021` (PR direcionado para `master`)  
**Package:** `com.gymflowai.app`  

---

## 1. Contexto e Diagnóstico da Causa-Raiz

### 1.1. Sintoma Observado no Aparelho Real (Samsung Galaxy S22 — SM-S901E)
Ao executar o GymFlow AI no aparelho físico (instalado preservando dados com `adb install -r`), a interface exibia permanentemente o banner do componente `StorageRecoveryNotice.tsx`:
- *"Recuperação segura necessária"*
- *"Armazenamento local não disponível para concluir recuperação"*
- *"Dados preservados, carregamento suspenso, autosave pausado"*
- *"Armazenamento híbrido não pôde ser validado"*

### 1.2. Rastreamento e Causa-Raiz no Runtime
1. No boot, `GymFlowContext.tsx` invoca `runStorageBootRecoveryOnce()`.
2. O orquestrador delega para `recoverLogicalStorageAdministrationV2()` em `storage-administrative-recovery.ts`.
3. `inspectStorageAdministration()` em `storage-admin-runtime.ts` (linha 663) avalia:
   ```ts
   const activeGenerationId = snapshot.metadata?.activeGeneration ?? null;
   if (!activeGenerationId) {
     return {
       ...base,
       state: unavailableState('core-invalid', 'Não existe geração ativa de histórico.'),
     };
   }
   ```
4. Quando `metadata.activeGeneration` não está preenchido (cenário pós-migração interrompida ou assincronia de cutover), `recoverLogicalStorageImportV2()` retorna:
   ```ts
   { ok: false, reason: 'administration-unavailable', steps: 0, operationId: null, generationId: null }
   ```
5. `classifyInitialAdministrationUnavailable()` lê o envelope físico de `localStorage.getItem(STORAGE_KEY)`.
6. Como o envelope é `v2` válido com `generationId` indicado, o orquestrador classificava como `blocked('blocked-storage-unavailable', false, 2)`.
7. O `GymFlowContext` recebia esse resultado, bloqueava a hidratação e abortava antes de chamar `runtime.hydrate()`, deixando o app em modo de recuperação travado, embora os dados estivessem 100% íntegros.

---

## 2. Solução Implementada: Reconciliação Segura de Boot

A reconciliação segura foi introduzida estritamente dentro de `storage-boot-recovery.ts`, em conformidade total com as 11 regras arquiteturais do GymFlow:

### 2.1. Princípio da Não-Destrutividade e Prova Física
- **Candidato 1 (Geração Existente):** Se `targetGenId` existe fisicamente em `WORKOUT_HISTORY_STORE` e sua prova criptográfica (`verifyHistoryGeneration()`) atesta integridade dos registros e do manifest, a geração é comprovada.
- **Candidato 2 (Snapshot Legado Verificado):** Se a geração não estiver presente, mas `readLegacySnapshot()` recuperar um snapshot verificado em `LEGACY_SNAPSHOTS_STORE` com integridade de checksum comprovada, as sessões legadas são extraídas.
- **Candidato 3 (Manifest de Histórico Vazio):** Se existir manifest íntegro com `sessionCount === 0` e digest correspondente a `EMPTY_GENERATION_DIGEST`, o histórico vazio é comprovado.
- **Regra 10 (Ausência física continua ausência):** Se nenhuma das 3 fontes puder ser matematicamente e fisicamente comprovada, a recuperação automática é **recusada** e o sistema falha fechado (`fail-closed`), mantendo `blocked-storage-unavailable` sem inventar ou descartar dados.

### 2.2. Protocolo de Transição Atômica (Regra 9 e Regra 11)
1. **Backup Físico:** Antes de qualquer alteração, o estado bruto do `localStorage` é salvo em `${KEY}${HYBRID_CORE_BACKUP_SUFFIX}` e confirmado por readback imediato.
2. **Ativação Segura:**
   - Se `hasHistoryGeneration(targetGenId)` for verdadeiro, tenta ativação direta escrevendo `migrationGeneration`, ativando e concluindo os metadados.
   - Caso contrário, prepara uma nova geração com `prepareHistoryGeneration(provenSessions)`, verifica integralmente o snapshot gerado e ativa a geração.
3. **Persistência de Core:** O core do `localStorage` é atualizado com `saveHybridCoreResult()`, garantindo atomicidade e readback.
4. **Confirmação e Reread:**
   - Metadados relidos do IndexedDB: `activeGeneration === activeGenId`, `migrationGeneration === null`, `migrationStatus === 'completed'`.
   - Administração relida: `inspectStorageAdministration()` retorna status `'ready'`.
5. **Resultado:** Retorna `ready('ready-after-settled', false)`, liberando a hidratação subsequente para operar em modo híbrido v2 nativo.

### 2.3. Respeito às Guardas Arquiteturais
- O orquestrador não contém nenhuma das palavras/ações proibidas (`restoreStorage`, `rollbackStorage`, `resetStorage`, `startFresh`, `clearInactiveGeneration`, `replaceHistory`).
- O teste arquitetural existente em `storage-boot-recovery.test.ts` (linha 1023) continua passando 100%.

---

## 3. Matriz de Validação e Testes Automatizados

| Suíte de Testes | Quantidade | Resultado | Destaques |
|---|---|---|---|
| `src/lib/storage-boot-recovery.test.ts` | 66 testes | **PASS** (66/66) | Guardas arquiteturais, idempotência e compatibilidade v1/v2 preservadas |
| `src/lib/storage-android-recovery.test.ts` | 5 testes | **PASS** (5/5) | Candidato 1, Candidato 2, Candidato 3, Regra 10 e Idempotência validados |
| `src/providers/GymFlowContext.storage-recovery.test.tsx` | 21 testes | **PASS** (21/21) | Diagnóstico em console, isolamento de autosave e proteção contra remontagem |
| `npx tsc --noEmit` | Workspace | **PASS** (Exit 0) | Zero erros estáticos de TypeScript |
| `npm run build:mobile` | Next.js 16 | **PASS** (Exit 0) | Bundle estático gerado com Turbopack em `out/` |
| `npx cap sync android` | Capacitor 7 | **PASS** (Exit 0) | Sincronização de 7 plugins e assets em `android/app/src/main/assets` |
| `npm run android:build` | Gradle assembleDebug | **PASS** (Exit 0) | APK gerado em `android/app/build/outputs/apk/debug/app-debug.apk` |

---

## 4. Procedimento de Instalação e Teste no Aparelho Real

Para aplicar a atualização no Samsung Galaxy S22 sem perda de dados:

1. **Conectar o smartphone via USB** com a Depuração USB ativada (ou via ADB Wi-Fi).
2. **Confirmar reconhecimento pelo ADB:**
   ```powershell
   adb devices -l
   ```
3. **Instalar preservando todos os dados locais anteriores (SEM UNINSTALL, SEM CLEAR):**
   ```powershell
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```
4. **Iniciar o aplicativo:**
   ```powershell
   adb shell am start -n com.gymflowai.app/com.gymflowai.app.MainActivity
   ```
5. **Critérios de Aceite no Aparelho:**
   - O banner de *"Recuperação segura necessária"* desaparece automaticamente.
   - Os dados do perfil, planos semanais, treinos customizados e histórico são carregados intactos.
   - O autosave volta ao estado ativo e funcional.
   - Ao alterar qualquer detalhe (ex: nota de treino ou perfil) e fechar/reabrir o app, as alterações permanecem salvas.
   - Nos logs de inicialização (`adb logcat -s Capacitor/Console`), a mensagem `[GymFlow Storage Boot Diagnosis]` confirma `outcome: ready-after-settled` ou `ready-no-operation` no segundo boot.
