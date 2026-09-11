# GOAL-059 — Ingestão do Vídeo Aprovado da Puxada Alta (CDN Real)

Data: 2026-09-11 · Base: `0a03f85748a0503ff9df9c09622e31c7feb58a2f` (`origin/master`) · Sucessor do GOAL-053/056 para `back_puxada_pulley`.

## Pré-flight

- `origin/master` exatamente na base esperada (`0a03f85…58a2f`); `HEAD == origin/master`; árvore rastreada limpa — nenhum WIP externo incorporado (stashes de outros branches não tocados).
- Fonte existe: `C:\Users\rafae\Downloads\Puxada alta aberta.mp4` (2.838.656 B).
- SHA-256 da fonte `7101a20bc23001635c43c9fec3db2190de32ae632d88f39c6ec8aefa3a7171da` — confere com o inventário do GOAL-053 (APPROVAL_NOT_PROVEN na época).
- `back_puxada_pulley` existe no catálogo (`src/mock/exercises.ts`): "Puxada Aberta no Pulley", equipamento "Polia Alta (Pulley)".
- Status do vídeo no manifest: `draft` (ambos os manifests, version 3 / schema 1.1.0).
- Store Vercel Blob `gymflow-media` (`store_JMnPdTXAHHB8XOBk`, `iad1`) operacional: `HEAD` no blob da remada retorna HTTP 200, `video/mp4`, `3985039` B, `Accept-Ranges: bytes`, `Access-Control-Allow-Origin: *`.
- Agachamento Sumô: intocado (sem exerciseId novo, sem upload).

## Operator approval

<a id="operator-approval"></a>

O operador Rafael aprovou explicitamente, neste handoff de coordenação do GOAL-059, o vídeo `C:\Users\rafae\Downloads\Puxada alta aberta.mp4` para o exercício canônico `back_puxada_pulley` ("Puxada Aberta no Pulley", equipamento "Polia Alta").

- O handoff identifica de forma inequívoca o par arquivo → exercício: `Puxada alta aberta.mp4` → `back_puxada_pulley`.
- Essa aprovação humana resolve o gate `APPROVAL_NOT_PROVEN` registrado para este vídeo nos GOALs 052/053.
- Não há timestamp exato documental do evento de aprovação a ser persistido: o manifest declara `approvedAtPrecision: 'unknown'`, omite `approvedAt` e cita esta seção como `approvalEvidenceRef`. Nenhum mtime de arquivo é usado como timestamp do evento (postura GOAL-056).

Manifest:

- `approvedBy = rafaelfaria49-png`
- `approvedAtPrecision = unknown`
- `approvedAt` = AUSENTE
- `approvalEvidenceRef = docs/GYMFLOW_VIDEO_INGEST_059.md#operator-approval`

## Validação da fonte (ffprobe, arquivo original)

| campo | valor medido |
|---|---|
| duration | 6.041667 s (~6,042 s) |
| frames | 145 |
| width × height | 720 × 1264 |
| fps | 24/1 (r_frame_rate e avg_frame_rate) |
| codec vídeo | h264, yuv420p |
| áudio | 1 stream AAC estéreo (48 kHz, 2 canais) + 1 stream mjpeg (capa anexada) |
| file size | 2.838.656 B |
| SHA-256 | `7101a20bc23001635c43c9fec3db2190de32ae632d88f39c6ec8aefa3a7171da` |

Sem divergência material do inventário do GOAL-053 (720×1264, 24 fps, h264, AAC presente, ~6,042 s) — ingestão autorizada a prosseguir.

## Inspeção de mapeamento — PASS

`Puxada alta aberta.mp4` → `back_puxada_pulley` → "Puxada Aberta no Pulley" → "Polia Alta (Pulley)".

Amostragem de frames (n=0/36/72/108/144 + varredura a 2 fps, 12 quadros): atleta sentado de costas, pegada pronada aberta na barra longa, puxada vertical pela frente até o peito superior em máquina de polia alta, retorno controlado com extensão total. Dois ciclos completos topo→base→topo em ~6 s (repCount = 2). É puxada vertical aberta em polia alta; não é puxada fechada/triângulo, supinada, por trás da nuca, nem outro exercício. Sem ambiguidade real — sem `BLOCKED_MAPPING`.

## Normalização (determinística, sem IA)

Comando (mesma receita do GOAL-053):

`ffmpeg -i <fonte> -vf "scale=1094:1920:flags=lanczos,crop=1080:1920:7:0,format=yuv420p" -r 24 -c:v libx264 -preset slow -crf 18 -an -movflags +faststart`

- Fonte 720×1264 → scale Lanczos 1094×1920 + crop 1080×1920 (~7 px por lado); sem deformação, sem alteração de movimento/anatomia/velocidade.
- Saída fora do repositório: `C:\Users\rafae\Downloads\GYMFLOW_NORMALIZED\back_puxada_pulley_v1.mp4`.
- Original preservado intacto.

Saída validada com ffprobe (valores reais):

- 1080×1920, h264, yuv420p, 24 fps, 145 frames, 6.041667 s (duração preservada), 1 stream (só vídeo — sem áudio), `moov` antes de `mdat` (`+faststart` confirmado), 4.148.838 B, SHA-256 `3a995473ccf46d2addc6a9a7a236c684aa5b1b8a417406bfd4624438b2d0bbdf`.

## Upload (store existente `gymflow-media`, sem nova store)

- Nome estável: `back_puxada_pulley_v1.mp4` (mesma convenção do primeiro vídeo).
- URL remota: `https://jmnpdtxahhb8xobk.public.blob.vercel-storage.com/back_puxada_pulley_v1.mp4`.
- Validação pós-upload (executada em 2026-09-11): `HEAD` → HTTP 200, `Content-Type: video/mp4`, `Content-Length: 4148838` (= arquivo local); `GET` com `Range: bytes=0-1023` → HTTP 206, `Content-Range: bytes 0-1023/4148838`, `Accept-Ranges: bytes`; `Access-Control-Allow-Origin: *`; download remoto integral com SHA-256 `3a995473ccf46d2addc6a9a7a236c684aa5b1b8a417406bfd4624438b2d0bbdf` = arquivo final local. Upload via token de projeto (Vercel CLI + `BLOB_READ_WRITE_TOKEN` do projeto, fora do Git). Nenhum token/secret exposto ou commitado.

## Manifest

- `src/domain/media/manifest.json` + `public/media-manifest.json` sincronizados; somente o asset `back_puxada_pulley` alterado; `schemaVersion` 1.1.0 mantida; `version` 3 → 4.
- Vídeo: url/bytes reais, 1080×1920, 24 fps, h264, durationSeconds/repCount/checksum reais, version 1, status `approved`, sem `approvedAt` falso.
- Proveniência (postura GOAL-056): `provider: grok` como identificação da ferramenta da frente de produção — o pacote `GYMFLOW_VIDEO_SKILL (1).md` define o pipeline ("criação do comando técnico para o Grok" → "geração do vídeo") e lista "Puxada alta frontal / puxada aberta no pulley" no inventário de exercícios produzidos/trabalhados; a fonte compartilha a assinatura técnica exata do lote GOAL-053 (720×1264, 145f @24fps). Nenhum `modelOrWorkflow`/run inventado, nenhuma `generatedAt` documental, nenhum `termsOrLicenseRef` (direitos/licença comercial não atestados por este manifest).

## Preservação

- `back_remada_baixa` (approved v1, blob/URL/bytes/checksum), Agachamento Sumô (sem exerciseId novo), player, cache engine, fallback engine, catálogo, Nutrition, session runtime e demais assets intocados. D14: zero binários de vídeo no Git/public/src.

## Smoke + testes + aceite (executados em 2026-09-11)

- Smoke (lógica de tiers contra o manifest real, arquivo temporário removido após execução): A. puxada Tier 1 `video` na URL remota aprovada — PASS; B. remada segue Tier 1 normal — PASS; C. draft (`chest_supino_reto`) não entra em Tier 1 — PASS; D. falha forçada (`failedUrls`) cai para fallback — PASS; E. offline com URL em cache reproduz (`video_cached`), offline sem cache não usa vídeo — PASS. 5/5.
- `npm run media:validate` — 10/10 PASS. `src/domain/media/manifest.test.ts` — 11/11 PASS.
- `npm test` — 2879/2880; 1 falha pre-existente no flake conhecido de fronteira UTC (`GymFlowContext.storage.test.tsx`), reproduzida em base limpa e classificada como não relacionada (ver `docs/GOALS_LOG.md`, entrada GOAL-059).
- `npx tsc --noEmit` — PASS. `npm run build` — PASS. `npm run build:mobile` — PASS. `git diff --check` — PASS.
- Aceite: PUXADA_STATUS `approved`; REMADA_STATUS `approved`; SUMO_STATUS `BLOCKED_UNCHANGED`; sem timestamp falso; sem claim comercial; manifests sincronizados; zero binários no Git; zero secrets commitados. P0 = 0, P1 = 0 (P2 = 0; P3 = 1 flake pre-existente documentado, fora do escopo deste GOAL).
