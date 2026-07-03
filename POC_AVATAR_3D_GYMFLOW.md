# POC — Pipeline 3D de Avatar (GymFlow AI)

> Substituição do canvas/skeleton 2D por um **motor 3D real** (Three.js + React Three Fiber)
> que carrega modelos `.glb/.gltf` com animação via `AnimationMixer`.
> Escopo **isolado**: nada do planejador, treinos, IA Coach, nutrição, comunidade ou
> monetização foi alterado. Build verde, dev server rodando.

---

## 1. TL;DR

- ✅ Pipeline 3D real implementado com **React Three Fiber v9 + drei v10 + three 0.184** (compatível com React 19 / Next 16).
- ✅ Carregamento de `.glb/.gltf` via `useGLTF`, animação via `useAnimations` (`AnimationMixer`), luzes, câmera, `OrbitControls`, contact shadows.
- ✅ Troca **masculino/feminino/neutro** por config; mapa **exercício → animação** por dados.
- ✅ **Fallback honesto**: sem asset, mostra um palco 3D real (objeto primitivo) + aviso “Adicione um arquivo `.glb` em `public/assets/avatars`”. **Não** chama de “3D realista” sem asset.
- ✅ `next build` passou (TypeScript + lint). Rota de POC: **`/poc-3d`**.
- ⚠️ Porta 3000 estava ocupada por **outro projeto seu** (`C:\Projetos\STUDIO MARKENTING IA\apps\web`). Para não derrubar esse app, a POC subiu em **http://localhost:3001/poc-3d**.

---

## 2. Auditoria dos componentes atuais (o que está sendo substituído)

| Componente | O que é hoje | Problema |
|---|---|---|
| `src/components/BiomechanicalVisualizer.tsx` (1.250 linhas) | Boneco-palito 2D desenhado em `<canvas>` 2D, com projeção pseudo-3D (rotação em Y), cápsulas e glows de músculo. `setPhase` por `requestAnimationFrame` → re-render React + redraw a cada frame. | Não é 3D; não parece humano. Rotulado como “Análise Biomecânica 3D”. Custo alto (1 instância por exercício no treino ativo). |
| `src/components/GlobalVideoPlayer.tsx` | “Player” que monta o `BiomechanicalVisualizer`, com buffering fake (500 ms), playback simulado por `setInterval`, “Modo Cinema” (= modal mais largo), velocidade e seek. | Vende canvas 2D como “Renderização Anatômica 3D Realista / ANIMAÇÃO 3D”. |
| Usos | (a) Aba **Vídeos** → `GlobalVideoPlayer`; (b) **“Ver técnica”** (Biblioteca) e **“Ver Biomecânica”** (Treino Ativo) → `openGlobalPlayer`; (c) **mini-loop** por exercício no Treino Ativo (`BiomechanicalVisualizer` 360×130). | Mesmo componente em 3 lugares → 3D real precisa de um substituto com a **mesma API** para troca futura. |

**A POC NÃO remove nem altera esses componentes** (escopo pedido). Ela entrega o substituto pronto, com API compatível, para o swap ser feito depois com segurança.

---

## 3. O que foi implementado

### Arquivos novos
```
src/components/three/
├── avatar-config.ts            # Config (avatares, animações, mapa exercício→animação, palco)
├── GymFlowAvatarViewer.tsx     # Cena R3F: <Canvas> WebGL, GLTF, AnimationMixer, luzes, câmera, controles, placeholder 3D + error boundary
└── GymFlowAvatarStage.tsx      # Orquestrador client: dynamic import (ssr:false), overlays, fallback honesto, API compatível

src/app/poc-3d/page.tsx         # Rota de demonstração (controles: gênero, exercício, play, velocidade, auto-girar)

public/assets/avatars/README.md      # Onde colocar male.glb / female.glb / neutral.glb
public/assets/animations/README.md   # Onde colocar os clipes (squat.glb, bench-press.glb, ...)
```

### Dependências adicionadas
```
three@^0.184.0
@react-three/fiber@^9.6.1
@react-three/drei@^10.7.7
@types/three@^0.184.1 (dev)
```

### Decisões técnicas (por que assim)
- **`ssr: false` só em Client Component** (regra do Next 16): a `Stage` é `'use client'` e faz `next/dynamic(() => import('./GymFlowAvatarViewer'), { ssr: false })`. Assim o WebGL nunca roda no servidor.
- **`Viewer` separado da `Stage`**: o `<Canvas>` e toda a árvore 3D ficam no `Viewer` (carregado só no cliente); a `Stage` cuida de layout, overlays e fallback (renderiza no SSR sem tocar em WebGL).
- **Honestidade de UI**: enquanto não há `.glb`, o chip diz “Palco 3D • Pré-visualização” (não “Avatar 3D”) e o banner instrui a adicionar o asset. O objeto central é um **halter 3D primitivo** (não humano, não skeleton/wireframe), só para provar luz/câmera/controles/loop.
- **Error boundary 3D**: se um `.glb` configurado como `available` falhar ao carregar (404), cai no placeholder e reporta status `error` (banner “arquivo .glb não encontrado”).
- **ESLint**: override restrito a `src/components/three/**` e `src/app/poc-3d/**` desativando `react/no-unknown-property` (R3F usa `args`, `position`, `intensity`, etc.). Não afeta o resto do app.

### API da `GymFlowAvatarStage` (compatível com o `BiomechanicalVisualizer`)
```tsx
<GymFlowAvatarStage
  exerciseId="legs_agachamento_barra"  // resolve a animação
  gender="male"                        // 'male' | 'female' | 'neutral'
  isPlaying={true}
  playbackSpeed={1}                    // 1 | 1.5 | 2 ...
  autoRotate={false}
  width={360} height={130}             // opcionais (paridade de API; layout é responsivo)
/>
```

---

## 4. Como funciona o pipeline (fluxo)

1. `Stage` resolve o avatar (`getAvatar(gender)`) e a animação (`resolveAnimationId(exerciseId)`).
2. `Stage` monta o `Viewer` (client-only).
3. `Viewer` cria o `<Canvas>` (sombras, dpr 1–2, câmera fov 35) e a cena: luz ambiente + key/fill direcionais + point light accent, chão que recebe sombra, `ContactShadows`, `OrbitControls`.
4. Se o avatar tem `available: true`:
   - `useGLTF(modelPath)` carrega o modelo.
   - Se a animação tem arquivo separado (`available + path`), `useGLTF(clipPath)` carrega o clipe; senão usa as animações embutidas no modelo.
   - `useAnimations(clips, group)` cria o `AnimationMixer`; o clipe é tocado em loop; `isPlaying`/`playbackSpeed` controlam `paused`/`timeScale`.
5. Se **não** há asset → placeholder 3D + banner honesto.

---

## 5. Quais arquivos precisamos comprar/criar

| Tipo | Formato | Para quê | Onde conseguir |
|---|---|---|---|
| **Avatar masculino** | `.glb` (skeleton humanoide) | Modelo 3D do boneco masculino | Ready Player Me (grátis p/ começar), Mixamo, Blender, Sketchfab/CGTrader (licença comercial) |
| **Avatar feminino** | `.glb` | Boneco feminino | idem |
| **Avatar neutro** (opcional) | `.glb` | Fallback unissex | idem |
| **Clipes de animação** | `.glb` com `AnimationClip` | squat, supino, terra, remada, pélvica, rosca, idle… | **Mixamo** (FBX → glb), captura própria, marketplaces |
| **(Alternativa pronta)** | pacote 3D licenciado | Biblioteca de exercícios animada + API | **MoveKit** (US$ ~99 a biblioteca, licença comercial + API) |

**Requisitos do modelo:** `.glb` binário, escala em metros (~1.7–1.8 m), T/A-pose virado para +Z, skeleton **humanoide padrão (Mixamo/RPM/VRM)** para reaproveitar animações, 20k–50k tris, texturas ≤ 2K, idealmente Draco/Meshopt.

---

## 6. Como importar avatares e animações

### Avatar masculino (`.glb`)
1. Copie o arquivo para `public/assets/avatars/male.glb`.
2. Em `src/components/three/avatar-config.ts`:
   ```ts
   male: { id:'male', label:'Masculino', modelPath:'/assets/avatars/male.glb', available: true, scale: 1, yOffset: 0 },
   ```
3. Recarregue `/poc-3d`.

### Avatar feminino (`.glb`)
1. `public/assets/avatars/female.glb`.
2. `female: { ..., available: true }`.

> Ajuste `scale`/`yOffset` se o modelo não estiver em metros ou “flutuar”.

### Animações (`.glb`)
1. Baixe a animação (ex.: Mixamo “Barbell Squat”) e **converta FBX → glb** (Blender ou `FBX2glTF`).
2. `public/assets/animations/squat.glb`.
3. Em `ANIMATIONS`:
   ```ts
   squat: { id:'squat', label:'Agachamento', path:'/assets/animations/squat.glb', loop:true, available: true, clipName:'mixamo.com' /* opcional */ },
   ```
4. Animações **embutidas no avatar** também funcionam (o viewer lê `model.animations`); arquivos separados são melhores para reuso entre M/F.

### Mapa exercício → animação
Já é **dirigido por dados** em `ANIMATION_MAP_RULES` (`avatar-config.ts`). Ex.:
```ts
{ match: ['agachamento','squat','leg_press','legpress','hack'], animationId: 'squat' },
{ match: ['supino','bench','press','crucifixo','peck'],        animationId: 'bench_press' },
```
`resolveAnimationId('legs_agachamento_barra')` → `'squat'`. Para mapear 1:1 por ID, basta adicionar regras específicas no topo da lista.

---

## 7. Evolução (Blender / Mixamo / Ready Player Me / MetaHuman)

- **Ready Player Me (mais rápido):** gere avatares `.glb` por URL/SDK. Padrão half/full-body com skeleton compatível com Mixamo → animações “encaixam”. Ótimo para MVP.
- **Mixamo (animações):** catálogo gigante de movimentos rigados. Fluxo: baixar FBX → converter para `.glb` (`gltf-transform`/Blender) → registrar em `ANIMATIONS`. Padronize **um único skeleton** entre avatar e clipes para o retarget funcionar sem reescrever bones.
- **Blender (controle total):** modelar/retopologizar, fazer rig (Rigify), criar/limpar animações e exportar **glTF 2.0 (.glb)**. Use para padronizar nomes de bones e otimizar (Draco/Meshopt).
- **MetaHuman / Unreal (qualidade máxima):** humanos foto-realistas. Custo: pipeline pesado e exportar para glTF/web é trabalhoso (normalmente vira **vídeo renderizado**, não tempo-real no browser). Recomendado só na fase comercial premium.
- **Multi-instância (treino ativo):** ao renderizar vários avatares simultâneos, clone com `SkeletonUtils.clone(scene)` (`three/examples/jsm/utils/SkeletonUtils`) — `clone()` simples quebra o skinning. Já anotado no código.
- **Performance:** Draco/Meshopt nos `.glb`, `useGLTF.preload`, limitar nº de canvases simultâneos (ou um único canvas compartilhado), `frameloop="demand"` quando pausado.

---

## 8. Como rodar / ver

```bash
npm run dev
# Porta 3000 ocupada pelo projeto "STUDIO MARKENTING IA" → Next subiu em 3001
```
Abra: **http://localhost:3001/poc-3d**

> Para usar exatamente a 3000: pare o dev server do outro projeto (PID que ocupa a 3000) e rode `npm run dev` novamente. **Não** derrubei aquele processo porque pertence a outro app seu.

Build de produção:
```bash
npm run build   # ✓ compila, TypeScript + lint OK, rota /poc-3d estática
```

---

## 9. Próximos passos

1. **Adquirir assets**: 2 avatares (M/F) via Ready Player Me + clipes Mixamo dos ~7 movimentos-base **ou** o pacote MoveKit (US$ ~99, comercial).
2. **Ativar** `available: true` nos itens correspondentes do `avatar-config.ts`.
3. **Padronizar skeleton** (Mixamo) entre avatar e animações para o retarget.
4. **Swap controlado**: criar um adaptador que troque `BiomechanicalVisualizer` por `GymFlowAvatarStage` atrás de uma flag, validando os 3 pontos de uso (Vídeos, “Ver técnica”, mini-loop do treino).
5. **Otimizar**: Draco/Meshopt, `frameloop="demand"`, canvas único na lista do treino ativo.
6. **Higiene de copy** (independente da POC): remover “3D realista” do `GlobalVideoPlayer`/`BiomechanicalVisualizer` enquanto não houver avatar real lá.

---

## 10. Garantias de escopo

- Não alterei `BiomechanicalVisualizer.tsx`, `GlobalVideoPlayer.tsx`, planejador, treinos, IA Coach, nutrição, comunidade ou monetização.
- Mudanças fora de `src/components/three/` e `src/app/poc-3d/`: apenas (a) `package.json` (deps 3D) e (b) um override **escopado** em `eslint.config.mjs` para o pipeline 3D.
- Nenhum humano desenhado em canvas; nenhum skeleton/wireframe. O placeholder é um objeto 3D primitivo, claramente rotulado como pré-visualização.
