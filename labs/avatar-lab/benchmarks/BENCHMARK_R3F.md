# Benchmark 11 — Integração React Three Fiber

Camada React sobre o Three.js (ver `BENCHMARK_THREEJS.md`). No GymFlow: **R3F `9.6.1`** + **@react-three/drei `10.7.7`** + **three `0.184.0`**. Qualquer GLB válido carrega via `useGLTF`; o que decide é **qualidade/topologia/rig do conteúdo** e a **conformidade com o skeleton único**.

## API relevante (drei/R3F)
| Necessidade | API | Observação |
|---|---|---|
| Carregar GLB | `useGLTF(url)` (drei) | usa `GLTFLoader` por baixo; cacheia |
| Draco/Meshopt/KTX2 | `useGLTF` aceita configurar decoders | configurar conforme `extensionsUsed` |
| Animações | `useAnimations(animations, ref)` | dá `actions` por nome de clipe |
| Pré-carregar | `useGLTF.preload(url)` | evitar pop-in |
| Suspense | `<Suspense fallback>` | GLB carrega assíncrono |

## Como testar SEM tocar a POC
O teste de integração R3F roda no **harness isolado do lab** (`labs/...`, fora de `src/`). Padrão mínimo (referência — só no harness, com autorização):
```tsx
function Avatar({ url }: { url: string }) {
  const { scene, animations } = useGLTF(url)
  const { actions } = useAnimations(animations, useRef(null))
  // medir TTFR + FPS aqui (ver BENCHMARK_PERFORMANCE)
  return <primitive object={scene} />
}
```
> Isso **não** é o `GymFlowAvatarViewer` nem mexe em `avatar-config.ts`. É um harness de laboratório, descartável.

## Conformidade com o produto (quando migrar)
Para um GLB virar avatar oficial sem retrabalho no app, ele precisa:
- carregar em `useGLTF` sem decoder faltando;
- ter **rig conforme o skeleton único** (ver `BENCHMARK_RIGS.md`) → reuso de animações entre avatares;
- respeitar os **orçamentos** (`BENCHMARK_PERFORMANCE.md`);
- bater os tokens/enquadramento do `STAGE_CONFIG` (câmera/target) do produto.

## Resultado por avatar — *aguardando teste de carga*
| Avatar | `useGLTF` ok? | `useAnimations` ok? | Decoders | Conforma skeleton? | Nota R3F |
|---|:--:|:--:|---|:--:|:--:|
| — | — | — | — | — | — |

> Compatibilidade R3F ≈ compatibilidade Three.js + ergonomia React. As duas dimensões andam juntas; mantidas separadas porque você pediu medir as duas.
