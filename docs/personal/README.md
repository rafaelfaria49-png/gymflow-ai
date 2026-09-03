# GymFlow AI — Fundação do Modo Personal & SaaS

**Fase:** 7 · **GOAL:** 35 · **Status:** Documentação & Planejamento (Gate G4 Concluído)

Este diretório reúne a especificação arquitetural, a auditoria de prontidão para sincronização e os Architecture Decision Records (ADRs) que preparam a plataforma GymFlow AI para a futura expansão multiusuário (Personal Trainer, Aluno, Studio e Academia) na **Fase 8**.

---

## 1. Contexto e Gates

Conforme estabelecido no roadmap de produto (`IMPLEMENTATION_ROADMAP.md`), o **Gate G4** encerrou formalmente a fase de definição estratégica do backend e do modelo comercial com as decisões do Founder:
- **D16 (Modelo Comercial):** Aprovado o **Modelo A** (Personal assina a plataforma SaaS e gerencia sua relação financeira com os alunos por fora) com estrutura de precificação por faixas do **Modelo C** (Starter, Pro, Studio). O Modelo B (intermediação com split) foi descartado na fase inicial devido à complexidade regulatória, fiscal e jurídica no Brasil.
- **D17 (Tecnologia de Backend Futuro):** Aprovado o **Supabase** (Postgres + Auth + RLS + Storage) como backend de sincronização na nuvem da Fase 8, preservando o princípio **local-first** (o aplicativo opera 100% offline no dispositivo móvel ou web).

O **GOAL-35** tem escopo estritamente restrito a:
1. **Zero backend:** nenhuma linha de backend, chamada de rede, cliente Supabase, sistema de autenticação, billing ou chat é implementada nesta fase.
2. **Auditoria de prontidão para sync:** análise objetiva do estado atual do domínio sob os requisitos de sincronização de `GYMFLOW_SAAS_ARCHITECTURE.md` §1.
3. **ADRs formais:** registro técnico detalhado dos papéis, fluxos, entidades, isolamento RLS, modelo comercial e riscos específicos.
4. **Preparação neutra de tipos:** inclusão do campo opcional e neutro `createdBy?: 'user' | 'coach' | 'system'` em `WorkoutProgram`, com testes de serialização comprovando zero alteração comportamental.

---

## 2. Índice Documental

| Documento | Assunto | Referência |
|---|---|---|
| [SYNC_READINESS_AUDIT.md](file:///c:/Projetos/gymflow-ai/docs/personal/SYNC_READINESS_AUDIT.md) | Auditoria minuciosa de prontidão para sincronização (IDs, timestamps, referências, serialização, gaps) | SAAS §1 |
| [ADR-001-PAPEIS-E-PERMISSOES.md](file:///c:/Projetos/gymflow-ai/docs/personal/ADR-001-PAPEIS-E-PERMISSOES.md) | Matriz RBAC de permissões e privacidade LGPD (Art. 11 — dados sensíveis de saúde) | PERSONAL §1 |
| [ADR-002-FLUXOS-ESSENCIAIS.md](file:///c:/Projetos/gymflow-ai/docs/personal/ADR-002-FLUXOS-ESSENCIAIS.md) | Fluxos de trabalho de Personal e Aluno (app unificado GymFlow) | PERSONAL §2 |
| [ADR-003-ENTIDADES-E-ISOLAMENTO-RLS.md](file:///c:/Projetos/gymflow-ai/docs/personal/ADR-003-ENTIDADES-E-ISOLAMENTO-RLS.md) | Entidades multi-tenant futuras e modelo de isolamento via Row Level Security (RLS) | PERSONAL §3 |
| [ADR-004-MODELO-COMERCIAL-E-PRICING.md](file:///c:/Projetos/gymflow-ai/docs/personal/ADR-004-MODELO-COMERCIAL-E-PRICING.md) | Detalhamento da Decisão D16 (Modelo A→C) e propostas de pricing para validação | PERSONAL §4 |
| [ADR-005-ACADEMIA-STUDIO-E-RISCOS.md](file:///c:/Projetos/gymflow-ai/docs/personal/ADR-005-ACADEMIA-STUDIO-E-RISCOS.md) | Escopo futuro Studio/Academia e matriz de mitigação de riscos (R1–R4) | PERSONAL §5–6 |
| [FASE_8_ROADMAP_GOALS.md](file:///c:/Projetos/gymflow-ai/docs/personal/FASE_8_ROADMAP_GOALS.md) | Decomposição sequencial dos GOALs da Fase 8 (GOAL-36 ao GOAL-43) | SAAS §6 |

---

## 3. Garantias e Invariantes

- **Retrocompatibilidade estrita:** Todos os programas e dados salvos nas versões anteriores continuam abrindo e serializando normalmente.
- **Isolamento de produto:** O usuário individual atual não sofre nenhuma degradação, lock-in de login ou requisição indesejada de rede.
- **Preparação documental limpa:** As decisões estão prontas para guiar o início da Fase 8 no momento em que o Founder autorizar o início do backend.
