# GOAL-14 - Technique Image Batch 001

## Escopo

Primeiro lote real de imagens de tecnica do `TechniqueSequencePlayer`: 10 exercicios, 5 JPGs por exercicio, 50 imagens no total.

## Exercicios cobertos

| Pedido | ID canonico no app | Status |
|---|---|---|
| supino_reto_barra | `chest_supino_reto` | pronto |
| supino_inclinado_halteres | `chest_supino_inclinado_haltere` | pronto |
| puxada_alta | `back_puxada_pulley` | pronto |
| remada_baixa | `back_remada_baixa` | pronto |
| rosca_direta | `biceps_rosca_direta` | pronto |
| triceps_corda | `triceps_polia_corda` | pronto |
| agachamento_livre | `legs_agachamento_barra` | pronto |
| leg_press_45 | `legs_legpress_45` | pronto |
| desenvolvimento_halteres | `shoulder_desenvolvimento_haltere` | pronto |
| elevacao_lateral | `shoulder_elevecao_lateral` | pronto |

## Padrao de arquivos

```text
public/assets/exercises/<exerciseId>/sequence/
  step-01.jpg
  step-02.jpg
  step-03.jpg
  step-04.jpg
  step-05.jpg
```

Cada imagem foi convertida para JPG 3:2 em 1200x800, otimizada para uso mobile.

## Observacoes de qualidade

- Imagens realistas geradas sem logos, watermark ou texto didatico embutido.
- Mesmo padrao visual geral: demonstrador atletico natural, roupa escura, academia limpa e luz suave.
- As maquinas podem exibir pequenos detalhes numericos proprios de equipamentos, mas sem marcas ou labels instrucionais.
- O lote foi integrado via `getTechniqueFrames()`, antes do fallback antigo de `images[]`.
- Os demais exercicios continuam usando o fallback atual.

## Candidatos ao lote 2

- `chest_crucifixo_haltere`
- `chest_crucifixo_polia`
- `back_remada_curvada`
- `back_serrote`
- `biceps_rosca_alternada`
- `biceps_rosca_martelo`
- `triceps_testa`
- `triceps_frances_haltere`
- `legs_cadeira_extensora`
- `glutes_elevacao_pelvica`
