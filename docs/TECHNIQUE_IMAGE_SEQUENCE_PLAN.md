# GOAL-13 - Plano de Sequencia de Imagens Tecnicas

## Objetivo

Criar sequencias de 4 a 5 imagens por exercicio para simular a execucao em camera lenta dentro do app. Nesta sprint o app usa as imagens locais atuais como fallback; as imagens reais por etapa entram depois, sem depender de video, avatar 3D ou API externa.

## Estrutura recomendada

```text
public/assets/exercises/<exerciseId>/sequence/
  step-01.jpg
  step-02.jpg
  step-03.jpg
  step-04.jpg
  step-05.jpg
```

Quando a pasta existir, os dados podem preencher `techniqueFrames` com os mesmos caminhos. Enquanto isso, `images[]` continua funcionando e o app gera frames automaticamente.

## Padrao de etapas

1. `step-01.jpg` - posicao inicial
2. `step-02.jpg` - inicio do movimento
3. `step-03.jpg` - meio da execucao
4. `step-04.jpg` - contracao / posicao final
5. `step-05.jpg` - retorno controlado ou detalhe tecnico

## 25 exercicios prioritarios

| # | Exercicio | exerciseId |
|---|---|---|
| 1 | Supino Reto com Barra | `chest_supino_reto` |
| 2 | Supino Inclinado com Halteres | `chest_supino_inclinado_haltere` |
| 3 | Crucifixo | `chest_crucifixo_haltere` |
| 4 | Crossover | `chest_crossover_polia` |
| 5 | Puxada Alta | `back_puxada_pulley` |
| 6 | Remada Baixa | `back_remada_baixa` |
| 7 | Remada Curvada | `back_remada_curvada` |
| 8 | Remada Serrote | `back_serrote` |
| 9 | Rosca Direta | `biceps_rosca_direta` |
| 10 | Rosca Alternada | `biceps_rosca_alternada` |
| 11 | Rosca Martelo | `biceps_rosca_martelo` |
| 12 | Triceps Testa | `triceps_testa` |
| 13 | Triceps Corda | `triceps_polia_corda` |
| 14 | Triceps Frances | `triceps_frances_haltere` |
| 15 | Agachamento Livre | `legs_agachamento_barra` |
| 16 | Leg Press 45 | `legs_legpress_45` |
| 17 | Cadeira Extensora | `legs_cadeira_extensora` |
| 18 | Mesa Flexora | `legs_mesa_flexora` |
| 19 | Stiff | `legs_stiff` |
| 20 | Elevacao Pelvica | `glutes_elevacao_pelvica` |
| 21 | Desenvolvimento com Halteres | `shoulder_desenvolvimento_haltere` |
| 22 | Elevacao Lateral | `shoulder_elevecao_lateral` |
| 23 | Prancha Abdominal | `abs_prancha_abdominal` |
| 24 | Abdominal Supra | `abs_abdominal_supra` |
| 25 | Corrida na Esteira | `cardio_corrida_esteira` |

## Checklist de producao futura

- Manter mesmo atleta, camera, lente, iluminacao e ambiente entre as 5 etapas.
- Validar anatomia, postura e equipamento antes de importar.
- Nunca usar logos, marcas registradas ou nomes de celebridades.
- Comprimir imagens para web/mobile antes de adicionar ao repo.
- Atualizar `techniqueFrames` somente depois que os arquivos reais estiverem revisados.
