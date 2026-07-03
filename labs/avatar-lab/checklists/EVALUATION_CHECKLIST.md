# Checklist — AVALIAÇÃO (transformar GLB em notas)

Objetivo: fechar os **2 eixos** (visual + técnico) de cada avatar, sem inventar nada.

## 1. Objetivo (automático)
- [ ] `cd ../tools && node analyze-glb.mjs` (analisa `../drop/`).
- [ ] Abrir `../results/_auto/report-<timestamp>.md`.
- [ ] Conferir: peso, tris, bones, textura, compressão, extensões, **gerador**.
- [ ] Ver portões: alguma falha **objetiva** (peso >8MB, extensão obrigatória não suportada, sem rig)?

## 2. Visual (humano — você olha)
- [ ] Abrir as 4 capturas (`../results/<ferramenta>/`) + o GLB num viewer.
- [ ] Pontuar 0–10 pela régua de `../benchmarks/BENCHMARK_VISUAL.md`: geral, **rosto**, **mãos**, pele, roupa, anatomia, uncanny, premium.
- [ ] Aplicar o teste decisivo: **"Eu pagaria por um app com esse personagem?"**
- [ ] Escrever os números em `../drop/<nome>.meta.json → visual{}`.

## 3. Fechar a nota
- [ ] Re-rodar o analisador (agora ele usa as notas visuais e fecha o eixo visual).
- [ ] Conferir **portões visuais**: mãos <6 ou rosto <6 → **reprovado**.
- [ ] Anotar a **nota final** (provisória até FPS) e o "por que X lidera".

## 4. Técnico de carga (quando houver harness)
- [ ] Carregar no harness do lab → medir TTFR + FPS desktop/mobile.
- [ ] Preencher `tecnico{fpsDesktop,fpsMobile,tempo_carregamento_ms}` no `.meta.json`.
- [ ] Re-rodar → fecha eixo performance + portão **FPS mobile ≥30**.

## 5. Registrar nos benchmarks
- [ ] Copiar a linha do relatório para `../benchmarks/BENCHMARK_AVATARS.md`.
- [ ] Bones/conformidade → `BENCHMARK_RIGS.md`; clipes → `BENCHMARK_ANIMATIONS.md`.
- [ ] Atualizar o ranking em `../results/GYMFLOW_AVATAR_LAB_RESULTS_v01.md`.

## 6. Pós-produção (estimativa honesta)
- [ ] Preencher a Fase 7 (% trabalho humano) no Test Card / RESULTS: rosto, mãos, roupa, rig, texturas, biomecânica.

> Próximo: `APPROVAL_CRITERIA.md`.
