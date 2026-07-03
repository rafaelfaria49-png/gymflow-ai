# Test Card — [NOME DA FERRAMENTA] — [DATA]

> Cartão de teste reproduzível. **Copiar este arquivo** para `experiments/<ferramenta>_<data>.md` e preencher ao executar um teste real.
> Objetivo: transformar "achei bonito" em **evidência comparável** entre ferramentas.

## 0. Setup
- **Ferramenta / versão:** …
- **Plano usado:** ☐ free ☐ pago (qual / custo) …
- **Conta criada?** ☐ sim ☐ não · **dados enviados ao serviço:** (prompt/imagem) …
- **Licença do output neste plano:** … (ex.: CC BY 4.0 público / Private / enterprise)

## 1. Tarefa-padrão (a MESMA para toda ferramenta = comparável)
Gerar **1 avatar masculino atlético natural**, corpo inteiro, roupa fitness, conforme Bíblia §3.
- **Prompt/imagem de entrada usada:** … (colar texto / referenciar imagem)
- **Configurações:** (qualidade, poly target, rig on/off, PBR) …

## 2. Resultados objetivos
| Métrica | Valor | Alvo (SPEC/E0) | Passa? |
|---|---|---|:---:|
| Formato exportado | … | GLB | ☐ |
| Triângulos | … | ≤40k ideal / ≤60k teto | ☐ |
| Bones (se rig) | … | ≤70 | ☐ |
| Peso GLB | … | ≤6MB ideal / ≤8MB teto | ☐ |
| Topologia | ☐ quads/edge-loops ☐ triangle soup | animation-ready | ☐ |
| UVs | ☐ limpos ☐ ruins ☐ ausentes | utilizáveis | ☐ |
| Carrega em R3F (`useGLTF`)? | ☐ sim ☐ não | sim | ☐ |
| Tempo de geração | … | — | — |
| Custo do teste | … | — | — |

## 2b. Viabilidade técnica / Integração GymFlow (Eixo 2 — nota 0–10)
| Métrica | Valor medido | Alvo (SPEC/E0) | Nota 0–10 |
|---|---|---|:--:|
| Peso do GLB | … | ≤6MB ideal / ≤8MB teto | |
| Tempo de carregamento (TTFR) | … | dentro do alvo SPIKE | |
| FPS desktop | … | ≥60 | |
| FPS mobile (device mediano) | … | ≥30 | |
| Facilidade de exportação | … | menos etapas = melhor | |
| Qualidade do rig | … | limpo, conforma skeleton único | |
| Qualidade das animações | … | natural, sem foot sliding | |
| Compat. React Three Fiber | ☐ ok ☐ ajustes ☐ não | `useGLTF`/`useAnimations` | |
| Compat. Three.js | ☐ ok ☐ ajustes ☐ não | GLTFLoader/AnimationMixer | |
| Facilidade de updates futuros | … | re-gerar/versão fácil? | |
> **Como medir FPS/carregamento:** carregar o GLB num **harness isolado do lab** (NÃO na POC) e medir TTFR + FPS (desktop e mobile/emulado). Esse harness é código que vive **dentro de `labs/`**, sem tocar o produto — construído **quando existir um GLB real e com autorização**.

## 3. Qualidade visual (Bíblia §12 — nota 0–10)
| Item | Nota | Obs |
|---|:--:|---|
| Realismo geral | | |
| Rosto (uncanny?) | | |
| **Mãos** (colapso/luva?) | | |
| Pele (plástica?) | | |
| Roupa (tecido real? identidade?) | | |
| Anatomia/proporção | | |
| Parece premium? | | |

## 4. Pós-produção necessária (estimativa honesta)
- [ ] Retopologia · [ ] Limpeza de UV · [ ] Re-rig (AccuRig) · [ ] Skin weights
- [ ] Conserto de mãos/rosto · [ ] Roupa de marca · [ ] Materiais PBR (Blender)
- [ ] Otimização (glTF-transform) · [ ] Animação biomecânica
**Horas humanas estimadas para chegar a "premium":** …

## 5. Veredito do teste
☐ Inútil p/ avatar herói · ☐ Útil como base (acelera, requer humano) · ☐ Surpreendente (revisar recomendação)
**Comentário:** …
**Print/anexo:** (caminho do screenshot/GLB salvo aqui em `experiments/`)
