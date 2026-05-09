# Market Autonomy Backlog

## Objetivo

Este backlog traduz o roadmap de autonomia operacional em mercado para um plano técnico implementável dentro do repositório atual do John.

O foco inicial continua sendo fundação determinística, simulação local, read-only de mercado e trade copilot. Live trading segue fora do escopo imediato.

---

## Estado em 2026-05-09

O repositório já passou da fase de esboço. A fundação local de autonomia de mercado existe, compila, tem testes dedicados e está integrada à HUD.

Implementado:

- Tipos compartilhados de market autonomy e snapshot de HUD.
- Snapshot normalizado a partir do TradingView, com store de último snapshot válido.
- Strategy engine inicial com `breakout_v1`.
- Risk engine determinístico com policy local configurável.
- Broker adapter base e paper broker local.
- Supervisor de simulação com trilha de auditoria.
- Audit log persistido em `userData/trade-audit-records.json`, limitado aos últimos 300 registros.
- Chaos runner com cobertura automatizada dos cenários mínimos.
- IPCs `market-autonomy:get-view`, `market-autonomy:get-chat-prompt`, `market-autonomy:execute-action`, `market-autonomy:get-kill-switch`, `market-autonomy:set-kill-switch`, `market-autonomy:get-policy`, `market-autonomy:set-policy` e `market-autonomy:reset-policy`.
- Painel de mercado/autonomia na HUD com snapshot, proposta, risco, guards, paper account, posições, ordens, audit trail, kill switch e policy ativa.

Validação atual:

- `npm run typecheck` passa.
- `npm test` passa com 101 testes.
- A cobertura dedicada de market autonomy valida snapshot, risk engine, execução paper, audit log persistido, chaos cases, kill switch e policy persistida.

---

## Lacunas atuais

Prioridade alta:

- Persistir ou reidratar estado completo do paper broker quando fizer sentido fora da sessão do processo.
- Melhorar robustez do snapshot quando TradingView estiver incompleto.
- Impedir confusão entre proposta atual e snapshot antigo com identificador persistente de proposta.

Prioridade média:

- Persistir histórico formal de propostas além do audit trail.
- Diferenciar melhor ausência de setup, setup bloqueado e falta de dados na UI.
- Cobrir layouts e símbolos variados além do fluxo `BTCUSDT` `5m`.
- Melhorar reconciliação de ordens/fills para cenários mais próximos de broker real.

Fora de escopo por enquanto:

- Broker real.
- Live trading.
- Múltiplas estratégias concorrentes.
- Multi-asset routing.

---

## Fase 0 - Fundação e simulação local

Status: concluída.

Concluído:

- Modelo de domínio compartilhado.
- Policies iniciais para `read_only`, `copilot`, `paper_auto` e `live_guarded`.
- Risk engine determinístico.
- Broker adapter base.
- Paper broker local.
- Supervisor de simulação.
- Audit log persistido com cache em memória e limite de 300 registros.
- Chaos runner local com testes automatizados.

---

## Fase 1 - Market Read Only

Status: concluída com pendências explícitas de robustez.

Concluído:

- Snapshot consolidado a partir do TradingView.
- Store de snapshot atual e último snapshot válido.
- Classificador simples de regime.
- Strategy engine inicial.
- Regra `breakout_v1`.
- Painel na HUD com snapshot, setup, risco, guards e fallback.

Pendências:

- Melhorar robustez do snapshot quando TradingView estiver incompleto.
- Anexar notícia/calendário ao snapshot de forma mais explícita.
- Cobrir layouts e símbolos variados.

---

## Fase 2 - Trade Copilot

Status: copilot básico funcional.

Concluído:

- Proposal builder local.
- Resposta de chat com proposta, bloqueios e ações.
- Ação de aprovar no paper.
- Ação de rejeitar com registro auditável `manual_reject`.
- Execução paper somente após ação explícita na HUD/chat.
- Snapshot de HUD com account paper, posições abertas, ordens abertas e audit trail recente.
- Kill switch local bloqueando execução com violação `kill_switch_active`.
- Policy configurável em runtime com reset para default seguro.

Pendências:

- Persistir histórico formal de propostas.
- Adicionar identificador de proposta para replay mais forte.
- Persistir estado completo do paper broker entre restarts, se isso virar requisito.

---

## Próxima ordem recomendada

1. Fortalecer replay com ID persistente de proposta.
2. Persistir histórico de propostas separado da auditoria operacional.
3. Reidratar estado completo do paper broker entre restarts, se a operação simulada exigir continuidade.
4. Expandir símbolos/timeframes e layouts suportados.
5. Só depois iniciar integração com broker real.

Essa ordem mantém o sistema auditável antes de ampliar autonomia.
