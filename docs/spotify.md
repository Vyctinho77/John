# Spotify

## Visao geral

A integracao com Spotify no Ares faz duas coisas:

- mantem estado de playback ao vivo no main process
- executa comandos locais de controle e reproducao sem depender do tutor geral quando a intencao e clara

Ela foi desenhada para baixa latencia e para evitar respostas falsas do LLM dizendo que uma acao foi executada quando nada aconteceu.

## Arquivos principais

- `desktop/src/main/services/spotify.ts`
- `desktop/src/main/services/spotify-command-router.ts`
- `desktop/src/shared/perception.types.ts`
- `desktop/src/preload/index.ts`
- `desktop/src/renderer/src/components/HUD/HUD.tsx`
- `desktop/src/renderer/src/components/HUD/HudExpanded.tsx`

## Autenticacao

O Spotify usa OAuth com PKCE direto no main process.

Configuracao atual:

```txt
Redirect URI: http://127.0.0.1:42002/callback
Callback port: 42002
Scopes: user-read-playback-state user-modify-playback-state
```

O fluxo:

1. o usuario salva `spotifyClientId` nas preferencias
2. o HUD chama `spotify:start-auth`
3. o main abre a autorizacao do Spotify no browser
4. o callback local recebe o `code`
5. o main troca por tokens e persiste em `ares-spotify-tokens.json`

Os tokens ficam em:

```txt
app.getPath('userData')/ares-spotify-tokens.json
```

## Estado mantido pelo serviço

`SpotifyService` mantem polling de playback state com dois ritmos:

- mais rapido quando esta tocando
- mais lento quando esta pausado

Estado atual:

```ts
interface SpotifyPlaybackState {
  isPlaying: boolean
  trackName: string | null
  artistName: string | null
  albumName: string | null
  albumArtUrl: string | null
  progressMs: number
  durationMs: number
  shuffle: boolean
  repeat: 'off' | 'track' | 'context'
  deviceName: string | null
  volumePercent: number | null
}
```

Esse estado e:

- enviado para a HUD via `spotify:state-update`
- injetado no bridge como conector interno
- usado pelo tutor para compor contexto e follow-ups

## Busca e reproducao

O servico tambem faz busca no catalogo do Spotify e resolve requests de playback.

Suporta:

- `track`
- `artist`
- `album`
- `playlist`

Regras principais:

- ranking local por match exato, prefixo, contains e popularidade
- cache curto em memoria para buscas repetidas
- execucao direta quando ha um candidato claramente dominante
- retorno de top 3 quando a busca e ambigua

## Roteador local de comandos

`spotify-command-router.ts` roda antes do tutor geral.

Ele combina:

- parser deterministico em PT-BR
- fallback leve por LLM para intents menos estruturadas

Intents atuais:

- `play_query`
- `resume`
- `pause`
- `toggle`
- `next`
- `previous`
- `what_is_playing`

Exemplos de comandos reconhecidos:

- `proxima`
- `pula essa`
- `muda a musica`
- `troca de musica`
- `pausa`
- `continua`
- `o que ta tocando?`
- `toca fix you`
- `toca o album random access memories`
- `abre uma playlist de lo-fi`

Se o pedido for claramente de Spotify, o router tenta resolver localmente. So cai para o tutor geral quando a intencao nao e convincente.

## Acoes estruturadas

O fluxo tambem suporta `TutorResponse.actions`.

Payload usado:

```ts
type SpotifyActionPayload = {
  action: 'play_uri' | 'resume' | 'pause' | 'next' | 'prev' | 'report_state'
  uri?: string
  entityType?: 'track' | 'artist' | 'album' | 'playlist'
  query?: string
}
```

Resultado:

```ts
type SpotifyCommandResult = {
  ok: boolean
  message: string
  state: SpotifyPlaybackState | null
  errorCode?: 'not_authenticated' | 'no_active_device' | 'forbidden' | 'rate_limited' | 'not_found' | 'invalid_action' | 'unknown'
}
```

Isso permite:

- chips de acao inline no chat
- desambiguacao de top 3 resultados
- execucao direta por IPC sem uma nova rodada do tutor

## Superficie preload

O preload expoe:

```ts
window.spotifyAPI.startAuth()
window.spotifyAPI.getState()
window.spotifyAPI.togglePlay()
window.spotifyAPI.next()
window.spotifyAPI.prev()
window.spotifyAPI.setVolume(v)
window.spotifyAPI.setShuffle(s)
window.spotifyAPI.setRepeat(s)
window.spotifyAPI.executeAction(payload)
window.spotifyAPI.disconnect()
window.spotifyAPI.onStateUpdate(cb)
```

## UI atual

### Biblioteca

`HudExpanded.tsx` mostra:

- faixa, artista e album
- capa
- progresso
- botoes de controle
- shuffle e repeat
- conexao/desconexao

### Chat

`HUD.tsx` renderiza chips de acao quando a resposta local do Spotify pede escolha do usuario.

Fluxo:

1. usuario pede algo como `toca [nome]`
2. o roteador resolve localmente
3. se houver mais de uma opcao forte, a resposta volta com `actions`
4. o clique chama `window.spotifyAPI.executeAction(...)`
5. a resposta de sucesso ou erro entra no chat sem streaming artificial

## Erros tratados

O serviço diferencia:

- nao autenticado
- sem dispositivo ativo
- acao proibida pela conta ou dispositivo
- rate limit
- nenhuma correspondencia forte
- payload invalido

Mensagens sao convertidas para respostas curtas e acionaveis no tutor local.

## Limitacoes atuais

- nao gerencia biblioteca pessoal do usuario
- nao cria playlist
- nao mexe em likes
- depende de um device ativo do Spotify para playback
- nao faz controle fora do que a Web API permite

## Resumo

Hoje a integracao do Spotify no Ares ja e conversacional, local e de baixa latencia. O LLM entra como apoio de classificacao quando necessario, mas a execucao real continua acontecendo no main process.
