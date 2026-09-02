# ADR-PERS-001 — Papéis, Permissões e Governança LGPD no Modo Personal

**Status:** Proposto  
**Data:** 02/09/2026  
**Decisores:** Founder, Time de Arquitetura  
**Referência:** `PERSONAL_TRAINER_PLATFORM_PLAN.md` §1, Lei Geral de Proteção de Dados (Lei 13.709/2018, Art. 11)

---

## 1. Contexto

O GymFlow AI foi concebido e consolidado como uma aplicação local-first voltada ao praticante individual. Com a expansão para o mercado profissional de treinamento personalizado (Personal Trainers, Treinadores Auxiliares, Studios e Academias), o sistema precisa definir um modelo de controle de acesso baseado em papéis (RBAC - *Role-Based Access Control*) que acomode as necessidades operacionais de prescrição e acompanhamento remoto sem comprometer a privacidade dos alunos nem violar normas sanitárias e regulatórias brasileiras (LGPD e resoluções do CONFEF/CREF).

---

## 2. Decisão

Adotar uma taxonomia estrita de 5 papéis de acesso no sistema, estruturada de acordo com o princípio do menor privilégio (*Least Privilege*):

### 2.1 Taxonomia de Papéis

1. **Aluno (`student`):** O usuário final que realiza os treinos. Tem controle total sobre a execução de suas sessões, anotações de carga, sensações de esforço subjetivo e apontamento de desconforto/dor.
2. **Personal Trainer (`coach`):** O profissional de educação física responsável pela prescrição técnica e periodização dos seus alunos vinculados.
3. **Treinador Auxiliar (`assistant_coach`):** Profissional ou estagiário autorizado pelo treinador principal a visualizar e adaptar treinos de alunos expressamente delegados a ele.
4. **Administrador de Academia/Studio (`gym_admin`):** Gestor da organização física ou jurídica. Focado em gestão de equipe, matrículas e relatórios gerenciais agregados.
5. **Administrador da Plataforma (`platform_admin`):** Suporte técnico operacional do GymFlow AI, com acesso estritamente técnico e auditado.

---

## 3. Matriz de Capacidades

| Capacidade Operacional | Aluno (`student`) | Personal (`coach`) | Aux. Treinador (`assistant_coach`) | Admin Academia (`gym_admin`) | Admin Plataforma (`platform_admin`) |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver e executar o próprio treino | ✅ Total | ✅ Próprio | — | — | — |
| Registrar carga, reps, dor e feedback pós-treino | ✅ Total | ✅ Próprio | — | — | — |
| Criar e editar programas de alunos vinculados | ❌ | ✅ Seus alunos | ✅ Alunos delegados | ❌ Proibido | ❌ Proibido |
| Visualizar execução e histórico do aluno | ❌ | ✅ Seus alunos | ✅ Alunos delegados | Agregado anônimo* | Agregado |
| Convidar alunos / gerenciar carteira | ❌ | ✅ Seus alunos | ❌ | ✅ Da academia | ✅ Suporte |
| Gerenciar biblioteca de templates da organização | Usar atribuídos | Criar / Editar | Usar atribuídos | Gerenciar catálogo | — |
| Gerenciar faturamento e assinaturas do SaaS | ❌ | Próprio plano | ❌ | Assinatura da unidade | ✅ Faturamento |

---

## 4. Governança e Salvaguardas LGPD (Artigo 11 — Dados Sensíveis)

> [!CAUTION]
> **Proteção Inegociável de Dados Sensíveis de Saúde:**
> Histórico de treinamento, séries realizadas, registro de dores, lesões, histórico de peso, medidas antropométricas e feedbacks fisiológicos constituem **dados sensíveis de saúde** sob o Artigo 11 da LGPD (Lei 13.709/2018).

1. **Isolamento de Saúde Aluno–Academia:**
   O administrador de academia (`gym_admin`) **NUNCA** terá acesso a registros individuais de saúde, histórico de dor, evolução física ou notas médicas de um aluno, a menos que haja termo de consentimento livre, expresso, específico e destacado firmado pelo aluno para aquela unidade. Por padrão, a academia tem acesso exclusivamente a métricas gerenciais agregadas e anonimizadas (ex.: taxa de ocupação, número de treinos concluídos no mês, frequência média).
2. **Exclusividade do Vínculo Profissional:**
   Apenas o Personal Trainer vinculado (`coach`) e seu eventual auxiliar expressamente delegado possuem visualização dos dados técnicos de desempenho do aluno.
3. **Revogação do Vínculo:**
   Caso o vínculo entre aluno e personal seja desfeito, o personal perde imediatamente o acesso a dados futuros de execução do aluno. O histórico passado permanece acessível pelo personal apenas enquanto durar a necessidade de comprovação de prestação de serviços profissionais, garantido ao aluno o direito de solicitar a exclusão de sua conta conforme previsto na LGPD.

---

## 5. Consequências

- **Positivas:**
  - Modelo jurídico limpo e seguro para conformidade regulatória no Brasil.
  - Garante total confiança do aluno de que suas informações fisiológicas e de lesão não serão expostas comercialmente a donos de academias.
  - Permite delegação operacional flexível para grandes assessorias esportivas e studios que utilizam estagiários ou treinadores juniores.
- **Limitações / Custos:**
  - Exige que o backend da Fase 8 implemente políticas de segurança de dados no nível do banco (Row Level Security no Postgres) que verifiquem não apenas a organização, mas o vínculo específico de delegação.
