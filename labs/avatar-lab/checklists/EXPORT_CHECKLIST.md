# Checklist — EXPORTAÇÃO (tirar o GLB pronto para o analisador)

Objetivo: ter um **`.glb`** limpo em `../drop/` com o **sidecar** ao lado.

## Exportar
- [ ] Formato: **GLB** (preferencial). Se a ferramenta só der FBX/glTF-solto, anotar — converter depois (Blender) é etapa de pipeline, não de teste inicial.
- [ ] Incluir: malha + **rig** (se houver) + animações (se houver) + **texturas embutidas**.
- [ ] (Se a ferramenta oferecer) baixar também **FBX** como fonte/backup.

## Otimização (se a ferramenta exportar "cru")
> Opcional no 1º teste; recomendado antes de comparar performance "de verdade".
- [ ] Compressão de geometria: **Draco** ou **Meshopt**.
- [ ] Texturas: **KTX2** (basis) quando possível.
- [ ] Mirar orçamentos de `../benchmarks/BENCHMARK_PERFORMANCE.md` (≤6MB ideal / ≤8MB teto).
- [ ] Ferramenta sugerida: glTF-transform (não instalar no GymFlow AI; rodar isolado/online).

## Nomear e posicionar
- [ ] Nome: `gymflow_<sexo>_<ferramenta>[_vN].glb` (ex.: `gymflow_male_meshy.glb`).
- [ ] Mover o `.glb` para **`../drop/`**.

## Sidecar (`<nome>.meta.json`)
- [ ] Copiar `../drop/_TEMPLATE.meta.json` → `../drop/<nome>.meta.json`.
- [ ] Preencher: ferramenta, plano, **licença**, custo, tempo, prompt usado, capturas.
- [ ] Deixar `visual{}` e `tecnico{fps}` como `null` por enquanto (entram na avaliação).

## Conferir
- [ ] `.glb` abre num viewer rápido (ex.: gltf-viewer online) sem erro.
- [ ] Rodar o analisador: `cd ../tools && node analyze-glb.mjs` → confere que apareceu no relatório.

> Próximo: `EVALUATION_CHECKLIST.md`.
