# Token Optimization

## Contexto

O John faz chamadas LLM contínuas em background — Vision a cada frame capturado, Global Intent após cada análise semântica, e Tutor por demanda. Sem otimização, o custo estimado chegava a:

| Serviço        | Tokens/dia (estimativa) | Característica                        |
|----------------|------------------------|---------------------------------------|
| Vision         | 3.9M – 9.4M            | System prompt ~2500 tokens, fixo      |
| Global Intent  | 1.8M – 5.0M            | System prompt grande, semi-fixo       |
| Tutor          | 275K – 1.8M            | System prompt com perfil do usuário   |

---

## 1. Anthropic Prompt Caching

**Status: implementado** — `src/main/services/ai-provider.ts`

### O que foi feito

Todas as chamadas Anthropic (streaming e não-streaming) agora enviam o system prompt como bloco cacheável:

```typescript
system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }]
```

E incluem o header de beta:

```typescript
'anthropic-beta': 'prompt-caching-2024-07-31'
```

Funções afetadas: `streamAnthropicChat`, `sendAnthropicChat`.

### Como funciona

Na primeira chamada dentro de uma janela de 5 minutos, a Anthropic armazena o system prompt no cache. Nas chamadas subsequentes com o mesmo prompt, retorna `cache_read_input_tokens` no `usage` — cobrado a 10% do preço normal de input.

- Cache write: 125% do preço de input (custo único a cada 5 min)
- Cache read: 10% do preço de input (todas as chamadas seguintes)

Para o Vision especificamente, onde o system prompt é uma constante de ~2500 tokens e as chamadas chegam a cada poucos segundos, o ganho real em regime de uso contínuo é de ~85–90% no custo do system prompt.

### Registro de custo

Antes desta mudança, chamadas Anthropic não registravam custo nenhum. Agora `recordAICost` é chamado com:

- `inputTokens` — tokens de input da chamada
- `cachedInputTokens` — `cache_read_input_tokens` da resposta (já pago a 10%)
- `outputTokens` — tokens de output
- `costUsd` — calculado por `calculateAnthropicTextCost`

### Precificação implementada (`calculateAnthropicTextCost`)

| Modelo  | Input /1M | Cache write /1M | Cache read /1M | Output /1M |
|---------|-----------|-----------------|----------------|------------|
| Opus    | $5.00     | $6.25           | $0.50          | $25.00     |
| Sonnet  | $3.00     | $3.75           | $0.30          | $15.00     |
| Haiku   | $1.00     | $1.25           | $0.10          | $5.00      |

---

## 2. Próximas otimizações (pendentes)

### 2a. Frame deduplication — Vision e Global Intent

**Status: implementado (versão 1)** — `src/main/services/vision-analyzer.ts`

Pular a chamada LLM quando o hash do frame capturado é idêntico ao anterior. A percepção já captura o frame; basta comparar um hash leve (ex: MD5 do dataUrl truncado) antes de disparar `analyzeScreenWithVision`.

Impacto estimado: –40–60% nas chamadas de Vision em sessões com tela estática (leitura, terminal parado).

O que entrou na prática:

- reaproveitamento da última análise de Vision quando o frame efetivamente permanece igual
- registro de `vision_dedup_hit` em diagnósticos
- atribuição correta da feature `vision` para custo e telemetria

Pendência:

- trocar o cache atual por uma deduplicação mais robusta e observável baseada em fingerprint explícita de frame
- estender a mesma lógica para outros pontos do pipeline além do Vision

### 2b. Global Intent — LLM apenas em mudanças reais de contexto

**Status: implementado (versão 1)** — `src/main/services/global-intent.ts`

`resolveGlobalIntent` chama o classificador LLM a cada ciclo. Poderia ser suprimido quando `change_summary === 'none'` e o modo atual tem alta estabilidade (`stabilityState === 'stable'`), usando apenas o heurístico.

Impacto estimado: –50–70% nas chamadas de Global Intent.

O que entrou na prática:

- skip do classificador remoto quando a sessão está estável, sem app switch, sem modo operador explícito e o heurístico confirma o mesmo modo
- registro de `global_intent_llm_skipped`

---

## 3. OpenAI — aumentar cache hit de verdade

O código atual já registra `usage.prompt_tokens_details.cached_tokens` nas chamadas OpenAI. Isso é importante porque mostra que o app já enxerga cache hit do lado da OpenAI, mas ainda não está estruturando as requests para maximizar esse ganho.

### 3a. Prefixo estável e canônico

**Status: implementado (parcial)** — `src/main/services/tutor-prompt.ts`

Na OpenAI, prompt caching acontece automaticamente quando o prefixo da request é idêntico e o prompt passa de 1024 tokens. Então a otimização principal não é "ligar um recurso", e sim impedir que o prefixo estático seja quebrado.

Aplicação prática:

- manter instruções fixas sempre no início
- colocar exemplos, schemas e tool definitions estáveis antes do contexto variável
- deixar OCR, estado da tela, memória, histórico e input do usuário no final
- remover timestamps, ids aleatórios, contadores e debug strings dos blocos estáticos

Impacto esperado:

- mais `cached_tokens`
- menor latência em fluxos repetitivos
- menos variação de custo entre chamadas equivalentes

O que entrou na prática:

- `buildRemoteSystemPrompt` foi separado em blocos explícitos como `STATIC_CORE` e `DYNAMIC_CONTEXT`
- `buildRemoteUserPrompt` foi reestruturado em blocos estáveis como `REQUEST`, `SCREEN_CONTEXT`, `SESSION_CONTEXT`, `CONNECTORS` e `RESPONSE_CONTRACT`

Pendência:

- aplicar a mesma disciplina de blocos estáveis em outros fluxos além do tutor

### 3b. `prompt_cache_key`

**Status: implementado** — `src/main/services/ai-provider.ts`

As docs da OpenAI recomendam usar `prompt_cache_key` para melhorar o roteamento quando várias requests compartilham o mesmo prefixo longo.

Estratégia sugerida por feature:

- `vision:{surface}:{promptVersion}`
- `intent:{mode}:{promptVersion}`
- `tutor:{domain}:{responseMode}:{promptVersion}`

Isso precisa ser estável o suficiente para agrupar requests parecidas, sem misturar famílias de prompt diferentes.

O que entrou na prática:

- `prompt_cache_key` nas chamadas OpenAI de `chat/completions`
- chave derivada de `feature + model + image/text + hashes do início de system/history/prompt`
- registro da chave aplicada em `usage_recorded`

### 3c. `prompt_cache_retention`

**Status: implementado** — `src/main/services/ai-provider.ts`

Nos modelos suportados, vale testar `prompt_cache_retention: "24h"` em fluxos quentes.

Melhores candidatos:

- Vision com prompt estrutural fixo
- Tutor em sessões longas do mesmo dia
- qualquer fluxo com schema grande e repetitivo

Não é para aplicar cegamente em tudo; requests curtas ou muito variáveis não se beneficiam tanto.

O que entrou na prática:

- `prompt_cache_retention` configurado no path OpenAI
- retenção estendida `24h` habilitada apenas quando o modelo suporta explicitamente esse modo

Pendência:

- calibrar com uso real se `24h` vale a pena por feature e por modelo

### 3d. Responses API para fluxos longos

**Status: pendente**

Para OpenAI, também faz sentido avaliar migração seletiva para Responses API nos fluxos multi-turn:

- Tutor
- chat do operador
- qualquer fluxo com histórico crescente

Os pontos relevantes aqui são:

- `previous_response_id` simplifica o encadeamento de turnos
- `/responses/compact` ajuda a reduzir contexto em conversas longas

Importante: mesmo com `previous_response_id`, os tokens anteriores continuam sendo cobrados como input. Então isso não elimina custo sozinho; ele melhora o gerenciamento de contexto e facilita compaction.

### 3e. Budget de saída e reasoning

**Status: implementado (budget) / pendente (reasoning)** — `src/main/services/ai-provider.ts`

Quando houver uso de modelos de reasoning da OpenAI, limitar `max_output_tokens` e ajustar `reasoning.effort` por tipo de tarefa reduz desperdício real.

Sugestão:

- roteamento/classificação: esforço mínimo ou baixo
- vision descritivo: saída curta e controlada
- tutor profundo: subir effort apenas quando a tarefa justificar

O que entrou na prática:

- budgets explícitos por feature para OpenAI, Anthropic, Gemini e Ollama
- exemplo atual:
  - `tutor`: 900
  - `vision`: 420
  - `router`: 140
  - `title`: 80
  - `stage2`: 320

Pendência:

- calibrar esses tetos com uso real
- introduzir `reasoning.effort` quando houver migração efetiva para modelos/flows onde isso faça diferença

---

## 4. Anthropic — próximos passos além do que já foi feito

### 4a. Expandir caching além do `system`

**Status: implementado (versão 1)**

Hoje o ganho Anthropic está concentrado no `system`. Mas a Anthropic documenta cache em hierarquia `tools -> system -> messages`.

Próximo passo:

- manter definitions de tools estáveis e antes do contexto dinâmico
- separar blocos reutilizáveis do contexto vivo
- usar `cache_control` no fim do trecho realmente reaproveitável

Isso importa principalmente se o Tutor e o Operator passarem a usar mais tools.

O que já ajuda:

- o prompt do tutor agora está mais canônico e previsível
- o path Anthropic agora usa `cache_control` no topo da request, permitindo caching automático até o último bloco cacheável
- o `system` permanece explicitamente cacheável e alinhado com a mesma política de TTL

O que ainda falta:

- fazer isso em fluxos com tools quando eles entrarem no path Anthropic

### 4b. Testar TTL estendido

**Status: implementado (versão 1 / calibrar depois)** — `src/main/services/ai-provider.ts`

A Anthropic também documenta cache estendido de 1 hora em beta. Vale avaliar em fluxos com prompt muito repetitivo:

- Vision em uso contínuo
- Operator no mesmo símbolo/timeframe
- Tutor dentro da mesma sessão estrutural

Isso deve entrar como experimento controlado, não como default imediato.

O que entrou na prática:

- `ttl: "1h"` no path Anthropic para fluxos quentes de `tutor` com histórico multi-turn
- registro do TTL aplicado em telemetria como `anthropicCacheTtl`

### 4c. Melhor estrutura para contexto longo

As docs da Anthropic sugerem:

- dados longos no topo
- pergunta no final
- múltiplos documentos em estrutura canônica
- grounding em trechos relevantes antes da resposta final

Aplicando ao John:

- OCR, análises anteriores, memória e contexto de mercado devem entrar em blocos bem delimitados
- evitar um "textão corrido" misturando fontes diferentes

---

## 5. Otimizações cross-provider

Essas otimizações não dependem de um provider específico e provavelmente geram o melhor ROI primeiro.

### 5a. Prompt assembly em blocos estáveis

**Status: implementado (parcial)**

Refatorar a montagem de prompt para separar claramente:

- `staticCore`
- `featurePolicy`
- `toolingOrSchema`
- `dynamicContext`
- `liveUserInput`

Isso aumenta reaproveitamento de prefixo tanto na OpenAI quanto na Anthropic.

Hoje isso já foi aplicado no tutor. Ainda falta espalhar o mesmo padrão para outros fluxos relevantes.

### 5b. Resumo incremental em vez de histórico bruto

**Status: implementado (versão 1)** — `src/main/services/tutor.ts`

Não reenviar histórico inteiro em toda chamada.

Modelo sugerido:

- últimas N interações verbatim
- um resumo curto da sessão
- memória recuperada por relevância

O que entrou na prática:

- compaction de histórico do tutor antes de reenviar contexto ao modelo
- preservação das mensagens mais recentes verbatim
- resumo compacto com:
  - `State`
  - `Goal`
  - `Decision`
  - `User goal` / `Assistant takeaway` por turno
  - `Open loops`

Pendência:

- melhorar a sensibilidade desse resumo por domínio (`code`, `market`, `study`)
- evoluir de heurística textual para compaction guiada por tokens reais

### 5c. Budget por etapa

**Status: implementado (versão 1)** — `src/main/services/ai-provider.ts`

Cada fluxo deveria definir explicitamente:

- `max_input_tokens`
- `max_output_tokens`
- limiar para resumir
- limiar para degradar `strong -> cheap`
- limiar para cair em heurística

Sem isso, o custo cresce por acúmulo invisível de contexto.

Hoje já existe budget explícito de saída por feature. Ainda faltam budgets de input e thresholds de degradação mais refinados.

### 5d. Observabilidade de cache e skips

**Status: implementado (versão 1)**

Hoje já existe base de custo, mas para otimizar de verdade precisamos registrar também:

- hit rate de cache por provider
- tamanho do prefixo estático
- hash da família de prompt
- motivo da chamada
- motivo de skip por dedup/gating

O que entrou na prática:

- `usage_recorded`
- `vision_dedup_hit`
- `global_intent_llm_skipped`
- `cache_hit`
- `cache_bypassed`
- métricas de `systemLength`, `promptLength`, `historyCount` e `rawHistoryCount` no tutor

---

## 6. Backlog priorizado

### Prioridade 1

- [x] implementar `frame deduplication`
- [x] implementar gating real em `resolveGlobalIntent`
- [x] separar prompt em blocos estáticos e dinâmicos
- [x] medir cache hit rate por feature/provider

### Prioridade 2

- [x] adicionar `prompt_cache_key` na OpenAI
- [x] testar `prompt_cache_retention`
- [x] expandir Anthropic caching além do `system`
- [x] adicionar budgets por etapa

Status geral: Prioridade 2 essencialmente concluída no código atual. O que resta aqui é calibração com uso real, não implementação base.

### Prioridade 3

- migrar fluxos multi-turn da OpenAI para Responses API
- [x] implementar compaction/summarization controlada
- adicionar contagem preventiva de tokens em fluxos grandes

---

## Fontes oficiais

- OpenAI Prompt Caching: https://platform.openai.com/docs/guides/prompt-caching
- OpenAI Conversation State / Responses API: https://platform.openai.com/docs/guides/conversation-state
- OpenAI Responses API reference: https://platform.openai.com/docs/api-reference/responses
- OpenAI migrate to Responses: https://platform.openai.com/docs/guides/migrate-to-responses
- Anthropic Prompt Caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Anthropic Context Windows: https://docs.anthropic.com/en/docs/build-with-claude/context-windows
- Anthropic Long Context Tips: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/long-context-tips
- Anthropic Token-Efficient Tool Use: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/token-efficient-tool-use
