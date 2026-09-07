# Registro de Decisões Canônicas — Nutrição GymFlow AI
**Documento:** `GYMFLOW_NUTRITION_DECISIONS_001`
**Referência:** `GYMFLOW_NUTRITION_MASTERPLAN_001`
**Status:** Aprovado / Canônico
**Data:** Setembro de 2026

Este documento registra as decisões arquiteturais, científicas, éticas e de governança para o domínio de Nutrição e Hidratação do GymFlow AI. Cada decisão é mandatória e vinculante para todos os GOALs de implementação subsequentes.

---

## Índice de Decisões Canônicas

* [D-NUT-01: IA não calcula targets](#d-nut-01-ia-não-calcula-targets)
* [D-NUT-02: Nenhum default masculino para gender neutral](#d-nut-02-nenhum-default-masculino-para-gender-neutral)
* [D-NUT-03: Parâmetros metabólicos permanecem versionados](#d-nut-03-parâmetros-metabólicos-permanecem-versionados)
* [D-NUT-04: Ingestão de proteína superior a 2.2 g/kg não é automatizada no V1](#d-nut-04-ingestão-de-proteína-superior-a-22-gkg-não-é-automatizada-no-v1)
* [D-NUT-05: Open Food Facts e leitor de código de barras adiados para V1.5](#d-nut-05-open-food-facts-e-leitor-de-código-de-barras-adiados-para-v15)
* [D-NUT-06: Bottom navigation global permanece inalterada nesta trilha](#d-nut-06-bottom-navigation-global-permanece-inalterada-nesta-trilha)
* [D-NUT-07: Concessão de XP por registros nutricionais requer idempotência e teto diário](#d-nut-07-concessão-de-xp-por-registros-nutricionais-requer-idempotência-e-teto-diário)
* [D-NUT-08: Revisão profissional por nutricionista é gate obrigatório antes do beta público](#d-nut-08-revisão-profissional-por-nutricionista-é-gate-obrigatório-antes-do-beta-público)
* [D-NUT-09: Revisão jurídica de posicionamento e responsabilidade civil é gate antes da comercialização](#d-nut-09-revisão-jurídica-de-posicionamento-e-responsabilidade-civil-é-gate-antes-da-comercialização)
* [D-NUT-10: Dados nutricionais sem procedência verificada não entram no catálogo canônico](#d-nut-10-dados-nutricionais-sem-procedência-verificada-não-entram-no-catálogo-canônico)

---

### D-NUT-01: IA não calcula targets

* **Status:** Aprovada
* **Contexto:** Modelos de linguagem (LLMs) são probabilísticos e suscetíveis a alucinações matemáticas ou desvios fisiológicos. Confiabilidade energética e de macronutrientes exige determinismo estrito, repetibilidade e conformidade científica auditável.
* **Decisão:** A IA generativa nunca calcula, ajusta ou grava diretamente metas calóricas (`DailyTargets`) ou limites de macronutrientes. A autoridade exclusiva para a geração de metas pertence ao `NutritionEngine`, um motor em TypeScript puro e versionado. A IA atua exclusivamente como assistente consultivo e propositivo em modo estritamente *read-only* em relação aos dados do livro contábil (`NutritionLedger`).
* **Consequências:** Nenhuma rota ou método da IA terá acesso de escrita aos alvos ou registros do usuário sem o comando explícito e manual de confirmação do usuário na interface.

---

### D-NUT-02: Nenhum default masculino para gender neutral

* **Status:** Aprovada
* **Contexto:** Em fórmulas metabólicas (como Mifflin-St Jeor ou Harris-Benedict), as equações diferenciam constantes baseadas em sexo biológico devido à composição média de massa livre de gordura. O campo social `user.gender` não deve ser assumido como variável biológica de cálculo, e nenhuma suposição masculina padrão (`male`) pode ser aplicada a usuários neutros, não binários ou com campo não preenchido.
* **Decisão:** Cria-se o campo explícito e explicado `biologicalSexForCalcs: 'female' | 'male' | 'unspecified'`. É expressamente proibido adotar a fórmula masculina como *fallback* para registros `unspecified`.
* **Consequências:** Na ausência de declaração expressa do sexo para fins de cálculo metabólico, o sistema aciona o gate `LIMITED_ESTIMATE`, que gera faixas estimadas ampliadas acompanhadas de aviso transparente ao usuário, solicitando calibração manual ou orientação profissional.

---

### D-NUT-03: Parâmetros metabólicos permanecem versionados

* **Status:** Aprovada
* **Contexto:** Constantes fisiológicas como pisos calóricos de segurança, percentuais de déficit, fatores de atividade (PAL) e fórmulas de taxa metabólica basal não devem existir como valores mágicos espalhados em componentes React ou funções isoladas.
* **Decisão:** Todas as fórmulas e parâmetros metabólicos residirão centralizados no `NutritionEngine`, associados a metadados formais de versão (`engineVersion`, `formulaVersion`, `inputSnapshotHash`). Todos os parâmetros que não constituem consenso biológico universal são explicitamente marcados no código com o comentário de auditoria `PROFESSIONAL_REVIEW_REQUIRED`.
* **Consequências:** O histórico de metas do usuário retém a versão exata do algoritmo que gerou cada cálculo, viabilizando rastreabilidade total em auditorias futuras ou migrações.

---

### D-NUT-04: Ingestão de proteína superior a 2.2 g/kg não é automatizada no V1

* **Status:** Aprovada
* **Contexto:** A literatura científica de hipertrofia e treinamento resistido em adultos saudáveis aponta a faixa de $1.6\text{ a }2.2\text{ g/kg/dia}$ como plenamente suficiente para otimização da síntese proteica miofibrilar. Consumos acima de $2.2\text{ g/kg}$ exigem monitoramento renal individual e contexto clínico específico.
* **Decisão:** O `NutritionEngine` V1 limita sua partição automática de proteína à faixa conservadora máxima de $2.2\text{ g/kg/dia}$. Metas superiores a este valor só poderão ser definidas via ajuste manual direto do usuário ou sob supervisão profissional.
* **Consequências:** Mitigação de riscos de sobrecarga metabólica em usuários com disfunções renais subclínicas não diagnosticadas.

---

### D-NUT-05: Open Food Facts e leitor de código de barras adiados para V1.5

* **Status:** Aprovada
* **Contexto:** A base global colaborativa do Open Food Facts opera sob a licença de banco de dados aberto **ODbL (Open Database License)**, cuja cláusula de compartilhamento pela mesma licença (*share-alike*) impõe riscos jurídicos de contaminação ao modelo de dados do GymFlow se integrada sem isolamento rigoroso. Adicionalmente, o scanner de código de barras no V1 adicionaria dependências nativas e complexidade desnecessária antes da validação do core.
* **Decisão:** A integração do Open Food Facts e o leitor de código de barras ficam formalmente postergados para o ciclo V1.5. A V1 utilizará o catálogo nativo curado `CANONICAL_BR` somado ao `USDA FoodData Central` e ao cadastro manual assistido (`USER_CONFIRMED`).
* **Consequências:** Foco imediato na integridade do núcleo nutricional, velocidade de inicialização do app e segurança jurídica de propriedade intelectual.

---

### D-NUT-06: Bottom navigation global permanece inalterada nesta trilha

* **Status:** Aprovada
* **Contexto:** A barra de navegação inferior (*bottom navigation bar*) do GymFlow AI atende a uma hierarquia global de módulos (Treino, Comunidade, Perfil, etc.). Modificá-la isoladamente para acomodar Nutrição causaria fragmentação de design e conflito com worktrees em andamento.
* **Decisão:** O módulo de Nutrição continuará sendo acessado pela rota existente na aplicação durante a implementação do Masterplan V1. A decisão de promover a Nutrição para a barra inferior fixa é remetida à futura auditoria global de navegação e ergonomia mobile do ecossistema.
* **Consequências:** Zero conflito de merge na barra de navegação global com outros PRs e branches paralelas.

---

### D-NUT-07: Concessão de XP por registros nutricionais requer idempotência e teto diário

* **Status:** Aprovada
* **Contexto:** A implementação legada concede `+20 XP` a cada invocação de `logMacros`, permitindo que um usuário manipule formulários para acumular milhares de pontos de experiência sem correspondência comportamental real.
* **Decisão:** A gamificação do módulo nutricional é reestruturada em torno de comportamentos saudáveis consistentes (primeiro registro do dia, meta de água batida, consistência semanal). Toda atribuição de XP deve ser idempotente por data civil e governada por um teto máximo de **$60\text{ XP/dia}$** para o domínio de nutrição.
* **Consequências:** Fim do incentivo a registros falsos ou repetitivos e proteção da integridade do sistema de ranqueamento e conquistas do aplicativo.

---

### D-NUT-08: Revisão profissional por nutricionista é gate obrigatório antes do beta público

* **Status:** Aprovada
* **Contexto:** Embora o GymFlow AI não seja um software de prescrição clínica, a responsabilidade técnica pelas equações de gastos, faixas de segurança de déficit e proporção de nutrientes exige chancela de autoridade habilitada.
* **Decisão:** A abertura do aplicativo para beta público comercial ou ampla distribuição em lojas (App Store e Google Play) fica condicionada à revisão e homologação formal dos parâmetros do `NutritionEngine` por nutricionista devidamente registrado no Conselho Regional de Nutricionistas (CRN).
* **Consequências:** Garantia de conformidade com os preceitos éticos e regulatórios do Conselho Federal de Nutricionistas (CFN) no Brasil e entidades análogas internacionais.

---

### D-NUT-09: Revisão jurídica de posicionamento e responsabilidade civil é gate antes da comercialização

* **Status:** Aprovada
* **Contexto:** A linha divisória entre ferramenta digital de suporte ao estilo de vida e exercício ilegal da profissão de nutricionista (Lei Federal nº 8.234/1991 no Brasil) requer clareza inequívoca nos Termos de Serviço, Políticas de Privacidade e interfaces de usuário.
* **Decisão:** É obrigatória a validação jurídica dos termos de uso, declarações de responsabilidade (*disclaimers*) e limites do aplicativo antes da ativação de qualquer cobrança comercial ou campanha publicitária voltada à nutrição. O aplicativo deve ser explicitamente posicionado como "Ferramenta de autogestão e monitoramento de hábitos de treino e estilo de vida saudável, não constituindo prescrição dietética individualizada".
* **Consequências:** Blindagem jurídica contra processos por exercício irregular da profissão ou alegações de indução a déficits calóricos lesivos.

---

### D-NUT-10: Dados nutricionais sem procedência verificada não entram no catálogo canônico

* **Status:** Aprovada
* **Contexto:** Alimentos com densidades calóricas distorcidas destroem a eficácia de qualquer plano de treinamento, gerando frustração no praticante e perda de credibilidade do GymFlow AI.
* **Decisão:** Nenhum alimento fará parte do catálogo oficial `CANONICAL_BR` sem que possua identificação primária de fonte pública oficial, porção padrão em gramas e consistência físico-química entre calorias totais e macronutrientes ($4 \times P + 4 \times C + 9 \times G \approx \text{kcal}$). Alimentos criados manualmente pelo usuário que apresentem discrepância matemática superior a $15\%$ exibirão aviso de validação mandatória antes do registro.
* **Consequências:** Preservação da alta precisão métrica que caracteriza a marca GymFlow.
