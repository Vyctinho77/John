# Ares

Ares é um agente residente em desktop — um HUD flutuante construído com Electron, React e TypeScript que vive na tela do usuário e age como tutor, coanalista e operador autônomo. Ele observa o contexto visual em tempo real, mantém memória de sessão e persistida, integra múltiplos provedores de IA e conecta com ferramentas externas como VS Code, Spotify e TradingView.

O projeto tem dois eixos principais:

- `desktop/`: aplicativo Electron com HUD, percepção, memória, tutor, operador autônomo e todos os serviços de integração.
- `packages/connector-vscode/`: extensão VS Code que transmite contexto do editor (código, diagnósticos, git, terminal) para o app via WebSocket local.

---

## O que o Ares faz hoje

### HUD multi-estado

O HUD opera em cinco estados visuais com transições fluidas:

- **Compacto** — pill mínimo, ticker e status dos conectores.
- **Intermediário** — resposta em leitura rápida, sem interação.
- **Expandido** — chat completo com histórico, ações contextuais e configurações.
- **Sidebar** — encaixado lateralmente na tela (snap automático nas bordas), largura ajustável.
- **Operador** — modo de tela cheia com chart TradingView embutido e drawer de chat flutuante.

### Percepção visual

Pipeline completa de leitura de tela:

- Captura de tela configurável (qualquer janela visível ou fonte selecionada).
- OCR via `tesseract.js` com cache e regiões de interesse.
- Análise semântica via Vision LLM para identificar superfície, foco, intenção e contexto de código.
- Modo privado e bloqueio automático de superfícies sensíveis.
- Memória de sessão com sumarização incremental e continuidade entre capturas.

### Tutor adaptativo

- Orquestração de resposta com streaming, steps visuais e retry entre providers.
- Calibração de profundidade adaptativa — detecta se o usuário quer mais detalhe ou simplicidade.
- Sugestões proativas baseadas em padrões de comportamento detectados.
- Sistema de domínios: `code`, `market`, `document`, `reading`, `homework`, `general`.
- Múltiplos modos de resposta: `direct`, `step_by_step`, `analogy`, `summary`, `diagnostic`, `layered`.
- Cache de respostas por fingerprint de contexto para evitar chamadas desnecessárias.
- Histórico de chats persistido, com títulos gerados por IA e sumarização automática de contexto longo.

### Modo Operador — coanalista autônomo de mercado

O modo operador é a evolução mais recente do Ares: ele deixa de ser reativo e passa a agir proativamente.

**O que acontece ao entrar no modo operador:**

1. O HUD se expande para `1100×680`, renderiza um chart TradingView via `<webview>` (sem bloqueio de CSP).
2. Um drawer de chat flutua sobre o chart pela direita.
3. O `operator-analyst` é iniciado e em 1.5s gera um **snapshot inicial** — leitura do setup atual do chart sem o usuário pedir nada.
4. A partir daí, o analista monitora mudanças de estado do TradingView a cada ciclo e dispara análises quando detecta:
   - Novos `patternHints`, `sequencePatternHints` ou `indicatorSignals`.
   - Flip de direção de candle (bullish ↔ bearish).
   - Mudança de `rangeState` (ex: contracting → expanding = setup de breakout).
   - Notícias quentes chegando (score de impacto ≥ 2).
   - Evento macro a menos de 15 minutos (CPI, NFP, FOMC, etc.).
5. Cada análise gerada é **salva automaticamente** no diário de análises persistido.
6. Se `voiceMode` estiver ativo, alertas proativos são falados via ElevenLabs.

**Pill de notícias** — badge overlay no canto inferior esquerdo do chart com a headline mais recente. Expande para mostrar até 5. Fica âmbar e pulsante quando há notícias de alto impacto (Fed, CPI, crash, earnings, etc.).

**Badge de calendário macro** — aparece na top bar do operador quando um evento de alto impacto está a menos de 30 minutos, com countdown em tempo real.

### Inteligência de mercado

Quatro serviços independentes alimentam o contexto do operador e do tutor:

| Serviço | Fonte | Cadência |
|---|---|---|
| `ticker-service` | Yahoo Finance API | 15s |
| `news-service` | Yahoo Finance RSS | 5min |
| `calendar-service` | ForexFactory JSON | 1h |
| `analysis-store` | Local (userData) | a cada alerta |

O tutor recebe automaticamente blocos de contexto de todos os serviços ativos ao processar uma pergunta sobre mercado — sem o usuário precisar pedir.

### Trade Copilot e paper trading

A fundação de autonomia de mercado está funcional em modo local e simulado:

- O pipeline monta snapshot de mercado, gera proposta com `breakout_v1`, avalia risco e só executa paper após aprovação explícita.
- O paper broker mantém conta, posições e ordens abertas durante a sessão do processo.
- A auditoria de trades é persistida em `userData/trade-audit-records.json`, com cache em memória e limite dos últimos 300 registros.
- A HUD mostra proposta, decisão de risco, guards de notícia/macro, account paper, posições, ordens abertas e trilha recente de auditoria.
- Rejeição manual é registrada como evento auditável `manual_reject`.
- Kill switch local bloqueia execução paper/auto com violação `kill_switch_active`.
- A policy ativa é configurável na HUD para modo, símbolo, timeframe, risco por trade, perda diária e trades por sessão, com reset para default seguro.

Broker real e live trading continuam fora de escopo nesta fase.

### Memória de análises

Cada análise gerada no modo operador é salva em `userData/operator-analyses.json`:

```
{ symbol, timestamp, summary, triggeredBy, price, timeframe }
```

Nas próximas sessões com o mesmo símbolo, as últimas 3 análises são injetadas no prompt:

```
--- Análises anteriores (XAUUSD) ---
[21/04 14:32 4h @ 3250] setup atual mostra...
---
```

O Ares lembra o que viu e pode conectar leituras anteriores com o setup atual.

### Voz bidirecional

- **STT**: Web Speech API (pt-BR) integrada no `HudExpanded` e no drawer do `HudOperator`.
- No operador, voz tem **auto-submit** após 400ms — modo mãos-livres para trading.
- **TTS**: ElevenLabs para respostas do tutor e alertas proativos do operador.
- Controlado pela feature flag `voiceMode` nas configurações.

### Conectores

| Conector | Canal | O que envia |
|---|---|---|
| VS Code | WebSocket `ws://127.0.0.1:42001/connect/vscode` | Arquivo, cursor, seleção, diagnósticos, git, terminal |
| Spotify | OAuth + API | Estado de reprodução, controle de playback |
| TradingView | Bridge local (Electron BrowserView) | Símbolo, timeframe, OHLC, padrões, indicadores, estrutura |

### Provedores de IA

Suporte a múltiplos providers com roteamento por feature e fallback:

- **Anthropic** (Claude Haiku / Sonnet / Opus)
- **OpenAI** (GPT-4.1 / GPT-4.1-mini)
- **Google** (Gemini 2.5 Flash / Flash Lite)
- **Ollama** (modelos locais)
- **Codex** (via OAuth, modelos próprios)

Cada feature (`tutor`, `vision`, `title`, `stage2`, `router`) pode ser roteada para um tier diferente (`strong`, `cheap`, `heuristic`).

### Privacidade

- Modo privado para pausar captura.
- Bloqueio automático de superfícies sensíveis (senhas, dados bancários, etc.).
- Preferência por provider local para conteúdo sensível.
- Limpeza completa de dados locais: memória, diagnósticos, perfil, histórico e configurações.
- Trail de consentimento auditável.
- Proteção de conteúdo da janela HUD para não aparecer em capturas de outros apps.

---

## Arquitetura

### `desktop/src/main/services/` — serviços principais

| Serviço | Responsabilidade |
|---|---|
| `perception.ts` | Pipeline de captura, OCR, visão e snapshot de contexto |
| `tutor.ts` | Orquestração de resposta, streaming, cache, calibração |
| `tutor-prompt.ts` | Montagem do prompt com todos os blocos de contexto |
| `ai-provider.ts` | Cadastro, roteamento e execução dos providers de IA |
| `bridge.ts` | Servidor WebSocket para conectores externos |
| `operator-analyst.ts` | Coanalista autônomo — detecta sinais, gera alertas, salva análises |
| `news-service.ts` | Headlines de mercado via Yahoo Finance RSS |
| `calendar-service.ts` | Calendário macro via ForexFactory (High/Medium impact) |
| `analysis-store.ts` | Diário persistido de análises do modo operador |
| `ticker-service.ts` | Cotação em tempo real via Yahoo Finance API |
| `tradingview.ts` | Bridge com TradingView (BrowserView + observer script) |
| `spotify.ts` | OAuth + controle de playback |
| `memory-card.ts` | Export/import de memória persistida |
| `memory-embeddings.ts` | Embeddings semânticos para recuperação de memória relevante |
| `proactive-engine.ts` | Motor de sugestões proativas baseado em padrões de uso |
| `observability.ts` | Diagnósticos, traces de performance e trail de privacidade |

### `desktop/src/renderer/src/components/HUD/` — UI principal

| Componente | Papel |
|---|---|
| `HUD.tsx` | Orquestrador — gerencia estado, subscriptions e roteamento entre estados |
| `HudShell.tsx` | Container animado com dimensões e cantos por estado |
| `HudExpanded.tsx` | Chat completo com configurações, conectores e ações |
| `HudOperator.tsx` | Modo operador: chart + drawer flutuante + pill de notícias + badge de calendário |
| `HudSidebar.tsx` | Sidebar encaixada nas bordas da tela |
| `HudCompact.tsx` / `HudIntermediate.tsx` | Estados mínimos de presença |
| `MessageBody.tsx` | Renderização de markdown com suporte a streaming |
| `StreamingTimeline.tsx` | Steps visuais durante geração |

---

## Tecnologias

- **Electron 33** com `webviewTag: true` para embeds externos
- **React 18** + **TypeScript 5**
- **Vite** / **Electron Vite**
- **Tailwind CSS** + CSS custom properties para design system
- **Framer Motion** para transições e animações
- **WebSocket** (`ws`) para bridge local
- **Tesseract.js** para OCR
- **ElevenLabs** para TTS
- **Web Speech API** para STT

---

## Como rodar

```bash
cd desktop
npm install
cp .env.example .env
npm run dev
```

Scripts:

- `npm run dev` — desenvolvimento com hot reload
- `npm run build` — build de produção
- `npm run typecheck` — checagem TypeScript
- `npm test` — suíte de testes com `node:test`

### Variáveis de ambiente

- `ELEVENLABS_API_KEY` — habilita TTS via ElevenLabs

Outras integrações são configuradas em runtime nas preferências do app (providers de IA, Spotify Client ID, ticker symbol, etc.).

### Extensão VS Code

```bash
cd packages/connector-vscode
npm install
npm run package   # gera ares-connector.vsix
```

O app desktop instala o VSIX automaticamente quando detecta o pacote gerado.

---

## Estado atual

O projeto está em desenvolvimento ativo. O núcleo do tutor, percepção e conectores está estável. O **modo operador** — com coanalista autônomo, diário de análises, notícias quentes e calendário macro — é o desenvolvimento mais recente e está funcional.

```
desktop/src/main/services/
├── operator-analyst.ts   ← coanalista autônomo
├── news-service.ts       ← headlines em tempo real
├── calendar-service.ts   ← eventos macro
└── analysis-store.ts     ← diário persistido
```
