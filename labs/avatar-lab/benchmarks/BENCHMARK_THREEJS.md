# Benchmark 10 — Integração Three.js

Um GLB **carrega** no Three.js via `GLTFLoader` — a pergunta real é **o que precisa junto** (decoders) e **se o conteúdo do arquivo** (extensões, rig, materiais) roda sem dor. Versão do projeto: **three `0.184.0`**.

## Loaders e o que cada extensão exige
| Conteúdo do GLB | Loader/decoder necessário | O analisador detecta? |
|---|---|:--:|
| Geometria/cena base | `GLTFLoader` | ✅ (estrutura) |
| `KHR_draco_mesh_compression` | `DRACOLoader` + wasm | ✅ `hasDraco` |
| `EXT_meshopt_compression` | `MeshoptDecoder` | ✅ `hasMeshopt` |
| `KHR_texture_basisu` (KTX2) | `KTX2Loader` + transcoder | ✅ `hasKTX2` |
| `KHR_materials_*` (clearcoat/sheen/…) | nativo no `GLTFLoader` | ✅ `advMaterialExt` |
| Skin/rig | `SkinnedMesh` (automático) | ✅ `boneCount/jointNames` |
| Animações | `AnimationMixer` + `AnimationClip` | ✅ `animations[]` |
| Extensão fora da lista suportada | **risco** (pode não renderizar) | ✅ `unsupportedExtensionsUsed` |

> Se uma extensão **não suportada** estiver em `extensionsRequired`, é **portão eliminatório** (não carrega). O analisador já reprova nesse caso.

## Checklist de carga Three.js (preencher no teste de carga)
- [ ] `GLTFLoader.parse/load` sem erro
- [ ] Decoders necessários configurados (Draco/Meshopt/KTX2) conforme o `extensionsUsed`
- [ ] `scene` tem `SkinnedMesh` com `skeleton` válido (se rig)
- [ ] `AnimationMixer` roda o(s) clipe(s) sem warning
- [ ] Materiais aparecem com PBR correto (sem texturas faltando)
- [ ] Sem warnings de "unknown extension" no console

## Armadilhas comuns
- **Decoder ausente:** GLB com Draco/KTX2 sem o decoder configurado → erro silencioso ou geometria/textura faltando.
- **Escala/eixo:** algumas ferramentas exportam em cm ou Y-up≠ esperado → normalizar no Blender.
- **Múltiplos materiais/draw calls:** muitos materiais = mais draw calls (ver performance).
- **Inverse bind matrices ausentes:** rig quebra a deformação.

## Resultado por avatar — *aguardando teste de carga*
| Avatar | Carrega? | Decoders | Rig ok? | Anim ok? | Warnings | Nota Three.js |
|---|:--:|---|:--:|:--:|---|:--:|
| — | — | — | — | — | — | — |

> O **teste de carga** roda no harness isolado do lab (ver `BENCHMARK_PERFORMANCE.md`), **nunca** na POC/produto.
