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
