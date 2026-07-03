# Avatar Lab — `tools/` (pipeline GLB → notas)

Pipeline **sem dependências** (Node puro, v18+). Lê o binário GLB direto e produz **dados objetivos + notas por eixo + portões + ranking**. Não instala nada, não toca o GymFlow AI.

## Arquivos
| Arquivo | O quê |
|---|---|
| `analyze-glb.mjs` | O analisador. Entra GLB, sai relatório `.md` + `.json`. |
| `rubric.json` | A **rubrica** (faixas, pesos dos eixos, portões). Editar aqui muda o scoring sem mexer no código. |
| `_selftest.mjs` | Teste de fumaça: gera GLBs sintéticos e roda o analisador (regressão). |

## Como usar (o fluxo "você gera, eu analiso")
1. Você gera os avatares nas ferramentas (Meshy, Tripo, CC5, etc.) e **baixa os `.glb`**.
2. Coloca cada `.glb` em **`labs/avatar-lab/drop/`**.
3. (Recomendado) Cria ao lado um **`<nome>.meta.json`** com o que os bytes não contam (ferramenta, licença, custo, e — depois da revisão visual — as notas de rosto/mãos). Modelo em `drop/_TEMPLATE.meta.json`.
4. Roda:

```bash
cd labs/avatar-lab/tools
node analyze-glb.mjs                 # analisa tudo que está em ../drop
# ou um arquivo / pasta específicos:
node analyze-glb.mjs ../drop/gymflow_male_meshy.glb
node analyze-glb.mjs "C:\caminho\para\pasta_de_glbs"
```

5. Saída em `labs/avatar-lab/results/_auto/report-<timestamp>.md` (+ `.json`). Se houver 2+ GLBs, sai também a **comparação e o ranking** com o "por que X lidera".

## O que o analisador mede (objetivo, dos bytes)
Peso GLB · triângulos · vértices · bones + **nomes das bones** (para conferir o skeleton único) · meshes/primitives · materiais (PBR/normal/emissive) · maior textura (px) · animações + duração · compressão (Draco/Meshopt/KTX2) · extensões usadas/obrigatórias · **glTF version + gerador** (qual ferramenta produziu).

## O que ele NÃO inventa (honestidade)
Estes eixos **não saem dos bytes** e ficam marcados como *pendentes* até você fornecer:
- **Visual** (realismo/uncanny/pele/mãos/rosto) → precisa de **olhos**. Preencher `visual{}` no `.meta.json`. O analisador só dá um **proxy estático** (resolução de textura, normal maps, densidade de tris) para orientar — **não é** a nota visual.
- **FPS / tempo de carregamento** → precisa do **harness de render** do lab (a construir, com autorização). O `.meta.json` aceita `tecnico.fpsMobile`/`fpsDesktop` quando medidos.
- **Licença / custo** → vêm do `.meta.json`.
- **Topologia quad/edge-loops** → **impossível** ler do GLB (o GLB é sempre triangulado). Conferir no arquivo-fonte (FBX/.blend) ou no wireframe.

## Notas por eixo e nota final
6 eixos: **visual, técnica, performance, compatibilidade, manutenção, comercial**. Pesos em `rubric.json → axisWeights`. A **nota final é provisória** enquanto faltam eixos (renormaliza só os disponíveis e avisa o que falta). **Portões eliminatórios** (mãos/rosto < 6, FPS mobile < 30, peso > 8 MB, extensão obrigatória não suportada, sem rig) reprovam o asset independentemente da média.

## Regressão
```bash
node _selftest.mjs
```
Gera dois GLBs sintéticos (um "bom", um "ruim") em `_selftest_out/` e roda a análise. Serve para confirmar que o parser/scoring continua correto após editar a rubrica. Pode apagar `_selftest_out/` depois.
