# Benchmark 8 — Performance

Orçamentos de runtime (do `GYMFLOW_MOTION_ENGINE_SPEC_v01` / E0) e **como medimos cada coisa hoje vs. depois**. Princípio honesto: o que sai dos **bytes** é medido agora; **FPS/carregamento** exigem render → harness do lab (futuro, com autorização). Nada de FPS inventado.

## Orçamentos-alvo
| Métrica | Ideal | Teto | Medição |
|---|---|---|---|
| Triângulos (avatar) | ≤40k | ≤60k | 🔬 analisador (bytes) |
| Bones | ~65 | ≤70 | 🔬 analisador (skin.joints) |
| Peso GLB (avatar) | ≤6 MB | ≤8 MB | 🔬 analisador (`fs.stat`) |
| Clip de animação | ≤300 KB | ≤600 KB | 🔬 analisador (acessores do clip) |
| Textura (px) | ≤2048 | ≤4096 | 🔬 analisador (cabeçalho PNG/JPEG/KTX2) |
| FPS desktop | ≥60 | — | ⏳ harness (render) |
| FPS mobile (device mediano) | ≥30 | — | ⏳ harness (render) |
| Tempo de carregamento (TTFR) | dentro do alvo SPIKE | — | ⏳ harness (render) |

## O que o analisador já entrega como **proxy de performance** (sem render)
- `fileSizeMB` → banda de peso.
- `maxTexturePx` → banda de textura (VRAM/banda).
- `primitiveCount` → proxy de **draw calls**.
- `triangles` → custo de vértices.
- bônus se `Draco/Meshopt` (geo comprimida) e `KTX2` (textura GPU comprimida).
- Saída: **nota de performance (proxy)**, claramente rotulada como estática.

## Por que isso não é FPS
Proxy estático **correlaciona** com performance, mas FPS real depende de shaders, número de luzes, postprocessing, resolução, device e do próprio runtime. Por isso o **eixo performance** mostra a nota-proxy **e** mantém "FPS pendente". A nota vira definitiva quando o harness medir.

## Plano do harness de medição (futuro, com autorização)
Um app mínimo **dentro de `labs/`** (NÃO na POC, NÃO no GymFlow AI) que:
1. Carrega um GLB via `useGLTF`/`GLTFLoader`.
2. Roda um clip simples (ou T-pose) numa câmera fixa.
3. Mede **TTFR** (tempo até primeiro frame com o modelo) e **FPS** médio/1% low.
4. Repete em **mobile emulado** (throttling de CPU/GPU) e, se possível, device real.
5. Grava os números no `<nome>.meta.json` (`tecnico.fpsDesktop/fpsMobile/tempo_carregamento_ms`).
6. O analisador então fecha o **eixo performance** e checa o **portão FPS mobile ≥ 30**.

> O harness é **código isolado no lab**; só será criado quando houver um GLB real e autorização explícita. Até lá, FPS = pendente (não estimado como se fosse medido).
