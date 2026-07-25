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

## Limitações restantes

- `localStorage` é síncrono e não possui transação/lock entre abas; última escrita concorrente vence.
- O backup fica no mesmo aparelho/origin e pode desaparecer se o usuário limpar os dados do app.
- Limites reais de quota variam por navegador/WebView.
- Download/import precisam de validação adicional em dispositivos Capacitor físicos.
- Não há nuvem, criptografia ou sincronização entre aparelhos.
