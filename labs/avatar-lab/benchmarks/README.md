# Avatar Lab — Benchmarks (centro de pesquisa)

Hub das **11 dimensões de benchmark** do laboratório. Objetivo: transformar "achei bonito/rápido" em **dados objetivos e comparáveis**, para que o vencedor seja escolhido pelo melhor **equilíbrio** (visual + performance + manutenção + escalabilidade), não pelo "mais bonito".

## As 11 dimensões
| # | Dimensão | Arquivo | Fonte do dado |
|---|---|---|---|
| 1 | Ferramentas | [`BENCHMARK_TOOLS.md`](BENCHMARK_TOOLS.md) | 🧠 pesquisa (LAB_001) + 🔬 testes |
| 2 | Avatares | [`BENCHMARK_AVATARS.md`](BENCHMARK_AVATARS.md) | 🔬 analisador (`drop/` → `_auto/`) |
| 3 | Rigs | [`BENCHMARK_RIGS.md`](BENCHMARK_RIGS.md) | 🔬 analisador (nomes de bones) + skeleton-ref |
| 4 | Animações | [`BENCHMARK_ANIMATIONS.md`](BENCHMARK_ANIMATIONS.md) | 🔬 analisador (duração) + 👁️ revisão |
| 5 | Formatos | [`BENCHMARK_FORMATS.md`](BENCHMARK_FORMATS.md) | 🧠 conhecimento consolidado |
| 6 | Pipelines | [`BENCHMARK_PIPELINES.md`](BENCHMARK_PIPELINES.md) | 🧠 conhecimento + tempo medido |
| 7 | Licenças | [`BENCHMARK_LICENSES.md`](BENCHMARK_LICENSES.md) | 🧠 pesquisa (volátil — confirmar) |
| 8 | Performance | [`BENCHMARK_PERFORMANCE.md`](BENCHMARK_PERFORMANCE.md) | 🔬 proxy estático + harness (futuro) |
| 9 | Qualidade visual | [`BENCHMARK_VISUAL.md`](BENCHMARK_VISUAL.md) | 👁️ humano (sidecar) |
| 10 | Integração Three.js | [`BENCHMARK_THREEJS.md`](BENCHMARK_THREEJS.md) | 🧠 conhecimento + 🔬 teste de carga |
| 11 | Integração React Three Fiber | [`BENCHMARK_R3F.md`](BENCHMARK_R3F.md) | 🧠 conhecimento + 🔬 teste de carga |

Legenda: 🧠 saber consolidado (com fontes) · 🔬 dado objetivo do analisador · 👁️ avaliação humana · 

## Como as dimensões alimentam a decisão em 2 eixos
- **Eixo 1 — Qualidade Visual:** dimensão 9 (humano) — autoridade; dimensão 2 traz proxies.
- **Eixo 2 — Viabilidade Técnica:** dimensões 3, 4, 5, 6, 8, 10, 11 — a maioria sai objetiva do analisador.
- **Filtros transversais:** dimensão 7 (licença → eixo comercial) e os **portões eliminatórios** (`tools/rubric.json → gates`).
- O cálculo final e os portões estão codificados em [`../tools/analyze-glb.mjs`](../tools/analyze-glb.mjs); a régua em [`../tools/rubric.json`](../tools/rubric.json).

## Cadeia da fonte da verdade
1. Você gera o GLB → `drop/`.
2. `tools/analyze-glb.mjs` → `results/_auto/report-*.md|json` (objetivo).
3. Você revisa o visual → preenche `drop/<nome>.meta.json` (`visual{}`).
4. Os números entram em `BENCHMARK_AVATARS.md` e no ranking de `GYMFLOW_AVATAR_LAB_RESULTS_v01.md`.
5. Decisão final em 2 eixos → vencedor.

> **Regra de isolamento:** nada aqui altera `src/`, Motion Engine, POC, `avatar-config.ts`. É pesquisa e medição. Asset só migra ao produto após decisão formal (portões da Bíblia/E0).
