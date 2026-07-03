# Critérios de APROVAÇÃO (quando um avatar pode ser o vencedor)

Decisão em **2 eixos**, com **portões eliminatórios**. Codificado em `../tools/rubric.json` e aplicado por `../tools/analyze-glb.mjs`.

## Portões eliminatórios (reprovam, independentemente da média)
Um avatar **não entra no ranking** se qualquer um falhar:
- **Visual:** Mãos < 6 **ou** Rosto < 6.
- **Performance:** FPS mobile < 30 (quando medido).
- **Peso:** GLB > 8 MB.
- **Compatibilidade:** extensão **obrigatória** não suportada em R3F/Three.js; ou não carrega em `useGLTF`.
- **Rig:** sem rig / não conforma o skeleton único (quando o skeleton estiver congelado).
- **Licença:** incompatível com uso comercial + embed web (não migra ao produto — `BENCHMARK_LICENSES.md`).

## Nota final (entre os que passaram nos portões)
`final = 0.30·Visual + 0.20·Técnica + 0.20·Performance + 0.12·Compatibilidade + 0.08·Manutenção + 0.10·Comercial`
(pesos em `rubric.json → axisWeights`; ajustáveis). Enquanto faltar um eixo, a nota é **provisória** (renormaliza só os disponíveis) e o relatório diz o que falta.

## O teste humano que manda no eixo visual
> **APROVADO** só se: **"Eu pagaria por um app que usa esse personagem."**
> **REPROVADO** se parecer boneco / cartoon / videogame barato / IA mal acabada / estranho / mãos ruins / rosto artificial.

## Vencedor
- Maior **nota final** entre os aprovados nos portões.
- **Definitivo** só com: nota visual humana **+** FPS do harness **+** licença confirmada.
- Princípio: **o melhor avatar é o melhor equilíbrio** (realismo + performance + manutenção + escalabilidade), **não o mais bonito**.

## Decisão de produção (A/B/C)
- **A** — usar o avatar da IA como está (raro p/ herói).
- **B** — IA como base + artista finaliza (provável; ver `HIRING_001`).
- **C** — descartar IA p/ aquele papel.
Justificar com os números do analisador + horas humanas estimadas (Fase 7).

## Antes de migrar ao produto (fora do escopo deste lab)
Decisão formal + portões da Bíblia/E0 + licença confirmada + conformidade de skeleton. **Nada migra automaticamente**.
