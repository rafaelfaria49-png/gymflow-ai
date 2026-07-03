# Benchmark 1 — Ferramentas

Matriz de capacidade das ferramentas de IA 3D / criação de personagem (jun/2026). **Fontes e detalhamento:** [`../GYMFLOW_AVATAR_LAB_001.md`](../GYMFLOW_AVATAR_LAB_001.md) e [`../results/EXECUTION_AND_ALTERNATIVES.md`](../results/EXECUTION_AND_ALTERNATIVES.md). Claims voláteis (licença/recurso) → **confirmar antes de incorporar** (ver `BENCHMARK_LICENSES.md`).

> Esta tabela é o **mapa para priorizar testes**. A coluna "Veredito p/ teste" é hipótese da pesquisa; as colunas duras só viram nota quando o GLB passa pelo analisador.

| Ferramenta | Modalidade | Rig nativo? | GLB nativo? | Realismo (teto) | Custo p/ 1º teste | Veredito p/ teste |
|---|---|:--:|:--:|---|---|---|
| **Meshy 6** | texto/imagem→3D | parcial | ✅ | médio-alto | free (CC BY 4.0 público) | **Começar aqui** (sem imagem) |
| **Tripo** | texto/imagem→3D | parcial | ✅ | médio-alto | free (sem uso comercial) | Comparar com Meshy |
| **Hunyuan 3D 2.5** | imagem→3D | ❌ | ✅ | alto (geo) | demo | Forte em geometria |
| **Rodin / Hyper3D** | texto/imagem→3D | A/T-pose | ✅ | alto | tiers | Base + face |
| **ChatAvatar (Deemos)** | texto/imagem→face | cabeça | varia | **★★★★★ face** | tiers | Benchmark de rosto |
| **MetaPerson (Avatar SDK)** | foto→avatar | ✅ | ✅ (nativo) | médio | free limitado | Rápido; mais "avatar" |
| **Avaturn** | foto→avatar | ✅ | ✅ | médio | free limitado | Rápido; estilizado |
| **CC5 + Headshot 3 + AccuRig** | imagem/texto→rigado | ✅ **limpo** | ❌ (via Blender) | alto | trial desktop | **Provável base oficial** |
| **MetaHuman 2.0** | criador→rigado | ✅ excelente | ❌ (UE→Blender) | **máximo** | grátis (termos) | **Benchmark de realismo** (peso web) |
| **3D AI Studio** | prompt/foto→rigado→GLB | ✅ auto | ✅ | médio-alto | pago=comercial | Pipeline mais curto — testar |
| **Stable Fast 3D** | imagem→3D | ❌ | ✅ | médio | free (<US$1M receita) | Base rápida |
| **TRELLIS.2 (MIT)** | imagem/texto→3D | ❌ | ✅ | médio (objetos) | **MIT (melhor licença)** | **Cenário/equipamento**, não herói |
| **Sloyd** | paramétrico | pré-rig | ✅ | médio-baixo | comercial | Plano B rápido |
| **Daz Studio** | montagem | ✅ | via Blender | alto | Interactive License/asset | Atrito de licença runtime |

## Campos que o analisador preenche automaticamente por ferramenta
Ao analisar um GLB, o campo **`generator`** (do `asset.generator`) costuma revelar a ferramenta/exportador real — útil para auditar a procedência de cada teste. As demais colunas duras (tris, bones, peso, extensões) saem direto dos bytes.

## Ordem de teste recomendada
**Lote A (texto, sem imagem):** Meshy → Tripo → Rodin.
**Lote B (precisa de 1 imagem de referência):** Hunyuan → Avaturn → MetaPerson → CC5/Headshot 3.
**Lote C (desktop):** CC5 + Headshot 3 + AccuRig.
**Benchmark de teto:** MetaHuman 2.0 (só para saber o máximo de realismo possível).

Cada teste → capturas em `results/<ferramenta>/` + Test Card preenchido + GLB em `drop/` para o analisador.
