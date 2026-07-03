# Benchmark 3 — Rigs

Um rig "bonito" não basta: ele precisa **conformar ao skeleton único** do GymFlow, senão cada avatar precisa de animações próprias (mata a escalabilidade). O analisador extrai **contagem e nomes das bones** de cada GLB para essa conferência.

> ⚠️ O **skeleton oficial ainda NÃO está congelado** (decisão do E0/Bíblia). Esta dimensão prepara a conferência; a referência definitiva entra quando o skeleton for congelado.

## O que o analisador entrega
- `boneCount` (nº de joints do skin).
- `jointNames` (lista completa, no `<details>` do relatório) → permite **diff** contra um skeleton de referência.
- Portão: **sem rig = reprovado** (avatar não animável sem re-rig).

## Critérios de um bom rig (para nota humana/inspeção)
| Critério | Bom | Ruim |
|---|---|---|
| Contagem de bones | ≤70, coerente | explosão de bones (>100) |
| Nomenclatura | padrão consistente (Mixamo/CC/MetaHuman) | nomes aleatórios/numéricos |
| Hierarquia | Hips→Spine→…→Head + membros simétricos | quebrada/assimétrica |
| Skin weights | suaves, sem candy-wrap | espetos/colapsos nas juntas |
| Dedos | riggados (se interação de mão) | dedos fundidos/sem bones |
| Twist bones | presentes em antebraço/coxa (deformação) | ausentes → cotovelo/joelho feio |
| Pose de bind | T-pose/A-pose limpa | pose torta |

## Convenções de nomenclatura comuns (para o diff futuro)
- **Mixamo:** `mixamorig:Hips`, `...Spine`, `...LeftArm`…
- **CC/Reallusion:** `CC_Base_Hip`, `CC_Base_Spine01`…
- **MetaHuman:** `pelvis`, `spine_01`…, `clavicle_l`… (CC5 agora compartilha esse padrão)
- **Rigify (Blender):** `spine`, `upper_arm.L`…

## Plano de conferência de conformidade (quando o skeleton for congelado)
1. Definir `skeleton-ref.json` (lista de bones canônicas) — vive em `tools/` quando existir.
2. Estender o analisador para **diferenciar** `jointNames` × referência (faltando / sobrando / renomeado).
3. Portão `rig_must_conform_single_skeleton` passa a checar o diff, não só "tem rig".

## Tabela de rigs — *aguardando GLBs reais*
| Avatar | Bones | Nomenclatura | Conforma ref? | Twist bones | Dedos | Nota rig |
|---|:--:|---|:--:|:--:|:--:|:--:|
| — | — | — | — | — | — | — |
