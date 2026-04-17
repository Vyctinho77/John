# Biblioteca

## Visao geral

A Biblioteca e a area do HUD que expoe conectores e integrações ao vivo do John. Hoje ela nao e um monorepo de conectores separados. Ela e uma superficie do app Electron que mostra o estado real de integracoes implementadas no processo main.

No momento, a Biblioteca concentra:

- status do bridge com apps externos
- controles e estado do Spotify
- abertura e estado do TradingView
- status do Codex OAuth

Os conectores ativos hoje sao:

- `vscode`
- `spotify`
- `tradingview`

## Arquitetura atual

### Bridge central

O bridge roda no main process e centraliza contexto dos conectores em `desktop/src/main/services/bridge.ts`.

Ele mantem:

- conexoes WebSocket para conectores externos, como VS Code
- contexto injetado por conectores internos, como Spotify e TradingView
- status consolidado para o renderer via IPC

Porta usada:

- `ws://127.0.0.1:42001`

Formato base de contexto:

```ts
interface ConnectorContext {
  app: 'vscode' | 'spotify' | 'tradingview'
  priority: string
  state: string
  data: unknown
  timestamp: number
  sessionId: string
}
```

### Conectores externos x internos

#### VS Code

`vscode` e um conector externo. Ele se conecta ao bridge por WebSocket e publica contexto do editor, diagnosticos, git e terminal.

#### Spotify

`spotify` e um conector interno. O estado e injetado no bridge pelo main process depois da autenticacao OAuth e do polling de playback state.

#### TradingView

`tradingview` e um conector interno. O app abre o site oficial do TradingView em uma `BrowserWindow` dedicada e observa o `BrowserView` para extrair estado do grafico.

## Tipos compartilhados

Os tipos compartilhados vivem em `desktop/src/shared/perception.types.ts`.

Campos relevantes:

- `ConnectorID`
- `ConnectorStatus`
- `SpotifyActionPayload`
- `SpotifyCommandResult`
- `TradingViewConnectorState`
- `TutorAction`
- `TutorResponse.actions`

Isso permite que o John:

- responda a partir do estado dos conectores
- execute acoes locais sem passar pelo fluxo normal do tutor
- mostre chips de acao na HUD

## Exposicao para o renderer

O preload expoe tres APIs importantes em `desktop/src/preload/index.ts`:

```ts
window.bridgeAPI
window.spotifyAPI
window.tradingViewAPI
window.codexAuthAPI
```

Essas APIs sao consumidas principalmente em:

- `desktop/src/renderer/src/components/HUD/HudExpanded.tsx`
- `desktop/src/renderer/src/components/HUD/HUD.tsx`

## Biblioteca na HUD

A Biblioteca no HUD expandido mostra cards de integracao com estado em tempo real.

### Spotify

Exibe:

- conectado ou nao
- faixa atual
- artista
- album
- progresso
- shuffle e repeat
- dispositivo ativo

Tambem oferece:

- conectar
- desconectar
- play/pause
- proxima
- anterior
- volume
- shuffle
- repeat

### TradingView

Exibe:

- aberto ou fechado
- simbolo atual
- timeframe
- preco atual
- variacao
- leitura resumida da candle atual ou da candle sob o mouse

Tambem oferece:

- abrir o TradingView no app
- fechar a janela do TradingView

### Codex OAuth

Exibe:

- autenticado ou nao
- email
- tipo de plano
- validade da sessao

## Como o tutor usa a Biblioteca

O tutor nao le a Biblioteca visualmente. Ele consome o contexto dos conectores no main process.

Fluxo:

1. o bridge mantem o ultimo estado de cada conector
2. `tutor.ts` consulta `bridgeServer.getContext(...)`
3. `tutor-prompt.ts` formata blocos como `VS Code (live connector)`, `Spotify (live connector)` e `TradingView (live connector)`
4. o prompt final prioriza esses dados estruturados sobre leitura vaga da screenshot

Regra importante:

- dados estruturados do conector vencem inferencia visual para campos explicitos
- visao e OCR entram como complemento

## Acoes locais

Spotify e TradingView ja possuem roteadores locais de comandos.

### Spotify

O roteador em `desktop/src/main/services/spotify-command-router.ts` intercepta pedidos como:

- `proxima`
- `pausa`
- `continua`
- `toca [nome]`
- `muda a musica`

Quando a intencao e clara:

- o comando e executado localmente
- o tutor nao inventa que executou
- a HUD pode renderizar `actions` clicaveis

### TradingView

O roteador em `desktop/src/main/services/tradingview-command-router.ts` intercepta pedidos como:

- `abre BTCUSDT`
- `abre BTCUSDT em 15m`
- `muda para 1h`
- `resume o grafico`
- `le essa vela`

## Limitacoes atuais

- a Biblioteca depende do estado real dos conectores; ela nao simula integracoes ausentes
- `spotify` controla playback, mas nao gerencia biblioteca pessoal nem playlists do usuario
- `tradingview` e read-only com navegacao leve; ele nao envia ordens nem interage com corretora
- `vscode` continua dependendo do conector externo estar instalado e conectado

## Proximos docs relacionados

- `docs/arquitetura.md`
- `docs/roadmap.md`
- `docs/john-codex-oauth.md`
- `docs/vscode.md`
- `docs/spotify.md`
- `docs/tradingview.md`
