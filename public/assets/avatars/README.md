# Avatares 3D (.glb / .gltf)

Coloque aqui os modelos de avatar usados pelo pipeline 3D do GymFlow AI.

## Arquivos esperados (nomes default — veja `src/components/three/avatar-config.ts`)

| Arquivo | Gênero | Observação |
|---|---|---|
| `male.glb`   | Masculino | Avatar masculino com skeleton humanoide |
| `female.glb` | Feminino  | Avatar feminino com skeleton humanoide |
| `neutral.glb`| Neutro    | Opcional — fallback unissex |

## Requisitos do modelo
- Formato **`.glb`** (binário, recomendado) ou `.gltf` + `.bin`.
- Escala em **metros** (altura ~1.7–1.8). O viewer reenquadra automaticamente, mas escala coerente ajuda.
- Em **T-pose** ou **A-pose**, virado para **+Z** (de frente para a câmera).
- Skeleton **humanoide padrão** (Mixamo / Ready Player Me / VRM) — necessário para reaproveitar animações.
- Mantenha o polígono enxuto para web: **20k–50k tris**, texturas ≤ 2K, idealmente com **Draco/Meshopt**.

## Como ativar
1. Coloque o `.glb` nesta pasta.
2. Em `src/components/three/avatar-config.ts`, marque o avatar como `available: true`.
3. Recarregue `/poc-3d`. O placeholder some e o modelo real é carregado.

> Enquanto não houver `.glb` aqui, a POC mostra um **placeholder de palco 3D real** (objeto primitivo) + aviso para adicionar o arquivo. A UI **não** chama isso de "3D realista".

## Onde conseguir avatares
- **Ready Player Me** — gera avatar `.glb` por URL (grátis para começar). Ex.: `https://models.readyplayer.me/<id>.glb`.
- **Mixamo** (Adobe) — personagens + animações (exporta FBX → converta para glb).
- **MetaHuman (Unreal)** — alta qualidade (pipeline pesado, exportação para glTF é trabalhosa).
- **Blender** — modelar/retopologizar e exportar `.glb` (glTF 2.0).
- **Marketplaces** — Sketchfab, CGTrader, TurboSquid (confirme **licença comercial**).
