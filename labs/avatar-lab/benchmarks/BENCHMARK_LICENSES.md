# Benchmark 7 — Licenças

A licença decide se um asset **pode virar produto**. Free tiers servem para **teste**, raramente para o **asset final de marca**. Esta dimensão alimenta o **eixo comercial** do analisador e pode **reprovar** um asset lindo por incompatibilidade.

> ⚠️ **Volátil:** termos mudam. Fontes em [`../GYMFLOW_AVATAR_LAB_001.md`](../GYMFLOW_AVATAR_LAB_001.md) e [`../results/EXECUTION_AND_ALTERNATIVES.md`](../results/EXECUTION_AND_ALTERNATIVES.md) (jun/2026). **Sempre reconfirmar no site da ferramenta antes de incorporar** — alinhado a `docs/GYMFLOW_MOTION_STUDIO_HIRING_001.md` §7 (cessão + disclosure de terceiros).

## Matriz (jun/2026 — reconfirmar)
| Ferramenta | Free tier | Plano pago | Serve p/ asset final? |
|---|---|---|:--:|
| Meshy | CC BY 4.0 **público** | Private (pago) | Só pago |
| Tripo | **sem uso comercial** | Pro = comercial | Só pago |
| Hunyuan 3D | demo/uso restrito | comercial c/ aprovação Tencent | Confirmar |
| Rodin/Hyper3D | tiers | comercial | Plano pago |
| ChatAvatar | tiers | comercial | Plano pago |
| MetaPerson/Avatar SDK | limitado | planos comerciais | Plano pago |
| Avaturn | limitado | comercial | Plano pago |
| CC5 + Headshot 3 | trial | **royalty-free** (confirmar embed web) | ✅ provável |
| MetaHuman 2.0 | grátis | termos Epic (uso fora do Unreal: rever) | Rever termos |
| 3D AI Studio | — | pago = comercial | Plano pago |
| Stable Fast 3D | free <US$1M receita | — | Depende da receita |
| TRELLIS.2 | **MIT** | — | ✅ **melhor licença** |
| Daz | — | Interactive License **por asset** | Atrito runtime |

## Como o analisador pontua (eixo comercial)
Lê `licenca` do `<nome>.meta.json` e mapeia:
- `Private / owned / cessão / royalty-free` → **10**
- `commercial / pro / pago` → **8**
- `CC BY / attribution` → **4** (atribuição obrigatória; ruim p/ marca premium)
- `non-commercial / research / sem uso comercial` → **1**
- vazio → **pendente** (não inventa)

## Checklist de licença antes de incorporar (portão de produto)
- [ ] A licença permite **uso comercial** no app?
- [ ] Permite **embed em runtime web** (cliente baixa o GLB)?
- [ ] Dispensa **atribuição** pública (ou aceitamos atribuir)?
- [ ] Cobre **ativos de terceiros** embutidos (texturas/HDRI/roupa)? (disclosure — HIRING_001 §7)
- [ ] Há **cessão dos direitos necessários** ao GymFlow AI?
- [ ] Termo guardado/print no `meta.json`/`results/`?

> Um asset que falhe aqui **não migra** ao produto, por melhor que seja visualmente.
