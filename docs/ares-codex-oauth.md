# Ares Codex OAuth

## Objetivo

O Codex OAuth permite que o Ares use a sessao autenticada da conta ChatGPT do usuario para chamadas de texto, geracao de titulos e refinamentos internos, sem exigir API key da OpenAI para esses fluxos.

Hoje ele e usado principalmente para:

- chat do tutor quando o roteamento escolhe Codex
- geracao automatica de titulos de conversa
- refinamento assincorno do pensamento do stage 2
- classificadores leves, como alguns fallbacks locais

## Arquitetura atual

Arquivos principais:

- `desktop/src/main/auth/CodexAuthManager.ts`
- `desktop/src/main/auth/CodexClient.ts`
- `desktop/src/main/auth/LocalCallbackServer.ts`
- `desktop/src/main/auth/pkce.ts`
- `desktop/src/main/auth/codex-singleton.ts`
- `desktop/src/preload/index.ts`

### Fluxo de autenticacao

O login usa OAuth 2.0 com PKCE.

Configuracao atual:

```txt
Client ID:    app_EMoamEEZ73f0CkXaXp7hrann
Auth URL:     https://auth.openai.com/oauth/authorize
Token URL:    https://auth.openai.com/oauth/token
Redirect URI: http://localhost:1455/auth/callback
Scopes:       openid profile email offline_access
```

Fluxo:

1. o main gera `code_verifier`, `code_challenge` e `state`
2. o app abre o browser do sistema para o login
3. um callback server local espera o retorno em `localhost:1455`
4. o main troca o `code` por `access_token`, `refresh_token` e `id_token`
5. os tokens sao persistidos localmente

### Persistencia

O token fica salvo em:

```txt
app.getPath('userData')/codex-auth.json
```

Esse arquivo nao faz parte do repositorio.

### Refresh

`CodexAuthManager` renova a sessao automaticamente quando o token esta perto de expirar. Se o refresh falhar, a sessao e invalidada e o usuario precisa autenticar de novo.

## Cliente HTTP

`CodexClient` encapsula as chamadas para o backend web autenticado do ChatGPT.

Endpoints usados hoje:

```txt
Texto:  https://chatgpt.com/backend-api/codex/responses
Visao:  https://chatgpt.com/backend-api/responses
```

Comportamento atual:

- lista modelos disponiveis da conta quando necessario
- faz cache do modelo selecionado
- suporta chamadas com e sem imagem
- consome SSE e monta o texto final no main

Modelos de fallback conhecidos no cliente:

- `codex-mini-latest`
- `o4-mini`
- `o3-mini`
- `gpt-4.1-mini`

## Superficie IPC e preload

O preload expoe:

```ts
window.codexAuthAPI.login()
window.codexAuthAPI.logout()
window.codexAuthAPI.getStatus()
window.codexAuthAPI.chat(options)
```

Status compartilhado:

```ts
interface AuthStatus {
  authenticated: boolean
  email?: string
  planType?: string
  expiresAt?: number
}
```

## Onde a UI usa isso

Hoje a UI principal de autenticacao fica no HUD expandido, em `desktop/src/renderer/src/components/HUD/HudExpanded.tsx`.

Ela permite:

- iniciar login
- ver email e plano
- desconectar

## Onde o app usa Codex

### Tutor principal

O tutor pode usar Codex quando o roteamento do provedor escolhe esse caminho. Nesse caso o `CodexClient` recebe o prompt final montado pelo tutor e pode receber screenshot quando houver contexto visual.

### Titulos de conversa

`chat:generate-title` usa o contexto inicial da conversa para gerar um titulo curto e especifico. O fluxo tenta usar Codex quando a sessao OAuth esta autenticada.

### Pensamento do stage 2

O pensamento heuristico do stage 2 aparece imediatamente. Em paralelo, um refinamento curto via Codex pode substituir o texto se a resposta chegar rapido e ainda corresponder ao snapshot atual.

### Classificacao leve

Alguns roteadores locais usam Codex mini como fallback barato quando o parser deterministico nao consegue classificar a intencao com seguranca.

## Diferenca para API key

Codex OAuth e API key convivem no app, mas servem papeis diferentes.

### Codex OAuth

- usa a conta autenticada do ChatGPT do usuario
- bom para chat, titulos e refinamento de texto
- nao exige que o usuario cole uma OpenAI API key

### API key

- continua relevante para providers dedicados
- cobre cenarios fora do Codex
- pode ser usada para visao, embeddings e fallback dependendo da configuracao

## Limitacoes atuais

- o endpoint de visao do backend web nao se comporta exatamente como o endpoint de texto
- disponibilidade de modelos depende da conta do usuario
- limites de uso seguem a sessao web do ChatGPT, nao a politica de API paga
- nao e uma integracao multiusuario nem um backend distribuido

## Arquivos envolvidos

### Main

- `desktop/src/main/auth/CodexAuthManager.ts`
- `desktop/src/main/auth/CodexClient.ts`
- `desktop/src/main/auth/LocalCallbackServer.ts`
- `desktop/src/main/auth/pkce.ts`
- `desktop/src/main/auth/codex-singleton.ts`
- `desktop/src/main/index.ts`

### Shared

- `desktop/src/shared/auth.types.ts`

### Renderer

- `desktop/src/preload/index.ts`
- `desktop/src/preload/index.d.ts`
- `desktop/src/renderer/src/components/HUD/HudExpanded.tsx`

## Notas operacionais

- o login sempre limpa o token anterior antes de solicitar uma nova sessao
- o callback local valida `state`
- os tokens ficam fora do projeto
- o cliente faz descoberta de modelos quando ainda nao conhece o melhor modelo da conta

## Estado atual do doc

Este documento descreve a implementacao real atual. Ele substitui o plano antigo que listava arquivos a criar e componentes que ja nao existem mais.
