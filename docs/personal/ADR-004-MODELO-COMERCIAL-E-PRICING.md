# ADR-PERS-004 — Modelo Comercial, Governança Fiscal e Estrutura de Precificação (Decisão D16)

**Status:** Aprovado no Modelo Comercial (Decisão D16 pelo Founder) · Proposta de Pricing para Validação Futura  
**Data:** 02/09/2026  
**Decisores:** Founder, Time de Arquitetura e Negócios  
**Referência:** `PERSONAL_TRAINER_PLATFORM_PLAN.md` §4, `GYMFLOW_SAAS_ARCHITECTURE.md` §4

---

## 1. Contexto

A definição do modelo comercial do modo Personal é o pilar que orienta a arquitetura de faturamento, a engenharia de contratos e a exposição jurídica e tributária da empresa. Três modelos conceituais foram avaliados pelo Founder e pela equipe técnica:

- **Modelo A (SaaS Puro):** O Personal Trainer assina a plataforma GymFlow e gerencia suas cobranças diretamente com seus alunos por fora (PIX, boleto particular, dinheiro).
- **Modelo B (Marketplace / Intermediação com Split Payment):** O Aluno paga a mensalidade da consultoria diretamente dentro do app GymFlow, e a plataforma retém um percentual (take-rate) repassando o restante para a conta bancária do personal.
- **Modelo C (Precificação Escalonada por Carteira de Alunos):** A assinatura do software é cobrada do treinador em faixas proporcionais ao número de alunos ativos cadastrados.

---

## 2. Decisão

> [!IMPORTANT]
> **Decisão D16 (Aprovada pelo Founder):**
> Adotar o **Modelo A estruturado nas faixas de precificação do Modelo C**.
> O GymFlow operará como um fornecedor de software (SaaS B2B puro). O Personal Trainer é o único cliente contratual e pagante; os alunos vinculados recebem acesso completo ao aplicativo sem cobrança direta da plataforma.

### 2.1 Matriz Comparativa de Modelos

| Critério de Avaliação | **Modelo A** (SaaS Puro) | **Modelo B** (Intermediação / Split) | **Modelo C** (Faixas por Carteira) |
|---|:---:|:---:|:---:|
| **Simplicidade de Lançamento** | **Máxima** (Gateway SaaS simples) | Baixa (Exige conta escrow, KYC e split) | Alta (Controle por limite de carteira) |
| **Exposição Fiscal e Tributária** | **Baixa** (Nota fiscal de software puro) | **Crítica** (Bi-tributação, intermediação, retenções) | **Baixa** (Nota fiscal de software puro) |
| **Risco Regulatório no Brasil** | Nulo (Plataforma tecnológica) | **Alto** (Risco de solidariedade civil e CREF) | Nulo (Plataforma tecnológica) |
| **Gestão de Inadimplência** | 1 cliente: o personal trainer | Milhares de alunos finais | 1 cliente: o personal trainer |
| **Superfície de LGPD / Compliance** | Mínima (B2B SaaS) | Máxima (Dados bancários de milhares de CPFs) | Mínima (B2B SaaS) |
| **Retenção / Churn de Produto** | Altíssima (Software central de trabalho) | Moderada | Altíssima (Escala conforme o negócio cresce) |

---

## 3. Justificativa Estratégica e Fiscal (Por que não o Modelo B?)

1. **Inviabilidade Regulatória e Fiscal Inicial do Modelo B no Brasil:**
   Operar como intermediador de pagamentos com split para profissionais autônomos no Brasil exige infraestrutura complexa de KYC (*Know Your Customer*), emissão de notas fiscais sobre a taxa de intermediação versus o valor total do serviço de educação física, e risco de caracterização de intermediação de serviço profissional regulamentado pelo Conselho Regional de Educação Física (CREF), atraindo corresponsabilidade civil e sanitária por eventuais lesões causadas pelo personal.
2. **Alinhamento de Incentivos:**
   O Personal Trainer não quer que uma plataforma de tecnologia "fique entre ele e o aluno" cobrando taxas percentuais abusivas sobre seus honorários. No Modelo A, o personal mantém 100% da receita cobrada de seus clientes e vê o GymFlow como uma ferramenta de valor que otimiza seu tempo e profissionaliza sua entrega.
3. **Poderoso Argumento de Vendas para o Treinador:**
   O aluno vinculado tem sua assinatura do aplicativo GymFlow 100% coberta pelo plano do personal. O personal utiliza o GymFlow como um diferencial competitivo de alto valor agregado na venda de sua consultoria presencial ou online ("Treinando comigo, você ganha acesso exclusivo ao app GymFlow Pro").

---

## 4. Proposta de Estrutura de Precificação (Estimativas para Validação Futura)

> [!NOTE]
> Os valores abaixo são **PROPOSTAS DE REFERÊNCIA** para validação comercial na Fase 8 e **NÃO** constituem preços definitivos ou homologados pelo Founder.

| Plano / Faixa | Perfil Alvo | Limite de Alunos Ativos | Faixa de Preço Estimada (Validação) | Recursos Incluídos |
|---|---|:---:|:---:|---|
| **Personal Starter** | Personal iniciante / consultoria enxuta | Até 10 alunos | **R$ 49,00 a R$ 69,00 / mês** | Prescrição completa, painel de carteira, histórico e vídeos técnicos do Coach. |
| **Personal Pro** | Treinador estabelecido / alta demanda | Até 50 alunos | **R$ 129,00 a R$ 169,00 / mês** | Tudo do Starter + biblioteca ilimitada de templates, alertas de dor e relatórios de PR. |
| **Studio / Equipe** | Assessorias esportivas e pequenos studios | Ilimitado (até 5 treinadores) | **A partir de R$ 299,00 / mês** | Multi-treinador, delegação de alunos, templates compartilhados da equipe. |
| **Academia / Rede** | Academias de grande porte | Sob medida | **Sob Consulta Corporativa** | Múltiplas unidades, integração GymProfile e relatórios anônimos de frequência. |

---

## 5. Consequências

- **Positivas:**
  - A esteira de faturamento é trivial: integração padrão com Stripe ou Mercado Pago / PIX recorrente, emitindo NFS-e direta para o CNPJ/CPF do treinador.
  - Zero atrito com os alunos na instalação do aplicativo, aumentando a taxa de adesão em mais de 80%.
- **Limitações / Custos:**
  - Exige que o backend valide a trava de capacidade da carteira (`MAX(memberships WHERE role='student') <= plan_limit`) antes de permitir o envio de novos convites.
