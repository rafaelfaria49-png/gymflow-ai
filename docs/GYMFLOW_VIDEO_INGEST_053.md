# GOAL-053 — Ingestão de Vídeos Técnicos Aprovados (CDN Real)

Data: 2026-09-10 · Base: `dcd1e38` · Sucessor do GOAL-052 (parado em `CDN_BLOCKED`).

## Origem remota provisionada

- Provider: **Vercel Blob** (public storage), store `gymflow-media` (`store_JMnPdTXAHHB8XOBk`), região `iad1`.
- Base URL real: `https://jmnpdtxahhb8xobk.public.blob.vercel-storage.com` (refletida em `cdnBaseUrl` dos manifests).
- Store criada sem gate de cobrança (plano Hobby); conectada ao projeto Vercel `gymflow` (`prj_xgWgYaxraom2GlyM5rcprGdAeJfe`).
- `assets.gymflow.ai` deixou de ser tratado como operacional (domínio não resolve DNS — diagnóstico GOAL-052).
- D14 preservada: nenhum binário de vídeo em `public/` ou `src/`; nenhum MP4 no Git.

## Inventário da ingestão

| exerciseId | source | arquivo normalizado | remote URL/host | bytes | duração | SHA-256 | approval status | manifest status | block reason |
|---|---|---|---|---|---|---|---|---|---|
| `back_remada_baixa` | `C:\Users\rafae\Downloads\Remada sentada com triângulo na polia baixa..mp4` (720×1264, 145f @24fps, AAC estéreo, 2.837.304 B, `238e4257732a…a89e72e`) | `C:\Users\rafae\Downloads\GYMFLOW_NORMALIZED\back_remada_baixa_v1.mp4` (fora do repo) | `https://jmnpdtxahhb8xobk.public.blob.vercel-storage.com/back_remada_baixa_v1.mp4` | 3.985.039 | 6,042 s (145f, preservada) | `93fc1fa4cb1a68f266c7d98e2b09229194e238ce91dd063ce239c41fdd161732` | APPROVAL_CONFIRMED | `approved` (v1) | — |
| `back_puxada_pulley` | `C:\Users\rafae\Downloads\Puxada alta aberta.mp4` | (não normalizado) | (não publicado) | — | 6,042 s | `7101a20bc23001635c43c9fec3db2190de32ae632d88f39c6ec8aefa3a7171da` (fonte) | APPROVAL_NOT_PROVEN | permanece `draft` | Aprovação não comprovada: as únicas evidências são nome de arquivo em Downloads e listagem de inventário ("já produzidos ou trabalhados") — categorias explicitamente insuficientes. Pendente metadado humano de aprovação. |
| — (BLOCKED_MAPPING) | `C:\Users\rafae\Downloads\Agachamento sumô na máquina.mp4` | (não normalizado) | (não publicado) | — | 6,042 s | `193311b24ec14ac0df3a7572061566a9e732cce435710ec1544251844a241544` (fonte) | APPROVAL_NOT_PROVEN ("exemplo do padrão alcançado" — categoria insuficiente) | não ingressou no manifest | BLOCKED_MAPPING: catálogo não possui "Agachamento Sumô na Máquina" (o único sumô canônico é `legs_agachamento_sumo_halter`, com halter — equipamento divergente). Não criar exerciseId neste GOAL. |

## Evidência de aprovação (`back_remada_baixa`)

- `GYMFLOW_VIDEO_SKILL (1).md` (pacote de produção do operador, mtime **2026-08-14T18:26:08.526Z** = 15:26:08-03:00), seção 8, declara textualmente: **"O vídeo aprovado conseguiu duas repetições completas em 6 segundos"** para a Remada Sentada com Triângulo na Polia Baixa.
- `approvedAt` no manifest = o timestamp de modificação do próprio documento de evidência; **nenhuma data histórica inventada**.
- Mapeamento canônico confirmado: catálogo (`src/mock/exercises.ts`) — "Remada Sentada com Triângulo", equipamento "Polia Baixa e Triângulo".

## Normalização (determinística, sem IA)

`ffmpeg -i <fonte> -vf "scale=1094:1920:flags=lanczos,crop=1080:1920:7:0,format=yuv420p" -r 24 -c:v libx264 -preset slow -crf 18 -an -movflags +faststart`

- Fonte 720×1264 (≈9:16.55) → scale Lanczos para 1094×1920 + crop central 1080×1920 (remove ~7 px por lado; sem deformação geométrica, sem alteração de movimento/anatomia).
- Saída validada com ffprobe: 1080×1920, h264, yuv420p, 24 fps, 145 frames (6,042 s), **0 streams de áudio**, `+faststart`.
- Originais preservados intactos em `C:\Users\rafae\Downloads`.

## Validação da URL remota (executada em 2026-09-10)

- HTTPS + GET → **HTTP 200**, `Content-Type: video/mp4`, `Content-Length: 3985039` ✓
- Range request (`bytes=0-1023`) → **HTTP 206**, `Accept-Ranges: bytes` ✓ (streaming/seek)
- `Access-Control-Allow-Origin: *` ✓ (Cache Storage web funcional)
- SHA-256 do download remoto = SHA-256 do arquivo normalizado ✓

## Contrato de manifest (GOAL-053)

- `version` 1 → 2; `cdnBaseUrl` → base URL real da store Vercel Blob.
- Somente `back_remada_baixa` foi publicado (status `approved` com `provenance.approval` real); os demais itens permanecem `draft`/`retired` intocados.
- Testes que fixavam o baseline antigo (`manifest.test.ts`, `scripts/media/manifest-validator.test.ts`) atualizados para o novo baseline honesto: 1 vídeo aprovado real.
