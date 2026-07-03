# GymFlow Avatar Lab 🔬

**Frente de P&D isolada + centro de pesquisa.** Descobrir qual **pipeline** produz o melhor avatar para o GymFlow AI — com **dados objetivos**, não achismo.

## Estratégia atual (jun/2026): "você gera, eu analiso"
O lab **não depende** de controlar o navegador. A divisão é:
- **Você** abre cada ferramenta (Meshy, Tripo, MetaPerson, CC5…), gera os avatares e **baixa os GLBs**.
- **O lab** recebe os GLBs em `drop/`, roda o **analisador** e produz métricas objetivas + notas por eixo + ranking.
- O que exige **olhos** (qualidade visual) ou **render** (FPS) é marcado como **pendente** e preenchido por você no `.meta.json` / pelo harness — **nunca inventado**.

## ⚠️ Regra de isolamento (inegociável)
Nada aqui altera o **GymFlow AI** (`src/`), a **Motion Engine**, a **POC** (`/poc-3d`), `avatar-config.ts`, `GymFlowAvatarViewer`/`Stage`, nem instala dependências no projeto. Assets de teste ficam **aqui dentro** (`drop/`), nunca em `public/assets/`. Migração ao produto só após decisão formal (portões da Bíblia/E0).

## Estrutura
```
labs/avatar-lab/
├─ README.md                        ← este arquivo
├─ GYMFLOW_AVATAR_LAB_001.md        ← relatório de levantamento (ferramentas, veredito)
├─ tools/                           ← PIPELINE GLB → notas (Node puro, sem deps)
│  ├─ analyze-glb.mjs               ·  entra GLB, sai relatório .md/.json
│  ├─ rubric.json                   ·  faixas, pesos dos eixos, portões (editável)
│  ├─ _selftest.mjs                 ·  teste de regressão (GLBs sintéticos)
│  └─ README.md                     ·  como rodar
├─ drop/                            ← VOCÊ coloca os .glb aqui (+ <nome>.meta.json)
│  ├─ README.md  ·  _TEMPLATE.meta.json
├─ benchmarks/                      ← centro de pesquisa: 11 dimensões
│  └─ README.md + BENCHMARK_*.md
├─ checklists/                      ← geração · exportação · avaliação · aprovação
├─ experiments/                     ← Test Card por ferramenta
└─ results/                         ← prompts, resultados, comparações
   ├─ STANDARD_PROMPT.md  ·  PROMPTS_PER_TOOL.md
   ├─ GYMFLOW_AVATAR_LAB_RESULTS_v01.md
   ├─ EXECUTION_AND_ALTERNATIVES.md
   └─ _auto/                        ·  relatórios gerados pelo analisador
```

## Fluxo de ponta a ponta
1. Gerar (ferramentas) → `checklists/GENERATION_CHECKLIST.md` + `results/PROMPTS_PER_TOOL.md`.
2. Exportar GLB → `drop/` → `checklists/EXPORT_CHECKLIST.md`.
3. Analisar → `cd tools && node analyze-glb.mjs` → `results/_auto/`.
4. Avaliar (visual + técnico) → `checklists/EVALUATION_CHECKLIST.md`.
5. Decidir vencedor → `checklists/APPROVAL_CRITERIA.md` (2 eixos + portões).

## Status
- **LAB_001** (levantamento + recomendação): ✅
- **Apparato de medição** (analisador + rubrica + benchmarks + checklists): ✅ **pronto e testado** (`_selftest.mjs` passa).
- **Resultados reais:** ⏳ aguardando você gerar/baixar os primeiros GLBs em `drop/`.

> Referências (`docs/`): `GYMFLOW_ART_BIBLE_V1.md`, `GYMFLOW_MOTION_STUDIO_E0_ASSET_PRODUCTION_PLAN.md`, `GYMFLOW_MOTION_ENGINE_SPEC_v01.md`, `GYMFLOW_ASSET_SELECTION_001.md`, `GYMFLOW_MOTION_STUDIO_HIRING_001.md`.
