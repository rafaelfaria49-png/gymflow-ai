# GymFlow Training Taxonomy

## Objetivo e limite do incremento

O GOAL-18A cria vocabulário canônico, tipado e independente de UI para grupos musculares, padrões de movimento e equipamentos. O catálogo legado continua com os mesmos 126 exercícios e os mesmos campos raw; nenhum exercício foi reclassificado ou adicionado. Registry significa que um aparelho pode ser referenciado futuramente, não que já exista um exercício correspondente.

Ficam fora deste incremento: filtros visuais (GOAL-20), perfil de equipamentos da academia, substituição automática (GOAL-24) e curadoria exercício a exercício (GOAL-33A).

## Normalização

`normalizeTaxonomyText(value)` aplica, nesta ordem:

1. decomposição Unicode;
2. remoção de acentos e conversão para minúsculas;
3. remoção do símbolo de grau, preservando o número (`90°` → `90`);
4. conversão de hífen, barra, underscore e pontuação em separadores previsíveis;
5. colapso de espaços e `trim`.

Exemplos:

```text
Tríceps Pulley                    -> triceps pulley
Leg Press 90°                     -> leg press 90
Crucifixo Inclinado / Máquina     -> crucifixo inclinado maquina
```

A API `normalizeText` de `exerciseSearch.ts` foi preservada para não mudar a busca visual atual. As duas funções concordam para acentos, caixa e espaços usados hoje; a normalização nova amplia pontuação/grau para lookups canônicos. O GOAL-20 poderá adotar a função compartilhada quando integrar os novos filtros.

## Grupos musculares

IDs são estáveis, labels são PT-BR e `order` define apresentação futura.

| Categoria | IDs canônicos |
|---|---|
| Superior | `chest`, `back`, `shoulders`, `biceps`, `triceps`, `forearms`, `traps` |
| Inferior | `quadriceps`, `hamstrings`, `glutes`, `adductors`, `abductors`, `calves`, `legs_general` |
| Tronco | `core`, `lower_back` |
| Corpo inteiro | `full_body`, `functional` |
| Condicionamento/mobilidade | `cardio`, `mobility` |

`forearms`, `traps`, `adductors`, `abductors` e `lower_back` existem porque o catálogo/equipamentos futuros precisam distinguir essas regiões. Eles não foram atribuídos automaticamente a nenhum exercício.

### Compatibilidade legada

Os 12 grupos atuais resolvem. Dez mantêm o mesmo ID; as duas conversões explícitas são:

```text
legs -> legs_general
abs  -> core
```

`legs_general` continua deliberadamente genérico. Não significa quadríceps, posterior ou glúteos; somente o GOAL-33A fará essa curadoria.

## Padrões de movimento

Foram definidos 25 padrões, todos com label, descrição, categoria corporal e aliases:

- superior: `horizontal_push`, `vertical_push`, `horizontal_pull`, `vertical_pull`, `elbow_flexion`, `elbow_extension`, `shoulder_abduction`, `shoulder_flexion`, `shoulder_extension`;
- inferior: `squat`, `hip_hinge`, `knee_extension`, `knee_flexion`, `hip_extension`, `hip_abduction`, `hip_adduction`, `calf_raise`;
- tronco: `trunk_flexion`, `trunk_extension`, `trunk_rotation`, `anti_extension`, `anti_rotation`;
- outros: `locomotion`, `mobility`, `full_body_conditioning`.

Nenhum desses padrões foi aplicado aos 126 exercícios neste GOAL.

## Mecânica, lateralidade e posição

- `ExerciseMechanics`: `compound`, `isolation`, `cardio`, `mobility`, `functional`;
- `ExerciseLaterality`: `bilateral`, `unilateral`, `alternating`, `not_applicable`;
- `ExerciseBodyPosition`: `standing`, `seated`, `lying`, `prone`, `kneeling`, `supported`, `hanging`, `dynamic`.

Todos são opcionais em `Exercise` até a curadoria.

## Categorias de equipamento

As categorias canônicas são famílias operacionais:

`bodyweight`, `free_weight`, `cable`, `selectorized_machine`, `plate_loaded_machine`, `articulated_machine`, `cardio_machine`, `support`, `accessory`, `resistance_band`, `suspension`, `floor`, `other`.

Banco, rack, barra, halter e kettlebell foram modelados como equipamentos específicos, não categorias. Assim `flat_bench` pode ser `support`, enquanto `dumbbells` e `barbell` são `free_weight`; a hierarquia permanece pequena e utilizável.

## Registry

O registry contém **82 equipamentos canônicos** e **106 aliases**. Cada definição possui:

- `id`, label PT-BR, categoria;
- aliases e termos de busca;
- status `active`, `legacy` ou `planned`;
- carga `bodyweight`, `fixed`, `selectorized`, `plate_loaded`, `free_weight`, `resistance` ou `not_applicable`;
- metadados opcionais somente quando verificáveis, como compatibilidade com calculadora de anilhas ou suporte unilateral.

Os aparelhos reais informados pelo Founder estão representados, incluindo variações 45°/90° de leg press, hack sentado, pêndulo, front squat, flexoras, glúteo/elevação pélvica, supinos articulados por ângulo, crucifixo inclinado, pullover, remadas/puxadores articulados, Scott, tríceps e desenvolvimentos. Isso não adiciona exercícios ao catálogo.

## Aliases e resolução

Lookup canônico é exato após normalização; não há fuzzy matching. Busca pode ser parcial e exige todos os tokens.

```ts
findEquipmentByAlias('MÁQUINA GLÚTEO')?.id // glute_kickback_machine
findEquipmentByAlias('leg pre 90')         // undefined
searchEquipment('supino articulado')       // pode retornar variações relacionadas
```

Aliases iguais não usam “primeiro vence”. O validator falha quando um termo normalizado aponta para IDs diferentes.

## Mapa dos 72 valores legados

`LEGACY_EQUIPMENT_MAP` explicita cada string raw atual para um ou mais IDs. `resolveLegacyEquipment(raw)` sempre preserva `raw`, inclui o normalizado e retorna `exact`, `alias`, `legacy-map`, `generic` ou `unresolved`.

Resultado auditado:

| Métrica | Resultado |
|---|---:|
| Exercícios | 126 |
| Valores raw distintos | 72 |
| Valores resolvidos | 72 |
| `unresolved` | 0 |
| Colisões de alias | 0 |

Há uma equivalência de normalização aprovada e explícita: `Polia (Crossover)` e `Polia / Crossover` viram `polia crossover` e apontam para o mesmo `cable_crossover`.

### Casos genéricos/ambíguos

Dezessete valores resolvem sem ficarem silenciosamente pendentes, mas carregam warning e não são classificação final:

- ângulo/modelo ausente: `Aparelho Leg Press`, `Máquina de Panturrilha`, `Máquina de Supino`;
- banco não especificado: `Banco e Barra W`, `Banco, Barra e Estofamento`, `Barra e Banco`, `Haltere e Banco`, `Halteres e Banco`, `Halteres e Banco/Caixa`;
- alternativas embutidas no texto: `Barra Baixa / Smith`, `Barra ou Barra W`, `Haltere e Step/Anilha`, `Haltere ou Kettlebell`, `Halteres ou Kettlebells`, `Máquina Donkey / Anilha`, `Peso Corporal / Anilha`, `Peso Corporal / Caneleira`.

O GOAL-33A decidirá por exercício qual equipamento/variação realmente se aplica.

## Resolvers públicos

- `normalizeTaxonomyText`;
- `getMuscleGroupDefinition` e `resolveLegacyMuscleGroup`;
- `getMovementPatternDefinition` e `findMovementPatternByAlias`;
- `getEquipmentDefinition`, `findEquipmentByAlias` e `searchEquipment`;
- `resolveLegacyEquipment` e `auditLegacyEquipment`;
- `validateTrainingTaxonomy`, `validateEquipmentRegistry` e `validateLegacyEquipmentMap`.

Todos são puros, determinísticos, sem React, storage ou side effects.

## Compatibilidade com `Exercise`

Foram adicionados somente campos opcionais:

```ts
primaryMuscleGroupId?: MuscleGroupId
secondaryMuscleGroupIds?: MuscleGroupId[]
movementPatternIds?: MovementPatternId[]
equipmentIds?: EquipmentId[]
mechanics?: ExerciseMechanics
laterality?: ExerciseLaterality
bodyPosition?: ExerciseBodyPosition
```

`muscleGroup`, `secondaryMuscles`, `equipment`, `searchTerms`, `substitutions`, `type` e `level` permanecem. Objetos antigos continuam válidos e nenhum carregamento de programa/sessão mudou.

## Como adicionar equipamento corretamente

1. Escolher um ID técnico estável e adicioná-lo ao union `EquipmentId`.
2. Adicionar uma definição única ao `EQUIPMENT_REGISTRY`, com label PT-BR, categoria, aliases, termos, status e carga honestos.
3. Não reutilizar alias já pertencente a outro equipamento; termos ambíguos devem ganhar equipamento genérico explícito ou decisão documentada.
4. Se um novo valor raw entrar no catálogo, adicioná-lo ao mapa legado sem apagar o raw.
5. Incluir testes de lookup, busca e validação; executar a auditoria com `GYMFLOW_TAXONOMY_AUDIT=1`.

## Próximos GOALs e limitações

- GOAL-20: integrar busca/filtros às taxonomias, sem duplicar resolvers.
- GOAL-24: usar IDs estruturados na substituição, após o modelo de sessão necessário.
- GOAL-33A: classificar os 126 exercícios em lotes, resolver os 17 casos genéricos, revisar duplicidades semânticas e atribuir grupos/padrões/mecânica/equipamentos.

Este registry não é prescrição clínica, não conhece disponibilidade por academia e não cria substituição automática. Nenhuma UI, persistência, programa, treino ativo ou asset foi alterado no GOAL-18A.
