# Animações 3D (.glb com AnimationClips)

Coloque aqui os clipes de animação de execução de exercícios. Cada arquivo `.glb`
deve conter um ou mais `AnimationClip` aplicáveis ao skeleton dos avatares.

## Estratégia recomendada
- Use **Mixamo**: escolha a animação (ex.: "Squat", "Bench Press"), baixe **FBX (with skin)**
  ou **FBX without skin**, e **converta para .glb** (Blender ou `FBX2glTF`).
- Mantenha **um skeleton padrão** (Mixamo) em avatares e animações para o **retargeting**
  funcionar via `AnimationMixer`/`useAnimations` sem reescrever bones.

## Arquivos sugeridos (veja o registro em `avatar-config.ts`)
| Arquivo | Clipe lógico | Exercícios mapeados |
|---|---|---|
| `squat.glb`        | `squat`        | agachamento / leg press |
| `bench-press.glb`  | `bench_press`  | supino / pushup / desenvolvimento |
| `deadlift.glb`     | `deadlift`     | terra / stiff |
| `row.glb`          | `row`          | remada / puxada |
| `hip-thrust.glb`   | `hip_thrust`   | elevação pélvica / glúteos |
| `biceps-curl.glb`  | `biceps_curl`  | rosca |
| `idle.glb`         | `idle`         | fallback / respiração |

## Como ativar
1. Coloque o `.glb` da animação aqui.
2. Em `avatar-config.ts`, no registro `ANIMATIONS`, aponte `path` para o arquivo e marque `available: true`.
3. O `EXERCISE_ANIMATION_MAP` resolve `exerciseId → animationId`.

> Animações **embutidas no próprio modelo do avatar** também funcionam: o viewer lê `model.animations`.
> Arquivos separados são preferíveis para reuso entre avatares masculino/feminino.

## Conversão FBX → glb
- Blender: `Import FBX` → `Export glTF 2.0 (.glb)`.
- CLI: [`FBX2glTF`](https://github.com/facebookincubator/FBX2glTF) ou [`fbx-to-gltf`].
- Otimização: [`gltf-transform`](https://gltf-transform.dev/) para Draco/Meshopt e dedupe.
