# Benchmark 4 — Animações

Qualidade de movimento. O avatar base pode vir sem animação, mas a **viabilidade de animar** (rig limpo + retarget) é parte do eixo técnico. O analisador lê **nº de clipes e duração**; a qualidade do movimento é **revisão humana** contra critérios biomecânicos.

## O que o analisador entrega
- `animationCount` + por clipe: `name`, `channels`, `durationSec` (do `max` do acessor de input).
- Serve para: confirmar que clipes existem, medir duração, comparar peso (via clip budget).

## Critérios de qualidade (revisão humana)
| Critério | Bom | Reprovado |
|---|---|---|
| Naturalidade | peso/timing crível | robótico/flutuante |
| **Foot sliding** | pés travados no chão | pés deslizando |
| Loop | costura imperceptível | "pulo" no loop |
| Root motion | coerente (ou no lugar, se in-place) | deriva/escorrega |
| Deformação | juntas limpas (cotovelo/joelho) | colapso/candy-wrap |
| Interpenetração | sem clipping | mãos/coxas atravessam |

## Spec do squat V1 (do E0) — erros que **não podem aparecer**
- ❌ joelho em valgo (caindo para dentro)
- ❌ lombar arredondada
- ❌ calcanhar subindo
- ❌ pé deslizando
- ❌ subida tipo "good morning" (quadril sobe antes do tronco)
> Referência: `docs/GYMFLOW_MOTION_STUDIO_E0_ASSET_PRODUCTION_PLAN.md` §8 + validação de personal (CREF) §9.

## Fonte das animações (a decidir nos testes)
- **Geradas pela ferramenta** (poucas fazem bem) · **Mixamo/ActorCore** (retarget) · **Captura/autoria** no Blender · **MetaHuman/CC5** (compatível, com retarget). Avaliar custo de **retarget** vs **qualidade**.

## Tabela de animações — *aguardando clipes reais*
| Clipe | Origem | Duração | Foot sliding? | Loop ok? | Biomecânica ok? | Nota |
|---|---|:--:|:--:|:--:|:--:|:--:|
| — | — | — | — | — | — | — |
