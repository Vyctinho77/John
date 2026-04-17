# Arquitetura John

## Visao geral

O John e um app Electron com HUD residente que combina quatro fontes de contexto:

- conectores estruturados ao vivo, como `vscode`, `spotify` e `tradingview`
- screenshot da tela atual
- OCR local
- memoria curta de contexto recente

O principio central da arquitetura atual e simples:

- conectores estruturados vencem inferencia vaga
- visao e OCR complementam o que o conector nao sabe
- memoria ajuda continuidade, mas nao pode dominar quando a tela mudou

O app roda quase todo dentro do cliente desktop. Nao existe hoje um backend proprio separado como parte obrigatoria da arquitetura principal.

## Objetivo do sistema

O sistema precisa fazer quatro coisas bem:

1. perceber o contexto atual da tela com pouca latencia
2. responder como tutor contextual, nao so como chatbot
3. executar acoes locais reais quando a intencao for clara
4. controlar custo e privacidade com roteamento inteligente

## Camadas atuais

### 1. Shell desktop

Responsavel por:

- janela do HUD
- estados compacto, intermediario e expandido
- drag, resize e persistencia de posicao
- atalhos e foco
- BrowserWindows auxiliares, como TradingView

Arquivos principais:

- `desktop/src/main/index.ts`
- `desktop/src/main/services/window-settings.ts`
- `desktop/src/renderer/src/components/HUD/*`

### 2. Percepcao

Responsavel por:

- captura de tela
- OCR local
- tracking de mudancas visuais
- estado perceptivo compartilhado com o tutor

Arquivos principais:

- `desktop/src/main/services/capture.ts`
- `desktop/src/main/services/ocr.ts`
- `desktop/src/main/services/perception.ts`
- `desktop/src/shared/perception.types.ts`

### 3. Conectores e bridge

Responsavel por:

- receber contexto externo do VS Code via WebSocket
- injetar estado interno de Spotify e TradingView
- consolidar status de conectores para HUD e tutor
- expor mensagens de erro e resiliencia do bridge

Arquivos principais:

- `desktop/src/main/services/bridge.ts`
- `packages/connector-vscode/*`
- `desktop/src/main/services/spotify.ts`
- `desktop/src/main/services/tradingview.ts`

### 4. Orquestracao local

Responsavel por:

- interceptar intents claras antes do LLM
- acionar comandos locais de Spotify e TradingView
- decidir quando usar heuristica, modelo barato ou modelo principal

Arquivos principais:

- `desktop/src/main/services/spotify-command-router.ts`
- `desktop/src/main/services/tradingview-command-router.ts`
- `desktop/src/main/services/proactive-engine.ts`
- `desktop/src/main/services/intermediate-thought.ts`

### 5. Tutor

Responsavel por:

- montar o prompt final
- compor screenshot, OCR e contexto dos conectores
- escolher provider e modelo
- gerar resposta, titulos e refinamentos

Arquivos principais:

- `desktop/src/main/services/tutor.ts`
- `desktop/src/main/services/tutor-prompt.ts`
- `desktop/src/main/services/tutor-domains.ts`
- `desktop/src/main/services/ai-provider.ts`
- `desktop/src/main/auth/CodexClient.ts`

### 6. Contratos compartilhados

Responsavel por:

- tipos de percepcao, bridge, acoes locais, respostas do tutor e settings
- contrato entre `main`, `preload` e `renderer`

Arquivo principal:

- `desktop/src/shared/perception.types.ts`

## Regra de precedencia de contexto

Hoje a regra correta para evolucao do sistema e esta:

1. `TradingView`, `VS Code` e `Spotify` via bridge
2. visao multimodal com screenshot
3. OCR local
4. memoria curta e historico recente

Implicacoes:

- se o conector disser `BTCUSDT 15m`, o tutor nao deve preferir um chute visual diferente
- se a tela mudou fortemente, memoria recente precisa perder peso
- se nao houver conector, visao e OCR sobem de prioridade

## Fluxo principal de resposta

1. `perception.ts` atualiza screenshot, OCR e sinais de mudanca
2. `bridge.ts` mantem o ultimo estado dos conectores
3. `index.ts` recebe `tutor:respond`
4. roteadores locais tentam resolver Spotify ou TradingView sem LLM
5. se nao resolver localmente, `tutor.ts` monta o contexto final
6. `tutor-prompt.ts` injeta blocos como `VS Code (live connector)` e `TradingView (live connector)`
7. o provider escolhido responde
8. a HUD renderiza texto, acoes inline e estados de processamento

## Fluxo de acoes locais

As acoes locais existem para evitar dois problemas:

- custo desnecessario
- resposta fingindo que executou algo

Hoje isso ja vale para:

- Spotify
- TradingView

Padrao:

1. parser local rapido tenta classificar a intencao
2. se necessario, um fallback leve por LLM pode estruturar a intencao
3. o main executa a acao real
4. a HUD recebe um `TutorResponse` local, sem streaming artificial

## Estado e persistencia

Persistencia local atual:

- settings do app
- posicao do HUD
- sessao OAuth do Codex
- tokens do Spotify
- sessao isolada do TradingView
- historico de chats

Arquivos relevantes:

- `desktop/src/main/services/settings.ts`
- `desktop/src/main/auth/*`
- `desktop/src/main/services/chat-store.ts`

## Observabilidade atual

Ja existe base para resiliencia, mas ainda falta observabilidade de produto mais fina.

Hoje ja temos:

- logs de provider/modelo em caminhos criticos
- feedback de erro do bridge quando a porta `42001` esta ocupada
- cooldown adaptativo de proactive hints
- `TutorResponse.debug` com envelope por resposta
- badge discreto de origem dominante na HUD
- fresh-screen guard quando a tela mudou forte ou o frame ficou velho

Ainda falta consolidar:

- confidence por fonte mais refinada
- watchdog de contexto velho mais agressivo na percepcao
- exposicao opcional de diagnostico mais profundo para debug

## Direcao tecnica recomendada

Os proximos ganhos grandes do John estao em quatro frentes:

1. observabilidade e confianca por fonte
2. TradingView mais preciso
3. acoes inline e UX contextual mais consistentes
4. roteamento de custo por feature

Essa ordem vem antes de qualquer refactor maior porque melhora ao mesmo tempo:

- confiabilidade perceptiva
- velocidade de debug
- custo operacional
- previsibilidade da experiencia

## Decisoes de arquitetura em vigor

- manter o app orientado a cliente desktop
- tratar conectores estruturados como fonte preferencial
- usar LLM forte apenas quando o ganho compensar custo e latencia
- resolver comandos claros localmente antes do tutor geral
- documentar cada integracao separadamente em `docs/`

## Docs relacionados

- `docs/Biblioteca.md`
- `docs/vscode.md`
- `docs/spotify.md`
- `docs/tradingview.md`
- `docs/john-codex-oauth.md`
- `docs/roadmap.md`
