# ADR-PERS-005 — Modo Academia/Studio e Matriz de Mitigação de Riscos (R1–R4)

**Status:** Proposto  
**Data:** 02/09/2026  
**Decisores:** Founder, Time de Arquitetura  
**Referência:** `PERSONAL_TRAINER_PLATFORM_PLAN.md` §5–6, `GYMFLOW_SAAS_ARCHITECTURE.md` §5

---

## 1. Contexto

A visão de longo prazo do ecossistema GymFlow abrange não apenas o treinador autônomo individual, mas também redes de academias e studios de musculação/funcional. Entretanto, expandir precocemente o escopo do produto para atender complexidades operacionais de academias (catracas, controle de acesso físico, múltiplos contratos corporativos) antes de validar a tração do produto core representaria risco substancial de dispersão de foco e desperdício de capital.

Este ADR define a fronteira do modo Academia/Studio (marcado formalmente como FUTURO) e estabelece a matriz de mitigação dos 4 riscos críticos associados à plataforma.

---

## 2. Decisão: Modo Academia/Studio Classificado como FUTURO

> [!IMPORTANT]
> **Fronteira de Escopo:**
> O modo Academia/Studio permanece estritamente planejado para fases posteriores à consolidação do modo Personal Trainer autônomo. Nenhum desenvolvimento específico para academias será iniciado antes de o modo Personal atingir validação de mercado e retenção comprovada na Fase 8.

### 2.1 Especificações Registradas para o Futuro (Pós-Tração)

1. **Gestão de Múltiplos Personais por Unidade:**
   Estrutura hierárquica permitindo que o gestor da academia convide coordenadores técnicos e personais credenciados, com controle de visualização segregado por unidade.
2. **Alimentação Automática do GymProfile:**
   Ao se matricular em uma academia parceira, a lista física de equipamentos daquela unidade é automaticamente vinculada ao `GymProfile` do aluno (desenvolvido no GOAL-32), ajustando instantaneamente os filtros do Construtor de Treino e as opções de substituição sem necessidade de cadastro manual.
3. **QR Code no Aparelho Físico → Vídeo Técnico do Coach:**
   Adesivos impressos com QR Code fixados em cada máquina ou estação da academia. Ao apontar a câmera do celular dentro do app GymFlow, o aluno é levado imediatamente ao vídeo de instrução técnica do Coach para aquele aparelho específico (aproveitamento integral do acervo curado no GOAL-34). Essa abordagem elimina completamente a fragilidade e os falsos positivos de "reconhecimento de máquina por foto/IA".
4. **Relatórios Gerenciais Agregados:**
   Métricas de ocupação, horários de pico e equipamentos mais demandados, sem violação de dados individuais de saúde.

---

## 3. Matriz de Mitigação de Riscos Específicos

### R1: Responsabilidade Profissional e Regulatória (CREF / CONFEF / Ato Médico)
- **Risco:** Questionamento por conselhos regionais de educação física alegando exercício ilegal da profissão ou responsabilização civil da empresa por lesões causadas por prescrição errônea do treinador.
- **Mitigação Técnica e Jurídica:**
  - O GymFlow AI posiciona-se estritamente como uma **ferramenta de produtividade e suporte à prescrição**.
  - O sistema nunca altera, adiciona ou remove exercícios autonomamente no treino de um aluno vinculado a um personal.
  - Termos de Serviço (ToS) e avisos contratuais explícitos: a responsabilidade técnica e civil sobre a periodização e as cargas é 100% do profissional de educação física registrado no CREF.

### R2: LGPD e Dados Sensíveis de Saúde (Artigo 11 da Lei 13.709/2018)
- **Risco:** Vazamento de histórico médico, registros de dor articular, lesões crônicas ou medidas físicas, sujeitando a empresa a sanções graves da ANPD e danos morais.
- **Mitigação Técnica e Jurídica:**
  - Políticas estritas de Row Level Security (RLS) no Supabase (ADR-PERS-003).
  - Consentimento explícito, livre e granular no momento da vinculação com o personal.
  - Dados de saúde nunca são expostos a administradores de academia (ADR-PERS-001).
  - Portal de exclusão total de dados (*hard delete* de usuário, histórico e mídias associadas) e exportação em formato aberto (JSON).

### R3: Risco de Foco de Produto (Construir para o Personal antes de reter o Aluno)
- **Risco:** Desenvolver funcionalidades complexas de gestão de carteira enquanto o fluxo de treino ativo do aluno ainda carece de aderência.
- **Mitigação Técnica:**
  - O Gate G4 e o GOAL-35 impõem trava de zero backend até a consolidação da Fase 6/7.
  - O produto base do aluno (Treino Ativo, timer, substituição inteligente, RIR/RPE, histórico premium e vídeos técnicos) foi integralmente concluído antes de qualquer avanço multiusuário.

### R4: Sobrecarga Operacional e Expectativa de Chat em Tempo Real
- **Risco:** O canal de comunicação entre aluno e personal no app virar um "clone do WhatsApp", gerando frustração nos alunos por falta de resposta imediata e sobrecarregando o personal com plantão 24 horas.
- **Mitigação de Design:**
  - O canal é desenhado conceitualmente como **Comunicação Assíncrona e Contextual**: notas vinculadas a treinos concluídos, feedback de esforço e alertas de desconforto/dor.
  - Não há indicador de "digitando...", status de "online/visto por último" nem promessa de mensageria em tempo real, preservando a saúde mental do profissional e a clareza da proposta de valor.

---

## 4. Consequências

- **Positivas:**
  - Blindagem jurídica clara para a empresa operar em conformidade com o marco legal brasileiro.
  - Foco total mantido na simplicidade de entrega da Fase 8.
- **Limitações / Custos:**
  - Exige revisão jurídica formal dos Termos de Uso e Política de Privacidade antes do primeiro lançamento comercial pago.
