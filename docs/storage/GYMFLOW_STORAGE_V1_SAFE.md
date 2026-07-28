# GymFlow Storage v1 seguro

## Escopo e fonte de verdade

O GymFlow continua local-first e offline. A única fonte de verdade é:

```json
{
  "v": 1,
  "savedAt": "2026-07-16T12:00:00.000Z",
  "data": {}
}
```

- Chave principal: `gymflow:state:v1`
- Backup rolante: `gymflow:state:v1:backup`
- Última quarentena: `gymflow:state:v1:quarantine`
- Versão atual: `CURRENT_STORAGE_VERSION = 1`
- Backend físico: `localStorage`

Não há `v: 2`, sincronização remota ou mudança no shape de treino. A fundação
IndexedDB do GOAL-17B-002A existe de forma desconectada, mas ainda não participa
da hidratação, do autosave, do backup ou da fonte de verdade do aplicativo.

## Contratos de load e save

`loadStateResult<T>` retorna um status discriminado:

- `ok`: envelope e payload válidos;
- `empty`: chave ausente;
- `legacy`: reservado ao fluxo compatível de migração;
- `corrupt`: JSON, envelope ou payload estruturalmente inválido;
- `unsupported-version`: `v` diferente de 1;
- `unavailable`: leitura do storage falhou.

`saveStateResult<T>`/`saveEnvelopeResult<T>` retornam sucesso com `savedAt`, bytes, envelope e origem (`save`, `backup`, `import` ou `fresh`). Falhas distinguem `quota`, `unavailable`, `serialization`, `validation`, `verification` e `blocked`.

As APIs antigas `loadState`, `saveState` e `clearState` permanecem como wrappers compatíveis durante a transição, mas o `GymFlowContext` usa o contrato detalhado.

## Validação tolerante

O envelope exige `v: 1`, `savedAt` parseável e `data` como objeto. Campos críticos presentes são validados minimamente: listas precisam ser arrays, usuário/treino ativo precisam ser objeto ou `null`, timestamps precisam ser números finitos ou `null`, e nutrição precisa ser objeto.

Campos opcionais antigos podem faltar. A hidratação mescla esses campos com defaults por presença de propriedade. Portanto, `[]` é preservado e nunca trocado por um array default apenas por estar vazio.

## Commit lógico verificado e backup

Cada save normal executa, de forma síncrona:

1. monta e serializa o envelope em memória;
2. valida o resultado serializado;
3. lê o valor atual;
4. se atual for v1 válido, copia-o para o único backup rolante;
5. grava o novo envelope;
6. relê e compara o texto exato;
7. valida novamente o envelope relido;
8. retorna sucesso apenas após confirmação.

Se o readback divergir, o código tenta restaurar exatamente o valor anterior e informa `verification`. Isso é um **commit lógico verificado**, não uma transação atômica: `localStorage` não oferece transações.

Backup só recebe envelope previamente validado. Estado corrompido nunca substitui backup válido. Restaurar backup também passa por save/readback verificados e registra origem `backup`.

## Corrupção, versão incompatível e quarentena

Ao encontrar JSON inválido, envelope inválido ou versão desconhecida:

- a chave principal não é apagada nem sobrescrita;
- o conteúdo bruto é copiado para a única quarentena rolante quando o storage permite;
- o autosave é bloqueado;
- um aviso global explica o problema;
- o usuário pode exportar o conteúdo bruto;
- um backup v1 válido pode ser restaurado após `ConfirmDialog`;
- iniciar dados novos exige outra confirmação explícita.

Não são criadas chaves numeradas ou backups infinitos.

## Migração legada

As origens suportadas são `gymflow_user` e `gymflow_weeklyPlan`. O fluxo:

1. não faz nada se um v1 válido já existe;
2. lê as chaves sem removê-las;
3. valida JSON, usuário e plano;
4. preenche somente campos ausentes com defaults;
5. salva pelo commit verificado;
6. relê o v1;
7. só então remove as origens.

Falha de parse, quota, escrita ou verificação mantém as chaves legadas. Nova execução é idempotente.

## Hidratação, debounce e flush

O contexto hidrata campo a campo a partir do resultado já mesclado e preserva arrays vazios. Estado corrompido/incompatível deixa os defaults apenas em memória e mantém o autosave pausado, impedindo que eles substituam o original.

O save normal continua com debounce de 500 ms. Um único par de listeners faz flush síncrono em `pagehide` e em `visibilitychange` quando `document.visibilityState === 'hidden'`. Listeners são removidos no cleanup, eventos próximos são consolidados e storage bloqueado não salva.

## Exportação e importação

Exportação manual gera `gymflow-backup-AAAA-MM-DD-HHMM.json`:

```json
{
  "format": "gymflow-backup",
  "formatVersion": 1,
  "exportedAt": "...",
  "appStorageVersion": 1,
  "envelope": { "v": 1, "savedAt": "...", "data": {} }
}
```

Somente o envelope persistido é exportado; estado transitório de UI não entra. O download é local/offline e nenhum dado é enviado a servidor. O arquivo não é criptografado e contém dados pessoais de treino.

Importação limita o arquivo a 5 MiB, lê sem mutar estado, valida JSON/formato/versões/envelope e apresenta preview com data, sessões, treino ativo, programas personalizados e bytes. Somente depois do `ConfirmDialog` o estado atual vira backup e o envelope importado passa pelo commit verificado. Falha preserva o estado anterior e o backup.

## Benchmark

Comando: `node scripts/benchmark-gymflow-storage.mjs`. Cada operação usa 1.000 iterações, sem limite rígido de tempo.

| Fixture | Bytes | stringify mediana / p95 | parse mediana / p95 | validação mediana / p95 | save+readback mediana / p95 |
|---|---:|---:|---:|---:|---:|
| basic | 13.467 | 0,0282 / 0,0482 ms | 0,0276 / 0,0634 ms | 0,0005 / 0,0022 ms | 0,0696 / 0,1687 ms |
| active-workout | 20.916 | 0,0221 / 0,0512 ms | 0,0378 / 0,1003 ms | 0,0005 / 0,0010 ms | 0,0939 / 0,2392 ms |
| heavy-usage | 659.858 | 3,3719 / 6,9381 ms | 2,0646 / 3,7927 ms | 0,0003 / 0,0004 ms | 8,4356 / 13,3922 ms |

Conclusões:

1. `localStorage` continua aceitável para o GOAL-17A.
2. As três fixtures não demonstram necessidade de particionamento imediato.
3. GOAL-17B deve reavaliar particionamento/IndexedDB após o GOAL-23A estabilizar o schema de sessão, incluindo benchmark em WebViews físicos.

## Fundação IndexedDB desconectada (GOAL-17B-002A)

A opção C foi aprovada: a arquitetura híbrida futura manterá o estado pequeno no
backend atual e moverá somente `workoutHistory` para IndexedDB. Esta etapa cria
contratos e implementação testável, sem migrar dados e sem conectar o adapter ao
`GymFlowContext`.

- Banco: `gymflow-persistence`, versão 1.
- `workoutHistory`: um registro por sessão, com `sessionId`, `generationId`,
  `order` e o snapshot completo `session`.
- `metadata`: chave/valor para `activeGeneration`, `migrationGeneration`,
  `schemaVersion`, `migrationStatus`, `migratedAt` e `sourceStorageVersion`.
- `legacySnapshots`: janela de rollback do envelope v1 bruto, com SHA-256,
  `createdAt` e sinal de verificação.

`replaceHistory` grava registros, cursor interno de ordem e troca de geração na
mesma transação. A nova geração só se torna ativa no commit; constraint error,
falha de structured clone ou abort preserva integralmente a anterior. Gerações
inativas só são removidas por ID explícito e a ativa é protegida. IDs de sessão,
nunca datas, definem identidade; `order` preserva deterministicamente o array.
O contrato público de `writeMetadata` não aceita `activeGeneration`; somente o
commit transacional de `replaceHistory` pode trocar esse ponteiro.

`appendSession` insere no início lógico do histórico, em paridade com o array
atual (`[novaSessão, ...histórico]`), usando ordem negativa para não reescrever os
registros existentes. Update e delete consultam apenas a geração ativa.

Benchmark informativo com `fake-indexeddb` (uma execução local; sem threshold):

| Sessões | replaceHistory | readActiveHistory | appendSession |
|---:|---:|---:|---:|
| 100 | 11,44 ms | 4,24 ms | 0,30 ms |
| 500 | 117,24 ms | 46,77 ms | 0,47 ms |
| 1.000 | 463,72 ms | 245,38 ms | 1,07 ms |

Os números medem o emulador em Node e não predizem WebView físico. O ganho
arquitetural validado nesta fundação é a escrita incremental; desempenho e
durabilidade em aparelho continuam gate de rollout.

Continuação planejada:

1. GOAL-17B-002B: migração verificada do envelope v1 e criação da primeira geração;
2. GOAL-17B-002C: integração assíncrona no Context e escrita incremental;
3. GOAL-17B-002D: import/export híbrido, rollback e recuperação.

## Migração v1 desconectada (GOAL-17B-002B)

`migrateWorkoutHistoryFromV1` recebe o texto bruto do envelope v1; não procura a
chave no navegador. O fluxo reutiliza `parseEnvelope` e `normalizeSessionState`,
salva/verifica o snapshot bruto e registra `migrationStatus: in-progress` antes
de preparar o histórico.

`prepareHistoryGeneration` grava todos os registros e `migrationGeneration` na
mesma transação, sem tocar em `activeGeneration`. A geração permanece inativa
enquanto a migração relê e compara:

1. quantidade;
2. IDs na mesma ordem;
3. conteúdo completo por serialização canônica;
4. SHA-256 dos bytes UTF-8 dessa serialização.

Chaves de objetos são ordenadas para o checksum, mas arrays mantêm a ordem. O
digest não contém data da migração, geração ou metadata e não substitui
`session.id` como identidade.

Somente uma geração aprovada pode ser ativada. Depois da ativação há outro
readback da geração ativa; metadata vira `completed` apenas ao final. Se o
processo parar, `migrationGeneration` permite retomar staging/verificação ou
reconciliar uma ativação já feita. Apenas staging inativo comprovadamente inválido
pode ser removido; snapshot e gerações anteriores permanecem.

Esta API continua sem consumidor no aplicativo. `gymflow:state:v1` segue como
fonte de verdade até o GOAL-17B-002C. O GOAL-17B-002D continua responsável por
import/export e rollback híbridos, e WebView físico permanece gate de rollout.

## Envelope físico híbrido v2 (GOAL-17B-002C)

A chave continua sendo `gymflow:state:v1`, mas agora aceita dois formatos físicos:

- **v1 monolítico:** contém o estado completo e `workoutHistory`; continua legível
  para migração e é o fallback quando IndexedDB está indisponível antes do
  cutover.
- **v2 híbrido:** contém somente o core pequeno e
  `historyStorage: { backend: 'indexeddb', schemaVersion: 1, generationId }`.
  `workoutHistory`, listas resumidas e cópias de IDs são proibidos.

O parser v1 rejeita v2 como versão incompatível. Assim um downgrade antigo não
abre o core como se o usuário tivesse histórico vazio.

No cutover, o raw v1 completo é preservado no snapshot IndexedDB e no backup local
antes da troca da chave. Metadata `completed`, geração ativa, marcador da geração
e readback integral são confirmados; depois o v2 é gravado e relido. Qualquer
falha anterior mantém v1 na chave ou bloqueia autosave sem apagar snapshot,
backup ou geração.

No boot v2, o Context aguarda core, metadata, geração e histórico antes de marcar
a hidratação como concluída. O histórico é combinado ao core somente em memória.
Autosave e eventos de ciclo de vida serializam apenas o core; novas sessões usam
append incremental e aparecem no início sem ordenação por datas.

A conclusão de treino só aplica XP, streak, planejamento, desafios, postagem,
limpeza e navegação após o commit do append. Se o aplicativo encerrar entre o
append e a atualização do core, o próximo boot reconhece a sessão terminal pelo
`session.id`, confirma o conteúdo e limpa o treino ativo residual sem repetir
recompensas. ID igual com conteúdo diferente bloqueia por integridade.

Exportação, importação, restauração e reset v1 ficam temporariamente bloqueados
em modo híbrido. O GOAL-17B-002D permanece responsável pelo formato lógico
híbrido e rollback completo. Concorrência entre múltiplos escritores permanece
P2 e validação em WebView físico continua gate obrigatório.

## Manifest verificado por geração (GOAL-17B-002C corretivo)

O banco interno passou para a **versão física 2**. O upgrade é idempotente: cria
o store `generationManifests` sem tocar em `workoutHistory`, `metadata`,
`legacySnapshots` nem em nenhum registro existente. A versão lógica exposta em
`metadata.schemaVersion` e em `historyStorage.schemaVersion` continua **1** — o
envelope físico v2 e o backup externo versão 1 não mudaram.

Cada geração passou a ter um manifest durável com, no mínimo, `generationId`,
`sessionCount`, `orderedDigest`, `createdAt` e `verified`. Não é um marcador de
existência: sem manifest confirmado a geração não é considerada válida.

### Digest ordenado encadeado

`storage-history-integrity.ts` concentra a serialização canônica (antes só
existia dentro da migração) e o digest determinístico:

- cada sessão tem o digest SHA-256 do próprio conteúdo canônico;
- o digest da geração encadeia do registro mais antigo para o mais novo, então
  a ordem física newest-first é parte da identidade;
- geração vazia tem digest canônico explícito (`gymflow:history-digest:v1:empty`),
  que nunca colide com um digest calculado;
- prefixar uma sessão custa **um** passo de encadeamento sobre o digest anterior;
- `createdAt`, `updatedAt` e `generationId` não entram no digest — datas não são
  identidade.

O digest detecta registro ausente, registro extra, ordem divergente, conteúdo
divergente, perda total dos registros e manifest adulterado.

### Escrita atômica

`prepareHistoryGeneration` e `replaceHistory` gravam registros, digest de cada
registro, manifest confirmado e metadata na mesma transação. O append normal
grava registro, manifest, contagem e `orderedDigest` juntos — lê apenas o
manifest e serializa apenas a sessão nova, nunca o histórico inteiro. `update` e
`delete` recalculam a cadeia completa, por serem operações raras.

Como `crypto.subtle` resolve fora da tarefa da transação IndexedDB, o digest é
calculado antes de abrir a transação de escrita, e a transação reconfere a base
(geração ativa, `sessionCount` e `orderedDigest` anteriores) antes de gravar.

### Hidratação

Hidratar v2 exige manifest existente, `verified` verdadeiro, `sessionCount`
coerente, `orderedDigest` coerente, geração ativa existente e registros
completos. Geração vazia só é válida com manifest verificado, `sessionCount = 0`
e o digest vazio canônico. Geração ausente, manifest ausente ou qualquer
divergência resultam em `blocked` — ausência física **nunca** é convertida em
`[]`. Gerações criadas antes do manifest (banco na versão física 1) mantêm os
registros intactos e bloqueiam por `manifest-absent`.

## Receipt transacional da finalização (GOAL-17B-002C corretivo)

O banco interno foi para a **versão física 3**, criando o store
`completionReceipts` (índice por `status`) — de novo sem tocar em nenhum store ou
registro existente. Um receipt pendente contém `receiptId`, `sessionId`,
`generationId`, `sessionDigest`, `finalSession`, `coreEnvelopeAfter`, os efeitos
não pertencentes ao core, `createdAt` e `status`.

`coreEnvelopeAfter` é o resultado final e determinístico da conclusão, sem
`workoutHistory`: treino ativo, `activeWorkoutStartedAt` e timers removidos; XP,
pontos, streak, `lastWorkoutDate`, `weeklyPlan`, desafios e conquistas
atualizados; demais campos do core preservados. Ele é produzido por
`deriveWorkoutCompletion` (helper puro em `storage-completion-receipt.ts`), a
partir dos refs — **nenhum render React participa** da construção do snapshot.

### Fluxo obrigatório

1. construir a `finalSession`;
2. derivar `coreEnvelopeAfter` e os efeitos, sem aplicar callbacks;
3. gravar sessão + manifest + receipt pendente **numa única transação**
   (`appendSessionWithCompletionReceipt`);
4. aguardar `transaction.oncomplete`;
5. gravar e reler o `coreEnvelopeAfter` no `localStorage`;
6. só então atualizar estados React e efeitos visuais;
7. liquidar o receipt depois do processamento seguro.

Nunca existe sessão sem receipt, receipt sem sessão nem manifest atualizado pela
metade: a transação inteira aborta.

### Pagehide imediato

Entre o commit do append e a liquidação do receipt, o runtime guarda o snapshot
pós-conclusão. O autosave normal é **recusado** (`blocked`) nessa janela e o
ciclo de vida grava esse snapshot por um caminho próprio
(`flushPendingCompletionCore`). Um `pagehide` imediato não ressuscita treino
ativo, XP, streak, planejamento, desafios nem conquistas antigas. A gravação não
depende de render intermediário, de `persistedStateRef` atualizado por efeito, de
um `pagehide` futuro nem do debounce de 500 ms.

### Falha do core: recuperação só no próximo boot

Se a transação já foi confirmada mas a gravação do `coreEnvelopeAfter` falha, a
política é conservadora — a montagem atual **não** tenta se recuperar:

1. o receipt permanece pendente e o `pendingCompletionCore` permanece ativo;
2. `storageHealth` fica em `write-error`/`blocked` e não volta para `ready`
   nessa montagem, nem mesmo depois de uma gravação posterior bem-sucedida;
3. o autosave normal fica suspenso: nenhuma edição posterior do usuário é
   persistida **nem anunciada como salva**;
4. `pagehide`/`visibilitychange` podem repetir apenas o `pendingCompletionCore`;
   o sucesso não liquida o receipt nem limpa o estado pendente;
5. `finishWorkout` recusa uma segunda execução — nenhuma segunda sessão,
   recompensa ou receipt é criado;
6. o Provider informa uma única vez que o aplicativo precisa ser reaberto para
   finalizar a recuperação; não há toast de "salvo" nem de recuperação concluída,
   e nada é emitido após o unmount.

O boot seguinte localiza o receipt pendente, valida sessão, manifest, digest e
`coreEnvelopeAfter`, grava ou confirma o core, liquida o receipt, limpa o estado
pendente, hidrata o Provider e só então marca `storageHealth` como `ready`,
liberando autosave e nova finalização. XP, streak, planejamento, desafios,
conquistas e sessão não duplicam; a postagem segue a política já documentada.

### Recuperação após kill

No boot v2, os receipts pendentes são processados antes de liberar o autosave:
confirma-se a sessão e o `sessionDigest`, confirma-se o manifest da geração,
grava-se ou confirma-se o `coreEnvelopeAfter`, o core é combinado ao histórico,
os efeitos fora do core são materializados, o receipt é liquidado e só então
`hydrated` é definido.

O protocolo é idempotente e cobre kill após o append e antes do core, kill após
o core e antes dos estados React, kill após os estados React e antes de liquidar
o receipt, e reinícios repetidos com o mesmo receipt. Receipt sem sessão, sessão
divergente, treino ativo residual divergente ou receipt adulterado bloqueiam por
integridade. XP, streak, desafios, conquistas e sessão vivem no core (nunca
duplicam); a postagem é materializada uma única vez por ciclo do Provider.

Duplicidade da mesma sessão: conteúdo idêntico com receipt concluído é retomada;
conteúdo divergente ou receipt divergente bloqueiam. Uma nova conclusão enquanto
há receipt ou core de conclusão pendente é recusada por integridade —
reprocessar o receipt é atribuição do boot, nunca de uma nova chamada.

### Ciclo de vida e Strict Mode

O Provider mantém `mountedRef` e `pendingFinalizationPromiseRef`. Depois do
unmount não há `setState`, toast, navegação nem efeito visual; a operação durável
já iniciada conclui receipt e core normalmente e, se os callbacks não puderem ser
aplicados, o receipt permanece retomável no próximo boot. O `finally` só mexe em
refs.

O runtime rastreia operações pendentes e conta retenções: `close()` aguarda a
hidratação e drena as operações duráveis antes de fechar o adapter, e o cleanup
da primeira montagem do Strict Mode não fecha uma conexão ainda retida pela
segunda. Hidratação/cutover e recuperação de receipts acontecem uma única vez por
runtime; não há listener, append nem conclusão paralela duplicada.

## Capacidade de recuperação (GOAL-17B-002D-A0)

O aviso global de recuperação não decide mais o que mostrar a partir de
`storageHealth.status`, de `hasBackup` ou da presença de `issue.raw` isolados.
`resolveStorageRecoveryCapabilities` (em `storage-hybrid.ts`) resolve, a partir
do modo do runtime, da versão física e de `canUseLegacyAdminOperations`:

| Capacidade | Significado |
| --- | --- |
| `canRestoreLegacyBackup` | há backup v1 válido **e** as operações antigas estão liberadas |
| `canStartFreshLegacy` | reinício legado permitido no estado bloqueado |
| `canDownloadRaw` | existe conteúdo bruto para baixar (somente leitura) |
| `requiresHybridRecovery` | o estado exige recuperação, mas nenhuma ação legada é compatível |

Comportamento por estado:

- **legacy-v1** — inalterado: restaurar backup quando existir, iniciar dados
  novos quando bloqueado, exportar o original quando houver conteúdo bruto.
- **hybrid-v2 saudável** — o aviso não aparece e nenhuma ação legada é liberada.
- **hybrid-v2 bloqueado ou com erro de gravação** — restaurar backup e iniciar
  dados novos **não são exibidos**. Havendo conteúdo bruto, a única ação é baixá-lo;
  o download preserva uma cópia e **não** corrige o armazenamento. Sem conteúdo
  bruto, o aviso declara que nenhuma ação automática segura está disponível e
  orienta a preservar aplicativo e dados.

O `hasBackup` continua descrevendo o **backup v1 congelado no cutover**: ele
existe em modo híbrido, mas não habilita restauração alguma. A desambiguação
completa da semântica pública de backup fica para o 002D-E.

As guardas do Context não mudaram: `restoreStorageBackup`, `startFreshStorage` e
`applyStorageImport` continuam recusando (`blocked`) sob v2 mesmo que sejam
chamados diretamente. A correção alinha apresentação e capacidade; ela não
substitui a defesa em profundidade.

## Fundação administrativa do IndexedDB (GOAL-17B-002D-A1)

O banco interno passou para a **versão física 4**, criando apenas o store
`storageOperationReceipts` (`keyPath: operationId`, índices `byStatus`, `byKind`
e `byUpdatedAt`). O upgrade é estritamente aditivo e idempotente: nenhuma sessão
é percorrida ou regravada, e `workoutHistory`, `metadata`, `legacySnapshots`,
`generationManifests` e `completionReceipts` ficam byte a byte iguais. O
`schemaVersion` lógico continua **1** e o envelope físico v2 não muda.

Este slice entrega **somente fundação interna**: nenhuma primitiva tem call site
real, nada é exposto à UI, nada é chamado no boot ou no Provider. Exportação
formato v2, importação, restauração, reset e downgrade continuam **não
implementados** e bloqueados.

### Receipt administrativo separado

`StorageOperationReceipt` (em `storage-operation-receipt.ts`) descreve operações
de `import`, `restore`, `reset` e `rollback`. Ele **não** compartilha store,
status nem validador com o `WorkoutCompletionReceipt`:

| Campo | Papel |
| --- | --- |
| `operationId` | chave primária da operação |
| `kind` | `import`, `restore`, `reset` ou `rollback` |
| `sourceDigest` | digest da origem externa; `null` em reset e rollback |
| `previousCoreRaw` | core v2 serializado antes da operação (nunca vazio) |
| `previousGenerationId` | geração ativa antes da operação |
| `stagedGenerationId` | geração preparada, quando já existe |
| `targetCoreRaw` | core v2 pretendido, quando já resolvido |
| `status` | `staged`, `activating`, `activated`, `settled` ou `reverted` |

Transições válidas — `settled` e `reverted` são terminais:

```
staged → activating → activated → settled
staged | activating | activated → reverted
```

`transitionStorageOperationReceipt` é **compare-and-swap**: lê e grava na mesma
transação, exige o `expectedStatus`, recusa registro ausente, status divergente e
transição não declarada, valida o registro final antes do commit e carimba
`updatedAt`. O patch só alcança `sourceDigest`, `stagedGenerationId` e
`targetCoreRaw` — identidade, origem e `createdAt` são imutáveis.

O isolamento é físico e estrutural: os stores são diferentes, o status `pending`
da conclusão não existe no contrato administrativo, e um registro que carregue
`receiptId`, `finalSession` ou `sessionDigest` é recusado como receipt
administrativo. `readPendingCompletionReceipts` nunca vê operação administrativa;
`listUnsettledStorageOperationReceipts` nunca vê conclusão de treino.

A listagem varre o store inteiro em vez de consultar o índice `byStatus`: um
registro com status ausente ou inválido não aparece em índice nenhum, e responder
"nada em aberto" sobre um store corrompido seria a conclusão perigosa que o
runtime do 002D-A2 não pode tirar. Qualquer registro malformado interrompe a
listagem.

### Enumeração de gerações

`listHistoryGenerations()` **não** enumera apenas manifests. Ela une os
`generationId` encontrados em `workoutHistory`, em `generationManifests`, nos
marcadores físicos de staging e nos ponteiros `activeGeneration` e
`migrationGeneration`. É assim que ficam visíveis geração ativa, geração em
staging, geração vazia válida, registros sem manifest, manifest sem registros e
geração órfã — em vez de sumirem.

O resumo é diagnóstico: `hasManifest` não prova integridade e `verified` é apenas
a flag declarada pelo manifest (`null` sem manifest, `false` com manifest
ilegível). Integridade real exige `readVerifiedHistoryGeneration`. A listagem
nunca repara, apaga ou ativa nada.

Ordem determinística: ativa, depois staged, depois as demais por
`updatedAt ?? createdAt` decrescente (sem manifest vai para o fim), com desempate
por `generationId`.

### Leitura verificada e rollback físico

`readVerifiedHistoryGeneration(generationId)` lê o snapshot físico completo,
exige presença coerente e manifest, recalcula o digest, chama
`verifyHistoryGeneration` e devolve as sessões em ordem newest-first. Ela nunca
fabrica `[]`, nunca aceita manifest ausente, nunca corrige digest e nunca
reconstrói manifest. Geração vazia só passa com `sessionCount = 0` e
`orderedDigest = EMPTY_GENERATION_DIGEST`.

`rollbackToHistoryGeneration` verifica a geração alvo por completo **antes** de
qualquer escrita e abre **uma única transação readwrite sobre `metadata`,
`generationManifests` e `workoutHistory`**. Dentro dela: relê metadata exigindo
`activeGeneration === expectedActiveGenerationId`, confere
`clearStagedGenerationId` quando fornecido, relê o manifest alvo exigindo
igualdade integral (`generationId`, `sessionCount`, `orderedDigest`, `verified`,
`createdAt`, `updatedAt`) e **relê todos os registros físicos**, reconferindo-os
contra a prova canônica. Só então `activeGeneration` muda. Depois do commit
metadata é relida e o resultado é explícito.

### Por que `workoutHistory` está na transação

A auditoria independente do 002D-A1 (Classe C) encontrou e **reproduziu** uma
janela real: com `workoutHistory` fora da transação, o store não era serializado
e as sessões podiam mudar entre a verificação e a ativação. Reprodução em banco
real, com o manifest intacto nos três casos:

| Injeção após a verificação | Antes da correção | Depois da correção |
| --- | --- | --- |
| sessão **alterada** | rollback commitava; geração ativada falhava re-verificação com `record-digest-mismatch` | rejeitado; ponteiro intacto |
| sessão **removida** | rollback commitava; geração ativa ficava com **0 sessões** | rejeitado; ponteiro intacto |
| sessão **adicionada** | rollback commitava com contagem divergente do manifest | rejeitado; ponteiro intacto |

A prova canônica é montada **fora** da transação, a partir da mesma leitura
física que alimentou a verificação, e guarda por registro: `order`, `sessionId`,
digest persistido (inclusive `null`) e a serialização canônica completa da sessão
— reusando `serializeWorkoutSessionCanonically`, sem segunda definição. Dentro da
transação a reconferência é **síncrona**, por comparação de strings: nenhum
`crypto.subtle`, nenhum await estranho à transação, nenhum risco de desativá-la.

Digest persistido sozinho não basta — uma sessão pode ser alterada mantendo o
digest antigo gravado. Por isso o conteúdo canônico é comparado **sempre**,
inclusive quando o digest é `null` em registro legado: `null` nunca torna a
comparação permissiva.

### No-op também exige integridade

Quando o alvo já é a geração ativa, o rollback passa pelas **mesmas**
verificações — metadata, manifest e registros. Aprovado, devolve
`changed: false` **sem reescrever o ponteiro**: metadata fica byte a byte
intocada. Reprovado, rejeita. Um no-op não ignora corrupção.

### Falhas fail-closed

Abortam a transação inteira, sem alterar metadata: alvo ausente, alvo sem
manifest, digest divergente, ponteiro ativo obsoleto, staged divergente, manifest
alterado entre a verificação e o commit e — desde a correção — sessão
**alterada, removida, adicionada ou reordenada**, `order` alterado e digest
persistido alterado na mesma janela. Nenhuma falha apaga geração, altera manifest,
toca em receipt ou grava histórico.

> Correção de registro anterior: a versão original desta seção listava "sessão
> faltando" entre as falhas fail-closed sem esclarecer que a garantia valia
> apenas no instante da verificação, não até o commit. A janela existia e está
> fechada; a afirmação agora vale de ponta a ponta.

### Metadata com chave não textual

`listHistoryGenerations` valida que toda chave do store `metadata` é textual
antes de usá-la. Chave de outro tipo (number, Date, ArrayBuffer) lança
`HistoryMetadataIntegrityError` — erro explícito do domínio, não `TypeError`
genérico. O registro não é ignorado, convertido, reparado nem apagado, e nenhuma
listagem parcial é devolvida: a enumeração é a visão que um runtime de
recuperação usaria para decidir, e uma visão incompleta seria pior que nenhuma.
As demais operações continuam legíveis, pois usam `get(key)` direto.

> **Isto não é rollback completo do aplicativo.** A primitiva move apenas o
> ponteiro físico do IndexedDB. O core v2 no `localStorage` continua apontando
> para a geração anterior e precisa ser coordenado — essa coordenação é o
> 002D-A2/C/D. Por isso não há call site real, nem chamada no boot, nem no
> Provider, nem na UI.

Sem IndexedDB disponível as primitivas administrativas falham explicitamente
(`IndexedDbUnavailableError` / `IndexedDbNotOpenError`). Não existe fallback
silencioso em memória e nenhuma geração é fabricada.

## Fachada administrativa segura do HybridStorageRuntime (GOAL-17B-002D-A2)

`createStorageAdminRuntime` (`storage-admin-runtime.ts`) é a camada entre as
primitivas físicas do A1 e os futuros fluxos reais de
importação/restauração/reset/rollback (002D-C/D). **Nenhuma operação real é
executada nesta etapa** — o begin cria só um receipt `staged`. A fachada
**não é conectada ao Provider nem à UI**: nenhum componente, boot ou
inicialização a chama.

### Quatro estados, um único diagnóstico

`inspectStorageAdministration()` devolve sempre o mesmo snapshot —
`state`, `physicalStorageVersion`, `activeGenerationId`, `stagedGenerationId`,
`generations`, `unsettledOperations`, `pendingCompletionReceiptCount`,
`coreDigest` — e nunca escreve nada. `state.status` é um de quatro:

- `unavailable` — camada física inutilizável (`not-hybrid`,
  `indexeddb-unavailable`, `storage-blocked`, `physical-version-mismatch`,
  `core-invalid`);
- `ready` — v2 saudável, sem receipt aberto, sem conclusão pendente, sem
  staging inesperado;
- `interrupted` — exatamente um `StorageOperationReceipt` não terminal,
  identificado por completo (`operationId`/`kind`/`status`); nenhuma
  recuperação automática;
- `conflicted` — estado ambíguo demais para mutar (dois receipts abertos,
  receipt malformado, conclusão pendente sozinha ou junto de operação
  administrativa, staging sem explicação, geração ativa sem manifest
  confirmado).

Conflito nunca vira `ready`, e a fachada nunca escolhe sozinha qual operação
continuar — isso fica para 002D-C/D.

### Begin cria só o receipt

`beginStorageOperation({ kind, sourceDigest, stagedGenerationId,
targetCoreRaw })` exige `ready`, relê o `raw` do core v2 e a geração ativa de
forma independente do snapshot inicial, verifica **integralmente** a geração
ativa (`readVerifiedHistoryGeneration`, não a flag do manifest) e só então cria
o receipt via a nova primitiva atômica do adapter,
`createStorageOperationReceiptIfIdle` (CAS da geração ativa, `add` nunca
`put`, duas criações concorrentes produzem exatamente um receipt). `operationId`,
`createdAt` e `updatedAt` são sempre internos; o consumidor não os controla.

Depois do CAS, o begin **relê** o `raw` e a `activeGeneration` de novo: o core
v2 vive no `localStorage`, fora da transação IndexedDB que criou o receipt, e
essa releitura fecha a janela que o CAS sozinho não cobre. Qualquer divergência
transiciona o receipt recém-criado de `staged` para `reverted` — nunca o
apaga — e devolve erro explícito de concorrência, sem alterar core nem geração
ativa.

O begin recusa (fail-closed, sem criar receipt) diante de: operação em
aberto, mais de uma, conclusão de treino pendente, metadata malformada,
staging sem explicação, geração ativa ausente ou corrompida, core v2
ausente/inválido, runtime legado ou bloqueado, IndexedDB indisponível e
versão física diferente de 2.

### Transição é delegação pura

`transitionStorageOperation({ operationId, expectedStatus, nextStatus, patch
})` delega inteiramente ao CAS já existente do adapter. As transições são as
mesmas do A1 — nenhuma nova, nenhum efeito colateral por status: mover para
`activating`/`activated` não altera core, metadata, geração, histórico nem
`CompletionReceipt`.

### CompletionReceipt continua isolado

O begin recusa com qualquer conclusão de treino pendente, e o snapshot
classifica como `conflicted` quando ela coexiste com uma operação
administrativa. A fachada nunca liquida nem altera `WorkoutCompletionReceipt`.

### Rollback físico continua inacessível fora do adapter

`rollbackToHistoryGeneration` **não** foi adicionado à fachada. Confirmado por
busca: nenhum componente, o `GymFlowContext`, o `AdminPanel` ou o
`StorageRecoveryNotice` o chamam. Ele continua disponível só no adapter de
baixo nível, para uso futuro do coordenador atômico em 002D-C/D.

> **A2 não é rollback completo do aplicativo, nem importação, exportação,
> restauração ou reset.** Owner-token e concorrência entre abas continuam para
> etapa posterior.

### Corretivo 036 — o que mudou depois da auditoria Classe C

A auditoria independente do A2 reprovou o commit `429c87d` (**Classe C**) com
três bloqueantes reproduzidos por fault injection real. O texto acima descreve
o desenho; esta seção descreve o comportamento **atual**, que é o que vale.

**1. `ready` exige verificação integral, não a flag do manifest.** Seis
corrupções físicas da geração ativa — conteúdo alterado mantendo o digest
persistido, digest alterado, ordem física trocada, sessão removida, sessão
adicionada, `orderedDigest` incorreto com `verified=true` — devolviam `ready`
enquanto `readVerifiedAdministrationGeneration` reprovava a mesma geração.
Agora `inspectStorageAdministration` roda `verifyHistoryGeneration` (a mesma
primitiva do A1) sobre os registros do snapshot atômico e só considera `ready`
com contagem, ordem, digests por registro e `orderedDigest` conferidos. O
resultado fica em `snapshot.activeGenerationIntegrity`.

> `HistoryGenerationSummary.verified` é a **flag persistida** do manifest. Ela
> continua visível no resumo diagnóstico e **não prova integridade, não
> autoriza `ready` e não substitui a verificação integral.**

**2. Snapshot atômico + double-read.** `readStorageAdministrationSnapshot()` lê
`metadata`, `workoutHistory`, `generationManifests`, `storageOperationReceipts`
e `completionReceipts` numa única transação readonly, sem transação auxiliar. O
`inspect` roda o protocolo core → snapshot A → verificação → core → snapshot B
→ core e só conclui quando os três cores são idênticos e os dois fingerprints
batem. O fingerprint cobre metadata, ponteiros, manifests, o conteúdo canônico
de todos os registros, todos os receipts administrativos e todos os
CompletionReceipts pendentes — não apenas contagens.

Divergência não vira escolha: o estado é `conflicted` com
`administration-snapshot-unstable` (o IndexedDB mudou) ou
`core-changed-during-inspection` (o core v2 mudou). Uma segunda tentativa é
feita; instabilidade persistente continua fail-closed. **O snapshot descreve a
janela estável observada — uma alteração iniciada depois da leitura final
aparece no próximo `inspect`, nunca misturada a este.**

**3. A criação do receipt serializa com os CompletionReceipts.**
`createStorageOperationReceiptIfIdle` agora inclui `completionReceipts` no
escopo da transação readwrite. Como `appendSessionWithCompletionReceipt` disputa
o mesmo store, o IndexedDB serializa as duas: uma conclusão de treino gravada
durante o begin bloqueia a operação (`StorageCompletionPendingError`) em vez de
coexistir com ela. O receipt de conclusão nunca é lido fora da transação,
alterado ou liquidado.

**4. Transição só em estado inequívoco.** `transitionStorageOperation` exige
`interrupted` e delega a `transitionStorageOperationIfUnambiguous`, que
reconfere dentro da própria transação de escrita: todos os receipts validados,
exatamente um não terminal, que seja o `operationId` pedido, zero conclusão
pendente e CAS da geração ativa. Ela **nunca escolhe** um receipt sozinha.
Recusa em `unavailable`, `ready`, `conflicted`, com dois receipts, com receipt
malformado, com conclusão pendente, com staging incompatível, com core ausente
ou inválido, em runtime legado e com metadata malformada.

> **Correção do 038:** essa reconferência cobre apenas o lado IndexedDB. O core
> v2 vive no `localStorage` e **não participa** da transação — a auditoria
> seguinte provou que a transição avançava sobre um core já trocado. A proteção
> do core é o protocolo descrito na seção do corretivo 038, não esta transação.

A transição também valida o estado **projetado**: `activating → activated` é
recusada no A2, porque `activated` afirma efeitos (geração preparada ativa, core
alvo gravado) que nenhum fluxo desta fase produz. Reverter é sempre permitido.

**5. Coerência receipt × core × metadata.**
`evaluateStorageOperationCompatibility` (puro, em `storage-operation-receipt.ts`)
classifica em `compatible`, `incompatible` (razão fechada) ou
`insufficient-evidence`. Um receipt não terminal incoerente com o mundo
observado vira `conflicted` (`operation-incompatible`), não `interrupted`
genérico. `insufficient-evidence` **nunca** é tratado como compatível.

**6. A compensação pode falhar, e isso é relatado.** A afirmação anterior de que
"qualquer divergência transiciona o receipt de `staged` para `reverted`" era
incondicional e incorreta: é uma **tentativa**.
`StorageOperationBeginConflictError` carrega `operationId`, `compensation`
(`reverted` | `failed` | `not-attempted`), `compensationCause`,
`finalReceiptStatus` e a `cause` original. Compensação que falha nunca é
relatada como revertida; o receipt não é apagado nem sobrescrito à força e
reaparece no próximo diagnóstico como `interrupted` ou `conflicted`.

**7. `stagedGenerationId` e `targetCoreRaw` precisam ser `null`.** O A2 não cria
staging físico nem grava core alvo, então aceitar valor gravaria uma promessa
que nada cumpre. A recusa é `StorageAdministrationInputError`, antes de qualquer
leitura ou escrita. Os campos ficam reservados para 002D-C/D.

**Continua valendo:** nenhuma UI, nenhum call site real, nenhum Provider,
nenhuma recuperação automática, nenhuma operação administrativa executada de
verdade, `rollbackToHistoryGeneration` fora da fachada, owner-token e gate de
WebView físico pendentes, e 002D-B/C/D/E/F não iniciados.

### Corretivo 038 — transição protegida contra core obsoleto

Uma segunda auditoria independente classificou o 002D-A2 novamente como
**Classe C**: a transição administrativa avançava um receipt de `staged` para
`activating` usando um core do `localStorage` que já tinha sido trocado, e o
receipt ficava **preso em `activating`** — o `inspect` seguinte virava
`conflicted` e a própria fachada recusava até a reversão.

**Não existe atomicidade única entre `localStorage` e IndexedDB.** O core v2 não
participa da transação IndexedDB e nenhuma transação pode fazê-lo participar. O
que o 038 entrega é um protocolo explícito, e a garantia é exatamente esta:

> A transição só retorna sucesso quando o core observado **antes** e
> **imediatamente depois** da transação continua byte a byte igual ao core
> compatível com o receipt.

**Protocolo pré-transação.** Depois de exigir `interrupted` e o receipt
correspondente, `transitionStorageOperation`:

1. relê `storage.getItem(key)`, produzindo `coreRawBeforeTransition`;
2. exige igualdade byte a byte com `snapshot.coreRawObserved`;
3. revalida que esse raw ainda é um envelope físico v2;
4. reavalia a compatibilidade do receipt contra o raw **recém-lido**;
5. só então abre a transação atômica.

Divergência aqui não avança nada: o receipt é compensado para `reverted` e o
erro sai com `phase: 'pre-transition'`.

**Protocolo pós-commit.** Assim que a transação conclui:

1. relê o core (`coreRawAfterTransition`) e compara byte a byte com o core de
   antes;
2. relê o receipt persistido e confirma o `nextStatus`;
3. relê a metadata e confirma a geração ativa;
4. reconfirma a compatibilidade do receipt persistido contra o core relido.

Qualquer divergência: compensação para `reverted` e erro com
`phase: 'post-transition'`. **A compensação nunca tenta desfazer a alteração
externa do `localStorage`** — o core alheio fica exatamente como está. Ela só
encerra honestamente a operação administrativa. Histórico, manifests, metadata,
CompletionReceipts e snapshot legado não são tocados em nenhum caminho de erro.

**A compensação pode falhar, e isso aparece.**
`StorageOperationTransitionConflictError` carrega `operationId`,
`expectedStatus`, `attemptedStatus`, `phase`, `reason` (fechada), `compensation`
(`reverted` | `failed` | `not-attempted`), `finalReceiptStatus` (`staged` |
`activating` | `activated` | `reverted` | `settled` | `missing` | `unknown`),
`cause`, `compensationCause`, `finalStatusReadCause` e `observedCoreDigest`.
Nenhuma mensagem carrega core bruto — só o digest.

**Saída para a operação presa.** `revertStorageOperationSafely({ operationId,
expectedStatus })` leva a operação para `reverted` e **só** para lá, mesmo com o
`inspect` em `conflicted` por incoerência (core incompatível, ativação não
reconhecida, operação incompatível com a metadata, compensação anterior que
falhou). Ela continua recusando ambiguidade estrutural: mais de um receipt não
terminal, receipt malformado, `operationId` ou status divergentes, metadata
malformada e adapter indisponível. CompletionReceipt pendente **não** bloqueia
a reversão — reverter apenas reduz o conflito —, o store participa da transação,
todos os registros são validados e nenhum dado de conclusão é alterado.

**Fingerprint completo dos cores do receipt.** `previousCoreRaw` e
`targetCoreRaw` entravam no fingerprint apenas pelo comprimento: dois cores
diferentes de mesmo tamanho produziam o mesmo fingerprint e o double-read não
enxergava a troca. Agora entra o conteúdo integral, via SHA-256 do raw completo
(`sha256Checksum`, calculado fora da transação IndexedDB) — ou o raw inteiro no
material canônico quando não há Web Crypto. Nunca comprimento, presença, prefixo
ou sufixo. O fingerprint não expõe o core bruto.

**`readCause` deixou de ser descartada.** Quando a compensação falha **e** a
releitura do status final também falha, a causa da releitura viaja em
`finalStatusReadCause`, aparece na mensagem e o status vira `unknown`. `missing`
passou a ser um valor distinto: o registro foi lido e não existe mais.

**Metadata malformada é `metadata-malformed`.** `activeGeneration` ou
`migrationGeneration` com valor que não seja `string` nem `null` (number, Date,
ArrayBuffer, objeto, array) invalidam a leitura com
`HistoryMetadataIntegrityError`. Antes viravam `null` e o diagnóstico dizia "não
existe geração ativa" (`core-invalid`) — um motivo falso. Nada é reparado,
convertido ou apagado.

**Transição × conclusão de treino, as duas ordens.** A serialização pelo store
compartilhado continua igual. Uma conclusão **já pendente** quando a transação
da transição adquire os stores bloqueia a transição. Uma conclusão iniciada
**depois** que a transição adquiriu e concluiu os stores é um evento novo: as
duas coexistem e o conflito aparece no próximo `inspect`. **Não existe exclusão
mútua eterna depois que a transação termina** — e nada aqui promete isso.

**Limite honesto.** Uma alteração do core iniciada depois da leitura
pós-transição é um novo evento externo. Ela aparece no próximo `inspect` como
`operation-incompatible`; este protocolo garante a janela que observou, não o
futuro.

**Continua valendo, sem mudança:** nenhuma UI, nenhum Provider, nenhum call site
real, nenhuma operação administrativa executada de verdade, nenhuma recuperação
automática no boot, nenhuma sincronização entre abas,
`rollbackToHistoryGeneration` fora da fachada, owner-token e gate de WebView
físico pendentes, e 002D-B/C/D/E/F não iniciados.

## Formato lógico de backup v2 (GOAL-17B-002D-B)

O **002D-A2 está integrado e encerrado**. O slice B cria **somente** formato,
exportação read-only e inspeção read-only. Não existe importação v2, restauração,
rollback, reset, retenção, recuperação automática, UI, Provider, download nem
call site.

### Por que um formato novo

O backup v1 (`storage-export.ts`) copia o envelope monolítico inteiro. No
híbrido v2 o estado do usuário vive em dois lugares — core v2 no `localStorage`
e histórico numa geração verificada do IndexedDB — e nenhum dos dois sozinho
descreve o usuário. Copiar o envelope físico exportaria
`historyStorage.generationId`: um ponteiro para um banco que não existe no
aparelho de destino.

O formato v2 é **lógico**. O v1 continua existindo, intocado, e continua sendo o
único com importação real.

### Contrato

```
{
  format: 'gymflow-backup',
  formatVersion: 2,
  logicalSchemaVersion: 1,
  exportedAt: <ISO-8601>,
  sourcePhysicalStorageVersion: 2,
  sourceSavedAt: <ISO-8601>,
  payloadDigest: 'sha256:<64 hex>',
  payload: PersistedState
}
```

O `payload` tem os 16 campos raiz de `PersistedState` e **nada mais**: `user`,
`weeklyPlan`, `customPrograms`, `activeWorkout`, `activeWorkoutStartedAt`,
`restTimerEndAt`, `restTimerTotalSeconds`, `restTimerLabel`, `workoutHistory`,
`weightHistory`, `measurementsHistory`, `nutrition`, `achievements`,
`challenges`, `favoriteExercises`, `recentlyViewedVideoIds`.

Nunca entram no arquivo: `historyStorage`, `generationId`, `activeGeneration`,
`migrationGeneration`, `generationManifests`, `recordDigests`,
`storageOperationReceipts`, `completionReceipts`, `legacySnapshots`,
`quarantine`, `previousCoreRaw`, `targetCoreRaw`, o raw do `localStorage`, o
nome da chave, fingerprints administrativos e metadados internos do IndexedDB.
**Nenhum id físico de geração é necessário para importar o arquivo no futuro.**

### Captura estável

`captureLogicalBackupSnapshot` recebe um `LogicalBackupRuntime` — um `Pick` da
fachada administrativa com apenas `inspectStorageAdministration` e
`readVerifiedAdministrationGeneration`. A leitura é read-only **por tipo**:
`beginStorageOperation`, `transitionStorageOperation` e
`revertStorageOperationSafely` não existem no parâmetro recebido.

O protocolo é diagnóstico → leitura verificada do histórico → diagnóstico. As
duas pontas precisam descrever o mesmo mundo: `ready` nas duas, `coreRawObserved`
byte a byte igual, mesmo `activeGenerationId`, mesmo `administrationFingerprint`,
mesma versão física, zero receipt administrativo e zero conclusão pendente. O
core também precisa apontar para a geração ativa
(`core.data.historyStorage.generationId === activeGenerationId`) — sem isso o
arquivo poderia casar o core de uma geração com o histórico de outra.

> **Garantia:** o backup só existe quando o core observado antes e depois da
> leitura verificada do histórico é byte a byte o mesmo, com o mesmo
> `activeGenerationId`, o mesmo `administrationFingerprint`, a mesma versão
> física, zero receipt administrativo e zero conclusão pendente nas duas pontas.

Divergência não escolhe leitura: falha com `snapshot-changed-during-export`,
sem produzir conteúdo. Como no 038, **não existe atomicidade entre
`localStorage` e IndexedDB**; uma alteração iniciada depois da leitura final é
um evento novo e aparece na próxima exportação.

### Digest

Serialização canônica: chaves de objeto ordenadas recursivamente, ordem de
array preservada (`workoutHistory` continua newest-first), nada reordenado por
conteúdo. Número não finito e `BigInt` **param** a serialização em vez de virar
`null` silencioso — `LogicalBackupSerializationError` carrega o caminho do
campo, nunca o valor.

Material: `gymflow:logical-backup:v2:<payload-canônico>`, com `sha256Checksum`
— a mesma função dos digests de histórico, sem segunda implementação. A forma
canônica é o que vai para o arquivo, então o digest assina exatamente o que está
publicado.

Sem Web Crypto **não existe backup**: `crypto-unavailable`, causa original
preservada, nenhum hash fraco, nenhum comprimento como integridade.

### Tamanho

`JSON.stringify(backup)` sem indentação; `bytes` são os bytes UTF-8 reais.

| Faixa | Comportamento |
| --- | --- |
| até 8 MiB | sem aviso |
| acima de 8 MiB e até 25 MiB | sucesso com aviso de arquivo grande |
| acima de 25 MiB | `too-large`, sem conteúdo |

`MAX_IMPORT_BYTES` do fluxo v1 continua **5 MiB** e não foi tocado.

### Inspeção

`inspectLogicalStorageBackupV2(raw, declaredBytes?, subtleCrypto?)` usa
`max(declaredBytes, utf8Bytes(raw))`, recusa acima de 25 MiB antes de operações
caras, e valida formato, `formatVersion`, `logicalSchemaVersion`, datas,
`sourcePhysicalStorageVersion`, payload completo e digest recalculado. Ela não
abre `localStorage` nem IndexedDB e não conhece a chave do app: um arquivo pode
ser conferido inteiro num aparelho onde o GymFlow nunca rodou.

Preview: `exportedAt`, `sourceSavedAt`, `workoutSessions`, `hasActiveWorkout`,
`customPrograms`, `weightEntries`, `measurementEntries`, `bytes`, `warning`.

**Não existe `commitLogicalStorageImportV2`.** A inspeção termina em preview.

### Dados pessoais

O arquivo v2 contém **dados pessoais e histórico de treino**: perfil (nome,
e-mail, idade, peso, altura), medidas corporais, nutrição e todas as sessões.
Ele não é anonimizado nem criptografado. Nenhum payload, perfil, histórico ou
raw é registrado em console, e nenhuma mensagem de erro carrega conteúdo do
payload — só caminho de campo e tamanho.

### Estados que bloqueiam a exportação v2

Legacy v1, armazenamento vazio, core v2 inválido, IndexedDB indisponível, versão
física divergente, metadata malformada, geração ativa ausente, geração ativa
corrompida, operação `interrupted`, estado `conflicted`, CompletionReceipt
pendente e snapshot instável. Nenhum deles cai em recuperação bruta automática:
o download do raw (`createRawRecoveryExport`) continua sendo uma ação separada
do v1.

### Corretivo 046 — o que mudou depois da auditoria Classe C

A auditoria independente do 002D-B provou quatro bloqueantes. Todos foram
fechados sem recomeçar o módulo.

**1. Corrida ABA (`H1 → H2 → H1`).** O protocolo comparava apenas os dois
diagnósticos que cercam a leitura verificada. Se o histórico sai de `H1`, passa
por `H2` e **volta byte a byte** para `H1`, os dois diagnósticos ficam
idênticos — mesmo `coreRawObserved`, mesmo `activeGenerationId`, mesmo
`administrationFingerprint` — enquanto a leitura do meio carregou `H2`. O
resultado era uma exportação bem-sucedida contendo um histórico que nunca
coexistiu com aquele core.

A leitura intermediária agora é **amarrada ao conteúdo** que os diagnósticos
verificaram. De cada diagnóstico é extraída a geração verificada
(`activeGenerationIntegrity`), exigindo `status: verified`, manifest presente,
sessões presentes e `manifest.generationId === activeGenerationId`. Dela sai um
descritor canônico — identidade, contagem, `orderedDigest`, manifest inteiro,
ids/ordem e as sessões completas serializadas deterministicamente. O protocolo
final é:

1. `inspect` A `ready` e íntegro;
2. core de A validado (envelope v2, geração casada, `savedAt` canônico);
3. geração verificada declarada por A;
4. `readVerifiedAdministrationGeneration`;
5. `inspect` B `ready` e íntegro;
6. A × B (incluindo as comparações antigas, que **não** foram removidas);
7. leitura intermediária × geração verificada de A;
8. leitura intermediária × geração verificada de B;
9. só então o payload é reconstruído.

Qualquer divergência devolve `snapshot-changed-during-export`, sem conteúdo,
sem backup parcial e sem escrita. Fingerprint administrativo, `generationId`,
contagem, lista de ids e `manifest.verified` **deixaram de ser suficientes** —
sozinhos, nenhum deles enxerga a volta ao estado anterior.

**2. Contrato externo fechado.** O arquivo precisa ter exatamente oito chaves
próprias enumeráveis: `format`, `formatVersion`, `logicalSchemaVersion`,
`exportedAt`, `sourcePhysicalStorageVersion`, `sourceSavedAt`, `payloadDigest`,
`payload`. Campo extra, campo ausente, símbolo, propriedade não enumerável,
getter/setter, protótipo customizado e chave perigosa são recusados. A checagem
usa `Reflect.ownKeys` e descritores — `Object.keys` e `in` não enxergam símbolo,
propriedade oculta nem acessor, e ler um getter executaria código do arquivo
durante a validação. Vale igual para objeto de memória e para o resultado de
`JSON.parse`. Um backup v1 real continua sendo recusado como
`unsupported-version`, não como formato desconhecido: ele declara
`formatVersion: 1` e essa é a informação útil.

**3. Payload raiz fechado.** O payload precisa ter exatamente os 16 campos
lógicos. Qualquer campo raiz desconhecido é recusado estruturalmente, com
mensagem genérica — o nome de um campo desconhecido pode ser conteúdo do
usuário. Os campos físicos conhecidos (`historyStorage`, `generationId`,
`recordDigests`, …) continuam sendo nomeados na mensagem, porque esses nomes vêm
de uma constante do código. Texto funcional do usuário contendo as palavras
"generationId", "manifest" ou "receipt" continua preservado: a validação é
estrutural, não textual.

**4. Árvore JSON estrita, sem normalização silenciosa.** Antes de canonicalizar
ou serializar, a árvore inteira é validada e **copiada**. São aceitos apenas
`null`, boolean, string, número finito, array denso e objeto simples com
protótipo padrão. São recusados `undefined`, função, símbolo, `BigInt`, `NaN`,
`±Infinity`, `Date`, `Map`, `Set`, `ArrayBuffer`, `TypedArray`, `RegExp`,
`Promise`, `WeakMap`, `WeakSet`, objeto com protótipo customizado, array
esparso, array com propriedade própria extra, propriedade simbólica,
propriedade não enumerável, getter, setter e referência circular. Nada mais vira
ausência, `{}`, objeto indexado ou `null` a caminho do digest. A leitura é feita
por `descriptor.value`: um getter é **detectado**, nunca executado. O payload
devolvido é uma cópia lógica independente e a entrada nunca é modificada.

**Chaves perigosas** (`__proto__`, `prototype`, `constructor`) são recusadas
recursivamente, em todos os níveis, por chave própria real — não por `in`.

**Datas canônicas.** `exportedAt` e `sourceSavedAt` só são aceitos no formato
`YYYY-MM-DDTHH:mm:ss.sssZ`, conferido por regex estrita **e** por
`new Date(value).toISOString() === value`. Data sem hora, sem milissegundos, com
offset, RFC textual, data impossível e string apenas parseável são recusadas. O
`now` da exportação e o `savedAt` do core passam pelo mesmo crivo.

**Tamanho declarado.** `declaredBytes` ausente usa os bytes UTF-8 reais. Quando
informado, precisa ser número finito, inteiro e `>= 0`; `NaN`, `±Infinity`,
negativo, decimal, string, `null` e objeto caem em `invalid-size`. Só depois
`bytes = max(declaredBytes, utf8(raw))`. Os limites não mudaram: até 8 MiB sem
aviso, acima disso e até 25 MiB com aviso, acima de 25 MiB `too-large`.

**Ordem fail-fast da inspeção:** tamanho → JSON → contrato externo → `format` →
`formatVersion` → `logicalSchemaVersion` → datas → versão física de origem →
payload completo e árvore JSON → formato textual do `payloadDigest` → recálculo
SHA-256 → comparação → preview. **Nenhum digest é calculado sobre payload não
validado.**

**Erros sanitizados.** Nenhuma mensagem pública carrega id de sessão, nome ou
valor de perfil, conteúdo de treino, `raw`, trecho de JSON, chave dinâmica
desconhecida, valor recusado ou mensagem produzida por getter/proxy do payload.
`sessionId` duplicado tem mensagem genérica, sem interpolar o id. Caminho de
erro é montado só com nomes de campo conhecidos e índices numéricos; qualquer
outro nome vira `<campo>`. `cause` só sobrevive em falha interna confiável (Web
Crypto indisponível, runtime administrativo, IndexedDB) — nunca quando a origem
é conteúdo do payload.

O digest não mudou: SHA-256, prefixo `sha256:`, 64 hex minúsculos, domínio
`gymflow:logical-backup:v2:`, comparação exata, zero fallback fraco.

### Continua valendo, sem mudança

Nenhuma UI, nenhum Provider, nenhum call site real, nenhuma operação
administrativa executada de verdade, nenhuma recuperação automática no boot,
nenhuma sincronização entre abas, `rollbackToHistoryGeneration` fora da fachada,
owner-token e gate de WebView físico pendentes. **002D-C/D/E/F não iniciados** —
importação v2, restauração, rollback completo, reset e retenção seguem fora de
escopo. O corretivo 046 não criou importação, restauração, rollback, reset,
download, UI nem call site.

**Não existe atomicidade entre `localStorage` e IndexedDB.** O que existe é o
protocolo acima: ele garante que uma alteração concorrente **derruba** a
exportação, não que ela seja impedida.

## Recuperação manual

Na seção **Painel administrativo → Dados locais**:

1. use **Exportar JSON** para cópia externa;
2. use **Importar JSON** e confira o preview antes de confirmar;
3. use **Restaurar backup** para voltar ao último envelope válido anterior;
4. se o aviso global bloquear autosave, exporte o original antes de restaurar ou iniciar dados novos.

Para simular corrupção somente em desenvolvimento:

```js
localStorage.setItem('gymflow:state:v1', '{invalid')
location.reload()
```

Confirme que o aviso aparece, a chave principal continua `{invalid`, a quarentena existe e nenhum autosave substitui o valor. Restaure um backup válido pelo diálogo. Nunca use dados reais como evidência versionada.

## Testes automatizados

`npx vitest run` cobre load/save, corrupção, versão desconhecida, quota, falha de leitura, backup/restauração, rollback de readback, migração idempotente, arrays vazios, export/import, limite de arquivo, flush bloqueado, anonimização e as três fixtures da auditoria como golden inputs.

## Importação lógica v2 atômica (GOAL-17B-002D-C1)

O slice B entrega um arquivo v2 que pode ser gerado e conferido, e para aí. O C1
entrega o coordenador que faltava: `commitLogicalStorageImportV2`, em
`src/lib/storage-logical-import.ts`. Ela é programática e **não tem call site** —
não existe seletor de arquivo, upload, modal, Provider nem integração com o boot.

### O que ela recebe

O **conteúdo bruto** do arquivo, e mais nada de confiável. Não existe variante
que aceite um payload já validado: um objeto de inspeção é forjável, e aceitá-lo
transferiria a confiança para quem chama. A função chama
`inspectLogicalStorageBackupV2` internamente, então há **um único parse, uma
única validação, um único digest e um único objeto de payload** — o mesmo que vai
para o staging. Não existe janela entre validar e usar.

O parâmetro opcional `expectedPayloadDigest` amarra a chamada a uma inspeção
anterior (o preview que o 002D-E vai mostrar): divergência recusa antes do
primeiro write.

### Staging amarrado ao journal

`stageHistoryGenerationForOperation` cria a geração importada e grava
`stagedGenerationId` no receipt **na mesma transação readwrite**, sobre os cinco
stores administrativos. Em duas transações separadas, uma queda entre elas
deixaria uma geração física que nenhum receipt explica — e o diagnóstico do A2
não teria como provar de quem ela é.

A primitiva **nunca grava `metadata.migrationGeneration`**. O ponteiro faria
`metadataMatchesV2` recusar a hidratação enquanto a operação estivesse em
andamento, inclusive durante a verificação integral de um histórico grande. O
vínculo geração ↔ operação já vive no receipt, que é durável e é lido pelo mesmo
snapshot atômico. A geração nasce **inativa**.

### Ordem: geração primeiro, core por último

Não existe atomicidade única entre `localStorage` e IndexedDB, e este módulo não
finge que existe. O que existe é:

1. cada escrita isolada é atômica e verificável por readback;
2. o journal nomeia os DOIS mundos completos (`previousCoreRaw` +
   `previousGenerationId` e `targetCoreRaw` + `stagedGenerationId`) **antes** de
   qualquer efeito;
3. a ordem escolhida reduz a janela em que os dois motores discordam a uma única
   escrita síncrona de `localStorage`.

Gravando a geração primeiro, todas as escritas protegidas por CAS acontecem antes
da única escrita sem CAS — e essa última é a mais barata de repetir (gravar o
mesmo raw duas vezes dá o mesmo raw) e a mais barata de desfazer (gravar de volta
o raw anterior, que está inteiro no journal). A ordem inversa colocaria a escrita
fraca no meio e exigiria desfazê-la depois de uma falha do lado forte.

### Sequência

| Passo | O que faz | Escreve |
| --- | --- | --- |
| W0 | inspeciona arquivo, exige `ready`, exige `migrationStatus: completed` | nada |
| W1 | `beginStorageOperation` com `sourceDigest = payloadDigest` | receipt |
| W2 | staging atômico: geração nova + `stagedGenerationId` | 5 stores, 1 transação |
| W3 | `readVerifiedHistoryGeneration` × payload validado | nada |
| W4 | constrói `targetCoreRaw` e transiciona `staged → activating` | receipt |
| W5 | ativa com CAS e verificação integral | metadata |
| W6 | grava o core byte a byte | localStorage |
| W7 | verifica core, metadata e geração | nada |
| W8 | `activating → activated` | receipt |
| W9 | `activated → settled` | receipt |
| W10 | exige `ready` de novo | nada |

### `targetCoreRaw` é byte-exato

Ele é construído **uma vez**, gravado no journal antes de existir fisicamente e
depois gravado exatamente como está. `saveHybridCoreResult` cunha um `savedAt`
novo a cada chamada e por isso nunca gravaria o raw que o receipt prometeu — e a
avaliação de compatibilidade exige, em `activated`, igualdade byte a byte entre o
core e `targetCoreRaw`. O commit do core é próprio: relê a chave, exige igualdade
com `previousCoreRaw`, sonda a cópia rolante, grava a cópia, confere o readback
dela, relê a chave de novo, grava o raw exato e confere o readback final.

### `rollbackToHistoryGeneration` como ativação verificada

O nome diz rollback, mas ela é a única primitiva do adapter que verifica a
geração alvo integralmente, reconfere o conteúdo físico contra uma prova canônica
**dentro** da transação de escrita, aplica CAS em `activeGeneration` e confirma o
ponteiro por readback depois do commit. `activateHistoryGeneration` não faz nada
disso e ainda exigiria o ponteiro de staging, que este fluxo não usa. A mesma
primitiva, com os argumentos trocados, é a compensação.

### Por que `activating → activated` não passa pela fachada A2

O avaliador do A2 devolve `insufficient-evidence` para qualquer mundo
`activating` com efeitos já aplicados: o A2 não executa ativação, então não pode
atestar que os efeitos vieram daquela operação. `transitionStorageOperation`
exige `interrupted` e recusaria. Quem produziu os efeitos é o importador, então é
ele que reconfere todas as pré-condições — receipt único, `kind`, `status`,
`stagedGenerationId`, `targetCoreRaw`, geração ativa e core byte a byte, antes e
depois — e chama `transitionStorageOperationIfUnambiguous` com CAS. **A fachada
A2 e `evaluateStorageOperationCompatibility` não foram alteradas.** Em
`activated → settled` o mundo volta a ser coerente para o avaliador e a fachada é
usada normalmente.

### Compensação e estado ambíguo

Compensação só acontece quando o estado é **comprovável**. Antes de qualquer
efeito: reverte o receipt e limpa a geração criada por esta operação. Depois da
ativação: restaura a geração anterior com CAS e só então reverte; se a restauração
não se confirma, o receipt fica aberto de propósito.

Se a chave principal contiver um terceiro valor, ou se a releitura falhar, o
importador **não adivinha**: não sobrescreve o valor alheio, não apaga geração
nenhuma, não marca `settled` nem `reverted`, e devolve `recovery-required` com os
dois mundos ainda registrados no journal.

A limpeza de geração tem guarda tripla — só a geração nomeada pelo journal, que
não seja a ativa e não seja a anterior. **A geração anterior nunca é apagada.**

### Resolvedor puro

`resolveLogicalImportRecovery` recebe uma fotografia explícita (receipt, core
atual, metadata, gerações conhecidas, integridade observada) e devolve uma união
fechada de decisões: `no-operation`, `already-settled`, `stage-generation`,
`verify-staging`, `prepare-core`, `activate-generation`, `commit-core`,
`verify-target`, `mark-activated`, `settle`, `revert-safe`,
`cleanup-inactive-staging`, `recovery-required`, `impossible-state`. Sem
`localStorage`, sem IndexedDB, sem relógio, sem UUID, sem mutação, sem efeito.

**Ele apenas decide.** A execução dessas decisões depois de um reload é o slice
C2, e a ligação com o boot é o D. **A recuperação após interrupção ainda não
está funcionando** — ver 17B-002D-C1-P0.

### Privacidade

Nenhum retorno público carrega raw, trecho de JSON, `previousCoreRaw`,
`targetCoreRaw`, nome, e-mail, `sessionId`, conteúdo de treino, mensagem nativa
de `JSON.parse` ou texto controlado pelo arquivo. Toda mensagem de erro é
constante do módulo. Saem apenas: motivo fechado, `operationId`, `generationId`,
`payloadDigest`, contagens, datas canônicas, preview sanitizado e o resultado da
compensação. `cause` só de infraestrutura interna confiável. Os dois cores
completos permanecem privados dentro do receipt no IndexedDB.

## Corretivo 055 — compensação da importação v2 (GOAL-17B-002D-C1)

A auditoria independente 054 classificou o C1 como **APTO / Classe B** e apontou
um risco **P1** na compensação: `restoreRollingBackup` reescrevia ou removia a
cópia rolante do core **incondicionalmente**, mesmo quando ela já havia sido
alterada por outra aba ou processo. O corretivo removeu essa restauração.

### Política da cópia rolante

1. A cópia rolante é **auxiliar**. O estado canônico é a chave principal mais a
   geração ativa.
2. Depois que a importação grava `previousCoreRaw` na cópia, esse valor **já é um
   backup válido** do estado anterior.
3. Uma falha posterior **não** exige restaurar o valor mais antigo da cópia.
4. A compensação **nunca** executa `setItem(backupKey, valorAnterior)`,
   **nunca** executa `removeItem(backupKey)` e não faz escrita de "melhor
   esforço" sobre a cópia.
5. Se outra aba mudar a cópia, a operação a deixa **intacta**.
6. Se a leitura da cópia falhar, a operação **não tenta escrevê-la**.

Resultados possíveis, todos aceitos como estão: cópia com `previousCoreRaw`,
cópia com outro valor, cópia ausente, cópia ilegível.

**Uma importação abortada pode deixar a cópia rolante atualizada para
`previousCoreRaw`.** Isso é seguro e não altera o estado canônico: esse raw é
exatamente o core anterior, verificado no W0 e guardado inteiro no journal.

O caminho saudável não foi enfraquecido: antes de gravar o core alvo a operação
continua salvando `previousCoreRaw` na chave oficial da cópia e continua exigindo
o readback dela antes de tocar na chave principal.

### Falha da cópia rolante antes do commit do core

Quando a escrita ou o readback da cópia falha, `targetCoreRaw` não é gravado e a
chave principal é **relida** para decidir:

| Chave principal relida | Ação |
| --- | --- |
| ainda `previousCoreRaw` | reativa `previousGenerationId` com CAS, confirma a geração anterior, marca o receipt como `reverted`, limpa G só se inativa e sob a guarda tripla, deixa a cópia como está |
| já `targetCoreRaw` | não finge que nada foi aplicado: preserva o journal e devolve `recovery-required` |
| terceiro valor | não sobrescreve, não remove, preserva o journal e devolve `recovery-required` |

### Falha de `getItem`

Uma leitura que estoura **não prova nada** sobre o estado canônico. Nesses casos
o fluxo preserva o journal, não escreve na chave principal, não escreve na cópia
rolante, não remove nada e devolve `storage-unavailable` antes do commit do core
ou `recovery-required` a partir dele. A causa nativa **não sobe**: `RawRead` nem
sequer captura o erro lançado pelo `StorageLike`.

### Classificação estrutural de quota

`isQuotaFailure` passou a aceitar apenas sinais estruturais: `error.name`
`QuotaExceededError` ou `NS_ERROR_DOM_QUOTA_REACHED`, e os códigos legados 22 e
1014 **quando o erro é um `DOMException` de verdade**. A mensagem deixou de
contar: num erro vindo do `StorageLike` do chamador ela é texto controlado por
quem chamou, e `message.includes('quota')` transformava qualquer `TypeError`,
`AbortError` ou erro genérico numa falha de espaço. `storage.ts` não foi tocado.

### Readback do receipt depois de `activating → activated`

`transitionStorageOperationIfUnambiguous` confere, dentro da própria transação,
formato de todos os receipts, unicidade da operação não terminal, `status`, zero
conclusão pendente e CAS da geração ativa — mas **não** reconfere
`stagedGenerationId` nem `targetCoreRaw`. Uma mutação desses campos dentro da
janela passaria despercebida lá dentro, então o importador relê o receipt depois
da transição e exige que ele ainda nomeie os dois mundos. Se não nomear, o
settlement não acontece, o journal é preservado e o retorno é
`recovery-required`.

**A janela TOCTOU do W8 continua aberta** entre as pré-condições conferidas por
este módulo e o início da transação da primitiva. Fechá-la exige owner-token, que
é do C2/E. A primitiva IndexedDB e a fachada A2 **não foram alteradas**.

### Privacidade conferida por inspeção recursiva

Os testes varrem o retorno público recursivamente — propriedades enumeráveis e
**não enumeráveis**, `Error.name`, `Error.message`, `Error.stack`, `Error.cause`,
causas aninhadas, arrays, `Map`, `Set` e o serializado — porque
`JSON.stringify(erro)` devolve `{}` e não provaria nada. Nenhuma sentinela
(arquivo, core anterior, core alvo, nome, e-mail, `sessionId`, treino ou mensagem
lançada pelo storage) aparece em `reason`, `error`, `backupReason`,
`compensation`, `preview`, `cause`, `message`, `stack`, nem em `console`.

## Recuperação da importação v2 interrompida (GOAL-17B-002D-C2)

O C1 grava um journal correto quando cai. O C2 é quem lê esse journal depois do
reload e leva o armazenamento de volta a um mundo íntegro. Ele está **pronto e
testado, e ainda não é chamado por ninguém**: não há integração com o boot,
Provider, Context, AdminPanel, UI nem call site. `hydrate` e `metadataMatchesV2`
não foram tocados.

### O arquivo original não existe mais

Depois de um reload não há `raw`, não há payload lógico e não há como recalcular
`targetCoreRaw`. `recoverLogicalStorageImportV2` não os recebe, não os
reconstrói e não os pede: toda evidência vem do journal e do armazenamento
atual. A direção da convergência é dedução, não preferência —

- receipt `staged`: o mundo importado não foi materializado em lugar nenhum, e a
  operação converge **para trás**, para o mundo anterior que o journal guarda
  inteiro;
- receipt `activating` ou `activated`: os dois mundos existem no disco, e a
  operação converge **para a frente**.

### Os quatro mundos do `activating`

| Mundo | `activeGeneration` | core | Ação |
| --- | --- | --- | --- |
| A | anterior | anterior | verifica G integralmente e ativa com CAS |
| B | G | anterior | verifica G e reexecuta o protocolo byte-exato do core |
| C | G | alvo | verifica o alvo e marca `activated` pela primitiva A1 |
| D | anterior | alvo | não nasce da ordem geração → core: bloqueia |

O MUNDO D não é produzido pela ordem oficial de escrita. A recuperação não ativa,
não reverte e não sobrescreve — ela devolve `recovery-required` com o journal
intacto. O mesmo vale para terceira geração ativa, terceiro valor de core, G
ausente, T ou P divergentes, receipt alterado, `migrationGeneration` preenchida,
conclusão pendente e múltiplos receipts não terminais.

### Protocolo byte-exato reexecutado

O core alvo sai **exclusivamente** de `receipt.targetCoreRaw`; nada é
reconstruído e nenhum `savedAt` novo é cunhado. Antes de gravar, a recuperação
confirma que o alvo parseia como envelope v2, que ele aponta para a geração
preparada, que o instante é canônico, que a geração ativa já é G e que o core
atual ainda é o anterior. Depois, o mesmo protocolo do W6: cópia rolante,
readback da cópia, releitura da principal, gravação e readback final.

**A cópia rolante nunca é compensada para trás** — nem `setItem` do valor
anterior, nem `removeItem`, nem escrita de melhor esforço. Se ela contém o core
anterior, fica assim; se contém outro valor, fica assim; se a leitura falha, nem
tentamos escrevê-la.

### Laço fechado e readback obrigatório

`MAX_RECOVERY_STEPS = 12`, contra sete passos do pior caminho real. Depois de
**cada** escrita o motor relê core, metadata, receipt e snapshot administrativo e
roda o resolvedor de novo: nunca assume que a escrita anterior venceu. Não há
recursão, `setTimeout`, espera por tempo nem retry por atraso. Atingir o limite
devolve `recovery-step-limit` com o journal preservado.

### A geração anterior nunca é apagada

Nenhum caminho chama `clearInactiveGeneration` sobre a geração anterior. A
geração preparada só pode ser limpa quando o receipt está `reverted`, ela está
inativa, não é a anterior, é exatamente o `stagedGenerationId` do journal, a
metadata foi relida e a geração anterior foi verificada integralmente. Falha de
limpeza produz **órfã segura** (`cleanupPending: true`) — nunca perda de dados, e
nunca um receipt terminal que volta a ser não terminal.

### Privacidade sem `cause`

A API nova **não tem canal de `cause`**: nenhum `Error` do adapter ou do runtime
sobe, e nenhuma mensagem nativa de `localStorage` ou de IndexedDB é repassada. O
retorno público tem exatamente `status`/`reason` fechados, uma mensagem constante
do módulo, `operationId`, `generationId`, contagem de passos, ação final,
`recoveryRequired` e `cleanupPending`. O receipt completo nunca sai. Os retornos
históricos do C1 não foram alterados.

### O que continua não existindo

- **Nenhuma atomicidade única entre `localStorage` e IndexedDB.** A janela é a
  mesma da importação — uma escrita síncrona de `localStorage` — e leitura
  ilegível ou terceiro valor preservam o journal em vez de adivinhar.
- **Nenhuma chamada no boot.** O **slice D é obrigatório antes de qualquer
  exposição**; ele é quem chama a recuperação antes da hidratação normal.
- **Nenhuma UI e nenhum call site.** A importação não está disponível ao usuário.
- **Owner-token continua pendente para o E**, e com ele a janela TOCTOU do W8 e a
  serialização entre abas.
- **D/E/F não iniciados.**

## Limitações restantes

- `localStorage` é síncrono e não possui transação/lock entre abas; última escrita concorrente vence.
- O backup fica no mesmo aparelho/origin e pode desaparecer se o usuário limpar os dados do app.
- Limites reais de quota variam por navegador/WebView.
- Download/import precisam de validação adicional em dispositivos Capacitor físicos.
- Não há nuvem, criptografia ou sincronização entre aparelhos.

## GOAL-17B-002D-D1 — a barreira de boot

O primeiro passo do boot deixou de ser a hidratação. Agora é a recuperação da
importação lógica v2.

### Ordem real

1. adapter IndexedDB e runtime híbrido preparados pelo Provider;
2. `runStorageBootRecoveryOnce` — recuperação administrativa da importação;
3. resultado terminal seguro confirmado;
4. `runtime.hydrate()`;
5. conciliação dos completion receipts, dentro da hidratação, como já era;
6. estado publicado no Context.

A recuperação roda antes até da migração legada v0→v1, porque a migração
**escreve** e nenhuma escrita pode preceder a decisão.

### O que libera e o que bloqueia

Liberam: `no-operation`, `settled`, `already-settled`, `reverted`,
`already-reverted`. `administration-unavailable` só libera depois de metadados
administrativos totalmente vazios e prova física read-only: chave principal
ausente (instalação nova ou fluxo legado suportado antes da migração) ou envelope
v1 válido.

Bloqueiam antes do runtime: core v2 válido, corrupt com
`physicalVersion === 2` e falha de leitura viram
`blocked-storage-unavailable`; evidência administrativa parcial, status
desconhecido e exceção inesperada viram `blocked-recovery-required`.

Raw corrupt sem versão v2 comprovável, corrupt com outra versão numérica e
unsupported recebem `ready-for-blocked-storage-classification`. Isso não é
hidratação bem-sucedida: a migração é ignorada e o runtime só pode devolver
`mode = blocked`, preservando o raw e as capacidades de restore v1, recomeço
explícito e download já existentes. A classificação reutiliza
`parsePhysicalEnvelope`; não há parser paralelo nem escrita durante a prova.

### Quando bloqueia

Não publica estado de usuário, não escreve em `localStorage`, não limpa o
IndexedDB, não apaga geração e não publica usuário default. No bloqueio anterior
ao runtime, `hydrated` continua falso. Na classificação bloqueada ele fica
verdadeiro somente para liberar a superfície de recuperação; como
`storageBlockedRef` permanece verdadeiro, autosave e flush não escrevem. O raw
só permanece internamente no `StorageIssue` já existente para download
explícito; o resultado do boot não o carrega.

### Strict Mode

As duas montagens compartilham a MESMA execução física, por uma trava de ciclo
(`WeakMap` por `storage` e chave, removida quando a promessa assenta). Um remount
posterior executa de novo, de forma idempotente. Sem flag global eterna, sem
timer e sem depender de ordem de microtasks.

### Guards e conclusão local

A auditoria D0 foi Classe B. A implementação inicialmente parou nos guards de
zero call site herdados de C1/C2; a liberação mínima alterou apenas os testes 60,
195 e 197 de `storage-logical-import.test.ts`. Eles continuam com varredura de
todo `src/` e igualdade exata, autorizando somente
`storage-boot-recovery.ts` como call site de
`recoverLogicalStorageImportV2`. O guard independente de
`commitLogicalStorageImportV2` continua provando zero call site.

O D1 está concluído localmente: o P0 de instalação nova/v1 foi resolvido e a
ambiguidade P2 foi reduzida sem mudar C2. Se existe core v2, administração
indisponível nunca equivale a instalação nova. Completion receipts continuam
materializados e liquidados depois de `hydrate()` e antes da publicação de
prontidão; o D1 não os cria nem os liquida.

O comando 061 ficou bloqueado por dois testes baseline corretos. O desbloqueio
062 os preservou sem alterar `GymFlowContext.storage.test.tsx`: raw corrompido
sem v2 comprovável continua bloqueado, mas mantém recuperação legada explícita.
Corrupt v2 e v2 válido com IndexedDB indisponível continuam totalmente
bloqueados, e `getItem` indisponível só produz mensagem sanitizada.

### O que continua não existindo

- **Nenhum restore manual, rollback manual, reset ou retenção automática.**
- **Nenhuma UI nova.** O bloqueio reutiliza `storageHealth` e o aviso existente.
- **A importação continua indisponível ao usuário**, e
  `commitLogicalStorageImportV2` continua sem nenhum call site.
- **Owner-token continua pendente para o E**, com a janela TOCTOU do W8 e a
  serialização entre abas.
- **D2/E/F não iniciados.**
