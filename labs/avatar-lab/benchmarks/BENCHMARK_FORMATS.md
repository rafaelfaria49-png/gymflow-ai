# Benchmark 5 — Formatos

Qual formato de entrega serve ao GymFlow AI (runtime **web**, React Three Fiber + Three.js). Conclusão: **GLB é o formato canônico**; o resto entra como **fonte** (para reprocessar) ou **não serve** para runtime web.

| Formato | O que é | Web/R3F? | Rig/Anim | Compressão | Papel no GymFlow |
|---|---|:--:|:--:|---|---|
| **GLB** (.glb) | glTF 2.0 binário (1 arquivo: JSON+BIN+texturas) | ✅ **nativo** | ✅ skin+anim | Draco/Meshopt + KTX2 | **Entrega oficial** (runtime) |
| glTF + .bin + texturas | glTF 2.0 "solto" (vários arquivos) | ✅ | ✅ | idem | OK p/ debug; empacotar em GLB p/ entrega |
| **FBX** (.fbx) | formato Autodesk (rig/anim ricos) | ❌ (precisa converter) | ✅ forte | — | **Fonte/intercâmbio** (CC5, Mixamo) → Blender → GLB |
| **USDZ / USD** | pixar/Apple, AR | parcial (AR; não R3F padrão) | ✅ | — | Fora de escopo (AR futuro) |
| **VRM** | avatar humano (base glTF) | ✅ (loader extra) | ✅ + presets | glTF | Interessante p/ avatar, mas adiciona convenção própria; avaliar só se ganharmos algo |
| **.blend** | nativo Blender | ❌ | ✅ | — | **Fonte de produção** (não entrega) |
| OBJ / STL | malha pura | ⚠️/❌ | ❌ | — | Inútil p/ avatar animado |

## Por que GLB
- **Um arquivo** → 1 request, fácil de versionar/distribuir (CDN).
- **Carrega nativo** no `GLTFLoader` (Three.js) e `useGLTF` (drei/R3F) — ver `BENCHMARK_THREEJS.md` / `BENCHMARK_R3F.md`.
- Suporta **rig + animações + PBR + extensões de compressão** num pacote só.
- O analisador do lab lê GLB **direto** (sem libs).

## Verdade importante: topologia se perde no GLB
O GLB **sempre triangula** a malha. Edge-loops/quads do modelo-fonte **não sobrevivem** no GLB. Logo:
- O analisador **não** consegue julgar "quad vs triangle soup" pelo GLB.
- Para auditar topologia (essencial p/ deformação limpa em animação), use o **arquivo-fonte** (FBX/.blend) ou inspecione o **wireframe** no Blender/viewer.

## Regra prática de conversão
Qualquer coisa que não seja GLB e precise ir ao runtime passa por: **fonte (FBX/.blend) → Blender → glTF-transform (Draco/Meshopt + KTX2) → GLB**. Ver `BENCHMARK_PIPELINES.md`.
