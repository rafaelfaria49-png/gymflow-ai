# ADR-PERS-003 — Modelo de Entidades Futuras e Isolamento Multi-tenant via RLS

**Status:** Proposto  
**Data:** 02/09/2026  
**Decisores:** Founder, Time de Arquitetura  
**Referência:** `PERSONAL_TRAINER_PLATFORM_PLAN.md` §3, `GYMFLOW_SAAS_ARCHITECTURE.md` §2

---

## 1. Contexto

A migração de uma arquitetura estritamente monousuário e local-first para uma plataforma multiusuário distribuída na nuvem (Fase 8 com Supabase) impõe desafios fundamentais de modelagem de dados e segurança. Precisamos definir a modelagem relacional de entidades que suportará as relações entre Academias, Personais e Alunos, garantindo que nenhum vazamento de dados ocorra entre diferentes organizações e que dados confidenciais de saúde permaneçam estritamente isolados.

---

## 2. Decisão

### 2.1 Especificação Conceitual das Entidades Futuras (Fase 8)

Para a implementação futura no PostgreSQL/Supabase, as entidades serão modeladas conforme as definições formais abaixo:

```sql
-- 1. Organização (Tenancy raiz: consultoria autônoma, studio ou academia)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('personal', 'studio', 'gym')),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Membros e Papéis (Vínculo do usuário com a organização)
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('student', 'coach', 'assistant_coach', 'gym_admin', 'platform_admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'invited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- 3. Convites Gerados
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'assistant_coach', 'coach')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INT NOT NULL DEFAULT 1,
  uses_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Programas Atribuídos ao Aluno
CREATE TABLE assigned_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  student_id UUID NOT NULL REFERENCES auth.users(id),
  program_id UUID NOT NULL, -- Referência ao WorkoutProgram canônico
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Anotações Técnicas do Treinador
CREATE TABLE coach_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_program_id UUID NOT NULL REFERENCES assigned_programs(id) ON DELETE CASCADE,
  session_log_id UUID, -- Opcional: vinculado a um dia/sessão específico
  author_id UUID NOT NULL REFERENCES auth.users(id),
  text TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Tópico de Feedback e Comunicação Assíncrona
CREATE TABLE feedback_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_program_id UUID NOT NULL REFERENCES assigned_programs(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id),
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved'))
);

-- 7. Mensagens de Feedback e Notificação de Desconforto/Dor
CREATE TABLE feedback_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES feedback_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  text TEXT NOT NULL,
  rpe_score NUMERIC(3,1), -- Ex: 8.5
  pain_detected BOOLEAN NOT NULL DEFAULT false,
  pain_location TEXT, -- Ex: 'ombro_direito', 'lombar'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 3. Estratégia de Isolamento Multi-tenant via Row Level Security (RLS)

1. **Chave de Tenant Unificada (`org_id`):**
   Todas as tabelas associadas a dados operacionais e de treinamento carregam compulsoriamente a coluna `org_id`.
2. **Políticas RLS Nativas no PostgreSQL:**
   Nenhum dado é isolado por convenção de software na camada da aplicação; o isolamento é imposto de forma rígida pelo motor de banco de dados do Supabase.

### Exemplo de Política RLS (PostgreSQL):

```sql
-- Habilitar RLS em assigned_programs
ALTER TABLE assigned_programs ENABLE ROW LEVEL SECURITY;

-- Política 1: O Aluno só pode ler treinos atribuídos a ele mesmo
CREATE POLICY student_view_own_assigned_programs ON assigned_programs
  FOR SELECT
  USING (student_id = auth.uid());

-- Política 2: O Coach só pode ler/gravar treinos dos alunos de sua organização
CREATE POLICY coach_manage_org_assigned_programs ON assigned_programs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.org_id = assigned_programs.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('coach', 'assistant_coach')
    )
  );
```

---

## 4. Neutralidade e Preparação Atual de Domínio (GOAL-35)

Para preparar o domínio sem violar a trava do Gate G4 (zero backend nesta fase):
- **O que foi implementado em código:** Apenas a propriedade opcional e neutra `createdBy?: 'user' | 'coach' | 'system'` na interface `WorkoutProgram` (`src/types/index.ts`), acompanhada de testes rigorosos de serialização comprovando total retrocompatibilidade.
- **O que permanece estritamente em documentação:** Os campos relacionais (`authorId`, `orgId`, chaves estrangeiras e esquemas SQL) permanecem documentados exclusivamente nesta especificação e serão implementados somente na Fase 8. Nenhuma complexidade multi-tenant foi antecipada no código do produto local.

---

## 5. Consequências

- **Positivas:**
  - Impossibilidade de vazamento de dados entre academias concorrentes ou personais independentes.
  - O banco de dados bloqueia acessos indevidos mesmo em caso de erro lógico na camada de frontend.
  - Zero débito técnico de retrabalho quando o backend do Supabase for conectado na Fase 8.
- **Limitações / Custos:**
  - Exige consultas estruturadas com passagem do token de autorização JWT nas migrações do GOAL-36/40.
