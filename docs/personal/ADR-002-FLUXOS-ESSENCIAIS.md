# ADR-PERS-002 — Fluxos Essenciais de Trabalho e Unicidade do Aplicativo

**Status:** Proposto  
**Data:** 02/09/2026  
**Decisores:** Founder, Time de Arquitetura  
**Referência:** `PERSONAL_TRAINER_PLATFORM_PLAN.md` §2

---

## 1. Contexto

A expansão de aplicativos de treino para modelos B2B2C frequentemente incorre no erro de criar dois produtos distintos e desconectados: "App do Personal" e "App do Aluno". Essa abordagem dobra os custos de desenvolvimento, divide os esforços de design de produto, gera inconsistências de experiência do usuário (UX) e degrada a velocidade de entrega.

Precisamos definir os fluxos de ponta a ponta que garantam excelência operacional para o treinador e simplicidade absoluta para o aluno, mantendo uma única base de código.

---

## 2. Decisão

### 2.1 O Aplicativo é Único (Single-App Architecture)

> [!IMPORTANT]
> **O aplicativo do aluno é o GymFlow AI regular.**
> Não existe "App Aluno GymFlow" separado do "App GymFlow". O modo Personal adiciona recursos de gestão de carteira, prescrição para terceiros e vínculos organizacionais quando a conta possui o perfil profissional, mas o motor de treino ativo, a biblioteca de exercícios, o player de mídia e os relatórios de evolução são exatamente os mesmos.

### 2.2 Fluxo Operacional do Personal Trainer

```
[Cadastro Profissional]
        │
        ▼
[Gerar Convite (Link / QR Code)] ──► [Aluno Aceita no Celular]
        │                                      │
        ▼                                      ▼
[Montar Treino no Construtor]          [Vínculo Estabelecido]
(Modo "Prescrição para Aluno")
        │
        ▼
[Publicar Programa] ─────────────────► [Programa Materializado no Aluno]
        │                                      │
        ▼                                      ▼
[Painel da Carteira de Alunos] ◄────── [Aluno Conclui e Envia Feedback]
(Aderência, Dor, Substituições, PRs)
        │
        ▼
[Feedback Assíncrono / Ajustes]
```

1. **Ativação Profissional:** O treinador adquire o plano no SaaS e habilita o perfil de Personal Trainer.
2. **Convite de Alunos:** O treinador gera um link de convite exclusivo ou exibe um QR Code na tela. O convite possui token seguro e validade configurável.
3. **Aceitação e Vinculação:** Ao abrir o link ou ler o QR Code no app GymFlow, o aluno visualiza o perfil do personal e confirma o vínculo.
4. **Prescrição Centralizada:** O personal abre o Construtor de Treino (`WorkoutBuilder`) em modo "Prescrever para Aluno", selecionando o perfil individual do aluno (seus equipamentos disponíveis, restrições articulares e foco).
5. **Aproveitamento de Templates:** O personal pode criar um treino do zero, selecionar um modelo de sua biblioteca particular ou clonar/adaptar um treino existente entre alunos de sua carteira.
6. **Publicação Instantânea:** Ao publicar, a versão do programa é enviada ao perfil do aluno.
7. **Monitoramento Ativo (Cockpit do Personal):**
   O painel web/mobile do treinador resume a saúde da carteira em tempo real:
   - Taxa de aderência semanal (% de treinos planejados vs realizados);
   - Alertas de sessões abandonadas ou incompletas;
   - Notificações de substituições de exercícios feitas pelo aluno na hora do treino;
   - Alertas críticos de desconforto ou dor apontados no feedback pós-treino;
   - Novos recordes pessoais (PRs) alcançados.
8. **Intervenção Técnica:** O personal pode anexar orientações técnicas textuais para o próximo dia de treino ou ajustar as cargas alvo.

### 2.3 Fluxo Operacional do Aluno

1. **Recepção Automática:** Ao sincronizar, o programa elaborado pelo personal aparece como o plano ativo da semana na tela inicial e no calendário.
2. **Execução Local-First:** O aluno inicia a sessão no Treino Ativo (`ActiveWorkoutPage`), idêntico à experiência padrão do GymFlow (funciona 100% offline, em qualquer subsolo ou área sem cobertura de sinal).
3. **Rituais de Execução:** Aquecimento guiado, timer de descanso inteligente, vídeos técnicos do Coach e sugestão de substituição inteligente caso o aparelho esteja ocupado.
4. **Feedback Pós-Sessão:** Ao concluir o treino, o aluno responde a um checklist objetivo (≤ 15 segundos):
   - Avaliação do treino (RPE global da sessão / escala de esforço percebido);
   - Registro de dor ou desconforto articular (selecionando a articulação afetada, se houver);
   - Campo de notas livres para dúvidas ou comentários ao treinador.
5. **Comunicação Assíncrona:** O aluno visualiza as notas e correções enviadas pelo personal diretamente nos cards dos exercícios das próximas sessões.

---

## 3. Consequências

- **Positivas:**
  - Zero duplicação de componentes visuais: a tela de treino ativo, o reprodutor de vídeos técnicos e a biblioteca de exercícios são 100% reaproveitados.
  - Alunos que já usavam o GymFlow de forma autônoma podem se conectar ao personal sem migração traumática de aplicativo.
  - A aderência técnica do treinador é favorecida pela riqueza dos dados de execução coletados pelo motor local-first do GymFlow.
- **Limitações / Custos:**
  - O Construtor de Treino precisa aceitar um contexto de visualização onde o `userProfile` considerado para regras de volume e equipamentos seja o do aluno selecionado, e não o do usuário logado no dispositivo.
