# Roadmap Futuro da Fase 8 — Decomposição de GOALs SaaS e Modo Personal

**Status:** Proposto (Planejamento Arquitetural)  
**Referência Estrutural:** `GYMFLOW_SAAS_ARCHITECTURE.md` §6, `PERSONAL_TRAINER_PLATFORM_PLAN.md` §1–6

---

## 1. Visão Geral e Diretrizes

A **Fase 8** representa a transição do GymFlow AI de um aplicativo local-first estritamente monousuário para uma plataforma conectada em nuvem com sincronização resiliente e suporte ao ecossistema profissional de treinamento (Personal Trainer, Aluno, Studio e Academia).

Em estrito alinhamento com a diretriz do Founder em `GYMFLOW_SAAS_ARCHITECTURE.md` §6, a implementação será realizada de forma incremental, onde cada etapa entrega valor independente e isolado com baixo risco:

```
[GOAL-36: Auth + Conta]
         │
         ▼
[GOAL-37: Backup em Nuvem] (Valor imediato, risco zero de conflito)
         │
         ▼
[GOAL-38: Sync Incremental Local-First] (Motor de mutações outbox)
         │
         ▼
[GOAL-39: Billing Individual Brasil] (PIX / Cartão / Play Billing)
         │
         ▼
[GOAL-40: Modo Personal — Carteira] (Onboarding, convites e RLS)
         │
         ▼
[GOAL-41: Prescrição para Aluno] (Builder adaptado e templates)
         │
         ▼
[GOAL-42: Feedback & Acompanhamento] (Alerte de dor e notas)
         │
         ▼
[GOAL-43: Push, Telemetria & LGPD] (FCM e portal de exclusão)
```

> [!IMPORTANT]
> **Regra de Execução:** Nenhum código dos GOALs abaixo deve ser antecipado na Fase 7. Cada GOAL da Fase 8 terá seu próprio plano de implementação e gate de aprovação explícito do Founder.

---

## 2. Decomposição dos GOALs da Fase 8

### GOAL-36 — Autenticação e Gestão de Contas (Supabase Auth)
- **Prioridade:** P1 · **Depende de:** Gate G4
- **Objetivo:** Estabelecer a camada de identidade do usuário na nuvem com Supabase Auth sem quebrar a experiência anônima local-first.
- **Entregáveis:**
  - Login e cadastro com E-mail + OTP (código de uso único), Google OAuth e Apple Sign-In.
  - Armazenamento seguro de tokens JWT no dispositivo (Capacitor Secure Storage no mobile; armazenamento local protegido na web).
  - Coexistência harmoniosa: o usuário pode continuar utilizando o GymFlow como convidado offline sem obrigatoriedade imediata de cadastro.
- **Critério de Saída / Gate:** Usuário autentica com sucesso na nuvem e o aplicativo opera normalmente sem internet caso a conexão caia.

---

### GOAL-37 — Backup e Restauração em Nuvem (Cloud Vault)
- **Prioridade:** P0 · **Depende de:** GOAL-36
- **Objetivo:** Oferecer segurança absoluta de dados para o usuário individual antes de qualquer complexidade de sincronização bidirecional.
- **Entregáveis:**
  - Upload sob demanda e periódico do snapshot JSON completo (já auditado e verificado no GOAL-17B/35) para o bucket seguro do Supabase Storage.
  - Fluxo de restauração garantida em caso de troca de aparelho ou perda de celular.
  - Criptografia dos dados em repouso e em trânsito.
- **Critério de Saída / Gate:** Backup e restauração roundtrip verificados por checksum SHA-256 entre múltiplos dispositivos.

---

### GOAL-38 — Sincronização Incremental Local-First (Outbox Engine)
- **Prioridade:** P0 · **Depende de:** GOAL-37
- **Objetivo:** Implementar o motor de sincronização incremental sem interferir na fluidez do treino offline.
- **Entregáveis:**
  - Fila local de mutações pendentes (*Outbox Queue*) em IndexedDB.
  - Geração de identificadores únicos via UUIDv4 para todas as entidades criadas dinamicamente.
  - Resolução de conflitos Last-Write-Wins (LWW) baseada em `updatedAt` + `deviceId` para entidades mutáveis (`WorkoutProgram`, `UserProfile`).
  - Merge transparente e append-only de sessões de treino (`WorkoutSession`), eliminando qualquer risco de duplicidade de histórico.
- **Critério de Saída / Gate:** Simulação de treino realizado em subsolo de academia sem sinal que sincroniza perfeitamente ao restabelecer conexão Wi-Fi/4G.

---

### GOAL-39 — Faturamento e Assinaturas Individuais Brasil (Billing B2C)
- **Prioridade:** P1 · **Depende de:** GOAL-38
- **Objetivo:** Monetizar a base individual com experiência de pagamento otimizada para o mercado brasileiro.
- **Entregáveis:**
  - Integração com Mercado Pago / PIX recorrente e cartão de crédito via Stripe para Web.
  - Integração com Google Play Billing / RevenueCat para assinaturas no app Android (em estrita conformidade com as políticas da Google Play Store).
  - Período de avaliação transparente (*Trial*) sem exigência prévia de dados de cartão de crédito.
- **Critério de Saída / Gate:** Fluxo ponta a ponta de assinatura, renovação automática e cancelamento seguro em ambiente de homologação.

---

### GOAL-40 — Plataforma Modo Personal: Onboarding e Carteira (D16)
- **Prioridade:** P1 · **Depende de:** GOAL-39
- **Objetivo:** Materializar a camada organizacional multi-tenant e a gestão de alunos do Personal Trainer.
- **Entregáveis:**
  - Modelagem das tabelas `organizations`, `memberships` e `invites` no Supabase (conforme ADR-PERS-003).
  - Geração de links de convite e QR Codes para vinculação rápida de alunos.
  - Painel da carteira de alunos ativos com limites impostos pelo plano SaaS assinado (Modelo A nas faixas do Modelo C).
- **Critério de Saída / Gate:** Personal cria conta, gera convite e aluno vincula-se com isolamento RLS comprovado.

---

### GOAL-41 — Prescrição e Atribuição de Treinos Remotos (Coach Builder)
- **Prioridade:** P1 · **Depende de:** GOAL-40
- **Objetivo:** Habilitar a prescrição técnica de programas elaborados pelo personal diretamente para seus alunos.
- **Entregáveis:**
  - Modo "Prescrever para Aluno" integrado ao `WorkoutBuilder` existente, herdando equipamentos e restrições do aluno selecionado.
  - Criação da entidade `assigned_programs` e versionamento de prescrição.
  - Biblioteca privada de modelos/templates do treinador, permitindo duplicação rápida entre alunos da carteira.
- **Critério de Saída / Gate:** Treino prescrito pelo personal no painel web aparece instantaneamente na tela do aplicativo móvel do aluno vinculado.

---

### GOAL-42 — Acompanhamento de Execução, Feedback e Alertas de Dor
- **Prioridade:** P1 · **Depende de:** GOAL-41
- **Objetivo:** Fechar o ciclo de acompanhamento do treinador com dados ricos de execução sem sobrecarga de suporte em tempo real.
- **Entregáveis:**
  - Tela de feedback pós-treino no app do aluno (RPE global, notas livres e checklist específico de dor articular/desconforto).
  - Alertas destacados no painel do personal quando um aluno reportar dor ou abandonar um treino.
  - Anotações técnicas e orientações do personal (`coach_notes`) exibidas nos cards de exercícios do aluno para a próxima sessão.
- **Critério de Saída / Gate:** Aluno reporta dor no joelho após agachamento e o personal recebe o alerta imediatamente em seu painel com histórico preservado.

---

### GOAL-43 — Notificações Push, Telemetria Privacy-First e Portal LGPD
- **Prioridade:** P2 · **Depende de:** GOAL-42
- **Objetivo:** Maximizar a retenção e cumprir integralmente a legislação sanitária e de proteção de dados.
- **Entregáveis:**
  - Notificações push via Firebase Cloud Messaging (FCM) para lembretes de treino e avisos de novos treinos atribuídos pelo treinador.
  - Telemetria de uso agregada e anônima (sem envio de dados individuais de saúde).
  - Portal de privacidade do usuário com opção de download integral de dados (Art. 18 LGPD) e exclusão definitiva da conta (*hard delete* auditado).
- **Critério de Saída / Gate:** Exclusão de conta testada com purga completa em banco e storage; auditoria de conformidade ANPD aprovada.
