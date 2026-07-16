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

Não há `v: 2`, IndexedDB, sincronização remota ou mudança no shape de treino.

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
