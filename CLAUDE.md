@AGENTS.md

# CLAUDE.md — Regras permanentes GymFlow AI

## Autonomia

* Execute cada GOAL do início ao fim sem pedir confirmação.
* Ambiguidade dentro do escopo: decida sozinho seguindo o padrão do código existente e registre 1 linha em docs/DECISOES.md.
* Problema fora do escopo: não corrija; anote em docs/PENDENCIAS.md e siga.

## Validação obrigatória

1. npm run build deve passar sem erros.
2. Se alterar comportamento crítico, registrar antes/depois no GOALS_LOG.
3. Ao final, fazer commit com mensagem clara do GOAL executado.

## Regras técnicas

* Não tocar em labs/avatar-lab.
* Não tocar em docs/avatar-design.
* Não tocar em app/poc-3d.
* Não tocar em arquivos GLB.
* Não tocar em pipeline do Kai.
* Não implementar backend.
* Não implementar Supabase.
* Não implementar pagamento real.
* Design system: dark + verde-lima, fonte Outfit, mobile-first, toque mínimo 44px.
* Proibido alert()/confirm() nativo em código novo.
