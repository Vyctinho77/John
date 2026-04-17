# VS Code

## Visao geral

O conector do VS Code e a integracao externa mais madura do John. Ele roda como extensao dentro do editor, se conecta ao bridge local do app por WebSocket e publica contexto estruturado do workspace e do ponto atual de edicao.

Hoje ele alimenta principalmente:

- leitura de arquivo e linguagem atual
- cursor e trecho ao redor
- diagnosticos do arquivo aberto
- estado basico de git
- ultimo buffer do terminal

Esse contexto entra no prompt do tutor como `VS Code (live connector)` e melhora bastante explicacao de codigo, leitura de erro e pareamento.

## Arquivos principais

### No app Electron

- `desktop/src/main/services/bridge.ts`
- `desktop/src/main/index.ts`
- `desktop/src/main/services/tutor.ts`
- `desktop/src/main/services/tutor-prompt.ts`
- `desktop/src/preload/index.ts`
- `desktop/src/renderer/src/components/HUD/HudExpanded.tsx`

### Na extensao VS Code

- `packages/connector-vscode/package.json`
- `packages/connector-vscode/src/extension.ts`
- `packages/connector-vscode/src/VSCodeConnector.ts`
- `packages/connector-vscode/src/collectors/EditorCollector.ts`
- `packages/connector-vscode/src/collectors/DiagnosticsCollector.ts`
- `packages/connector-vscode/src/collectors/GitCollector.ts`
- `packages/connector-vscode/src/collectors/TerminalCollector.ts`

## Instalacao

O app instala a extensao a partir de um VSIX empacotado no proprio repositorio.

Arquivo:

```txt
packages/connector-vscode/john-connector.vsix
```

Fluxo atual no main:

1. o usuario clica em conectar no card do VS Code na Biblioteca
2. o app verifica se a extensao ja esta instalada
3. se nao estiver, tenta instalar o VSIX usando o executavel do VS Code
4. o usuario recarrega a janela do VS Code
5. a extensao sobe, conecta no bridge e passa a publicar contexto

Handler IPC:

```txt
bridge:install-vscode-connector
```

Busca de executavel no Windows:

- VS Code estavel
- VS Code Insiders

Hoje o fluxo foi pensado principalmente para Windows.

## Bridge e conexao

O bridge do app escuta em:

```txt
ws://127.0.0.1:42001/connect/vscode
```

A extensao usa esse endpoint fixo em `VSCodeConnector.ts`.

Comportamento:

- conecta automaticamente no startup do VS Code
- reconecta sozinho se o socket cair
- faz debounce de atualizacao em `300ms`
- limpa listeners ao desconectar

O `sessionId` enviado usa `vscode.env.sessionId`.

## Comandos da extensao

A extensao registra dois comandos:

- `john.connect`
- `john.disconnect`

Eles servem para reconectar ou desligar manualmente o conector sem depender da UI do John.

## O que a extensao coleta

## Editor

`EditorCollector` publica:

```ts
{
  filename: string
  filepath: string
  language: string
  cursorLine: number
  selectedText: string | null
  visibleRange: { start: number; end: number }
  surroundingCode: string
}
```

Detalhes:

- usa o editor ativo
- manda o nome e caminho completo do arquivo
- manda a linguagem do documento
- manda a linha atual do cursor
- manda a selecao atual, se houver
- manda um recorte de codigo de aproximadamente `+-20` linhas ao redor do cursor

Esse recorte e o insumo mais importante para o John responder sobre o ponto exato do codigo.

## Diagnosticos

`DiagnosticsCollector` publica os diagnosticos do arquivo atualmente aberto.

Campos:

```ts
{
  hasErrors: boolean
  errorCount: number
  items: Array<{
    message: string
    severity: number
    line: number
    source?: string
  }>
}
```

Hoje ele:

- olha apenas o documento ativo
- conta erros
- corta a lista em ate 10 itens

## Git

`GitCollector` tenta usar a extensao oficial `vscode.git` e extrai o primeiro repositorio ativo.

Campos:

```ts
{
  branch: string | undefined
  ahead: number
  behind: number
  changedFiles: number
  stagedFiles: number
}
```

Se o Git nao estiver ativo ou o repo nao estiver acessivel, ele retorna `null`.

## Terminal

`TerminalCollector` observa `onDidWriteTerminalData`.

Ele:

- remove ANSI escape codes
- guarda um buffer curto em memoria
- publica os ultimos `2000` caracteres
- informa o nome do terminal ativo

Formato:

```ts
{
  lastOutput: string
  activeTerminalName: string | null
}
```

## Payload enviado para o John

O conector envia um `AppContext` com:

```ts
{
  app: 'vscode'
  priority: 'low' | 'medium' | 'high'
  state: string
  data: {
    editor
    diagnostics
    git
    terminal
  }
  timestamp: number
  sessionId: string
}
```

A prioridade atual sobe para `high` quando ha erros no arquivo aberto.

Exemplo de `state`:

- `sem arquivo aberto`
- `editando foo.ts (typescript)`
- `editando foo.ts com 3 erro(s)`

## Como o tutor usa isso

No main, `tutor.ts` consulta:

```ts
bridgeServer.getContext('vscode')
```

Depois `tutor-prompt.ts` formata esse contexto num bloco proprio.

Esse bloco inclui:

- arquivo atual
- linguagem
- linha do cursor
- selecao
- branch e mudancas de git
- erros visiveis
- trecho de codigo ao redor do cursor
- ultimo output do terminal

O prompt tambem injeta um `CodeVoice` proprio quando a superficie detectada e codigo. Isso faz o John:

- falar como par de programacao
- referenciar linha, funcao e variavel de forma concreta
- ler erro antes de dar teoria
- evitar conselho generico quando o trecho visivel ja mostra o problema

## Acoes inline locais

O VS Code agora tambem participa do fluxo de `TutorResponse.actions`.

Isso permite que a HUD mostre chips clicaveis sem depender do tutor remoto para "fingir" uma acao.

Acoes locais atuais:

- `Resumir VS Code`
- `Ler codigo atual`
- `Explicar erro`
- `Revisar diff`
- `Ler terminal`

Fluxo:

1. o `vscode-command-router.ts` intercepta pedidos claros como `explica esse erro` ou `olha o terminal`
2. ele usa apenas o contexto atual do bridge
3. devolve uma resposta local com `actions`
4. a HUD executa essas actions via `window.vscodeAPI.executeAction(...)`
5. a resposta volta direto para o chat, sem nova rodada do tutor

Mesmo quando o pedido vai para o tutor principal, respostas de dominio `code` com contexto do VS Code podem receber essas actions como follow-up local.

## UI atual

Na Biblioteca, o card do VS Code permite:

- instalar a extensao
- conectar
- desconectar

Estados usados na HUD:

- instalando
- aguardando reload do VS Code
- conectado
- desconectado

Quando o conector entra, o HUD recebe `bridge:status-update` e atualiza o card.

## Limites atuais

- o conector olha principalmente o editor ativo, nao o workspace inteiro
- o Git usa apenas o primeiro repositorio retornado pela API
- o terminal e um buffer curto, nao um historico completo
- nao existe execucao remota de edicao de codigo pelo John nesse conector
- a unica acao recebida hoje pela extensao e `openFile`

## Build e empacotamento

Scripts da extensao:

```txt
npm run build
npm run watch
npm run package
```

O `package` gera:

```txt
packages/connector-vscode/john-connector.vsix
```

Esse artefato e o que o app instala quando o usuario conecta o VS Code pela Biblioteca.

## Resumo

Hoje o VS Code e o conector que mais da contexto estrutural para o John.

Ele ja entrega o bastante para:

- explicar o trecho sob o cursor
- ler erros do arquivo ativo
- usar output recente do terminal
- enxergar branch e mudancas locais

Sem depender apenas de screenshot ou OCR do editor.
