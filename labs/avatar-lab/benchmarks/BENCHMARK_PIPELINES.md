# Benchmark 6 — Pipelines

Cada caminho "ferramenta → GLB pronto para web", com **atrito, tempo e onde o humano entra**. O melhor pipeline é o que entrega qualidade **com menos retrabalho e mais reprodutibilidade** (re-gerar/atualizar fácil — ver `BENCHMARK_RIGS.md` e a coluna manutenção do analisador).

## Rotas
### A) IA generativa pura (Meshy/Tripo/Hunyuan/Rodin)
```
prompt/imagem → malha IA (.glb)
   → [retopologia]            ← humano (triangle soup → topologia animável)
   → [conserto mãos/rosto]    ← humano (fraqueza persistente da IA)
   → [re-rig AccuRig]         ← semi-auto
   → Blender (PBR, limpeza)   ← humano
   → glTF-transform (Draco/Meshopt + KTX2)
   → GLB
```
- **Atrito:** alto. **Tempo:** depende do retopo. **Risco:** topologia/ mãos.
- **Bom para:** explorar estilo rápido, base inicial.

### B) Character Creator 5 + Headshot 3 + AccuRig (provável base oficial)
```
foto/texto → CC5 (Headshot 3) personagem rigado, topologia limpa
   → ajuste de roupa/material no CC5
   → export FBX → Blender (cc_blender_tools)
   → glTF-transform (Draco/Meshopt + KTX2)
   → GLB
```
- **Atrito:** médio (CC5 não exporta glTF → Blender obrigatório).
- **Ganho:** topologia + **rig limpo**; CC5 agora compartilha skeleton/padrões do **MetaHuman** (à prova de futuro).
- **Bom para:** o avatar **herói** oficial.

### C) MetaHuman 2.0 → web (benchmark de realismo)
```
MetaHuman Creator → UE5 → export (FBX/Python)
   → Blender (cabelo é o gargalo)
   → otimização pesada
   → GLB
```
- **Atrito:** alto (pipeline Unreal→web; cabelo problemático; malha pesada p/ runtime full-body).
- **Uso:** medir o **teto de realismo**, não necessariamente produzir o runtime.

### D) foto→avatar nativo GLB (MetaPerson/Avaturn)
```
foto → avatar rigado → GLB (nativo)
   → [refino opcional no Blender]
   → glTF-transform → GLB
```
- **Atrito:** baixo. **Realismo:** médio (mais "avatar" que "herói"). **Bom para:** velocidade, fallback.

### E) tudo-em-um (3D AI Studio)
```
prompt/foto → rigado → GLB (num lugar só)
   → glTF-transform → GLB
```
- **Atrito:** baixo (promete o caminho mais curto). **Testar** para ver se qualidade basta.

## Etapa comum e obrigatória: otimização
Independente da rota, antes do runtime: **glTF-transform** (ou similar) para Draco/Meshopt + **KTX2** nas texturas, mirando os orçamentos de `BENCHMARK_PERFORMANCE.md`. O analisador confirma se a compressão foi aplicada (`hasDraco/hasMeshopt/hasKTX2`).

## O que medir por pipeline (preencher ao testar)
| Rota | Tempo total (gen→GLB) | Horas humanas | Reprodutível? | Qualidade final | Nota |
|---|---|---|:--:|---|---|
| A IA pura | — | — | — | — | |
| B CC5 | — | — | — | — | |
| C MetaHuman | — | — | — | — | |
| D foto→avatar | — | — | — | — | |
| E tudo-em-um | — | — | — | — | |
