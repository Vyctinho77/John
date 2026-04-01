
# Arquitetura John — 

## 1. Conceito

O John é um agente residente de desktop com interface em HUD, inspirado no comportamento do Spotlight, capaz de acompanhar o contexto visual da tela do usuário e explicar com profundidade o que está sendo visto. O sistema não depende de compreensão visual perfeita. Ele combina percepção computacional, memória contextual e raciocínio de linguagem para atuar como um tutor contínuo.

O papel da visão não é “pensar”. O papel da visão é perceber. O papel do modelo de linguagem é interpretar, explicar, ensinar e adaptar a profundidade da resposta ao nível do usuário.

O produto deve ser percebido como um “livro inteligente com olhos”: ele acompanha o foco da pessoa, entende o suficiente do que está na tela e transforma isso em explicação útil.

---

## 2. Objetivo do sistema

O sistema precisa cumprir cinco funções centrais:

1. Estar sempre disponível sem atrito.
2. Capturar contexto visual de forma controlada e eficiente.
3. Converter percepção visual em estado semântico.
4. Responder como tutor, não só como chatbot.
5. Preservar privacidade e segurança como princípio estrutural.

---

## 3. Experiência do usuário

A experiência principal é:

O app roda como processo residente. O usuário toca no HUD compacto ou traz o foco para ele. O HUD expande suavemente. O sistema já conhece o contexto recente da tela. O usuário pergunta “explica isso” ou o próprio sistema oferece uma leitura contextual. Após um período de inatividade, o HUD volta ao modo compacto com animação suave.

Essa UX precisa dar a sensação de presença contínua, não de ferramenta aberta e fechada manualmente.

---

## 4. Princípios de arquitetura

### 4.1 Percepção antes de geração

Nada deve ir direto da imagem bruta para a resposta final se isso puder ser intermediado por uma camada estrutural.

### 4.2 Estado semântico como núcleo

O coração do sistema não é a imagem nem o prompt, e sim um estado intermediário que descreve o que está acontecendo.

### 4.3 UX de baixa fricção

O produto deve estar a no máximo um gesto de distância.

### 4.4 Segurança por padrão

Toda coleta sensível deve ser opt-in, minimizada, auditável e reversível.

### 4.5 Modularidade

Cada camada deve poder evoluir separadamente: HUD, captura, percepção, orquestração, memória e ensino.

---

# 5. Visão geral da arquitetura

## 5.1 Camadas do sistema

### Camada 1 — Cliente Desktop

Responsável por HUD, janela overlay, atalhos, ciclo de foco, captura de tela, rastreamento de interação e estado local.

### Camada 2 — Percepção

Responsável por OCR, detecção de layout, classificação visual básica, tracking de mudanças e extração de sinais visuais.

### Camada 3 — Estado Semântico

Transforma sinais visuais em uma representação textual e estruturada do contexto atual.

### Camada 4 — Orquestração de Inteligência

Decide o que enviar ao LLM, como compor contexto, quando responder, quando perguntar, quando resumir e como adaptar profundidade.

### Camada 5 — Tutor

Gera explicação, ensino guiado, analogias, perguntas diagnósticas, decomposição progressiva e reforço pedagógico.

### Camada 6 — Segurança e Controle

Cuida de permissões, mascaramento, escopo de visão, retenção de dados, criptografia, auditoria e modo privado.

---

# 6. Stack recomendada

## Cliente

Electron como shell principal, com React e TypeScript no front e processo principal em Node.js.

### Motivos

Electron elimina a complexidade de toolchains pesadas no Windows, acelera o setup inicial e permite construir o HUD, o overlay, a lógica de foco, a captura e a comunicação entre processos com rapidez. React acelera a construção da interface, e TypeScript melhora a previsibilidade do sistema.

## UI

React + Tailwind + Framer Motion.

### Motivos

Essa combinação é ideal para HUD com múltiplos estados, transições suaves, morphing entre modo compacto e expandido e iteração rápida de UI/UX.

## Backend

Node.js com Fastify.

### Motivos

Fastify é leve, rápido e simples de operar. Permite construir streaming, endpoints de sessão, orquestração de contexto e integração com APIs de modelos com menos fricção que uma stack mais pesada.

## Comunicação

HTTP para operações simples e WebSocket para sessões ativas e streaming quando necessário.

## Percepção

Electron Desktop Capture + OCR em JavaScript + heurísticas de layout + APIs multimodais.

### Sugestão inicial

* `desktopCapturer` do Electron para captura de tela e janelas.
* `tesseract.js` para OCR.
* heurísticas simples para classificação de superfície, detecção de regiões e tracking de mudanças.
* modelos multimodais externos para complementar interpretação quando houver ganho claro.

## Memória

Estado efêmero em memória local no cliente e persistência opcional em Postgres no backend. Cache local com IndexedDB ou armazenamento equivalente no app.

## Observabilidade

Logs estruturados, tracing por sessão e integração opcional com Sentry para erros e monitoramento.

---

# 7. Estrutura de módulos

## Cliente Desktop

* hud-shell
* overlay-manager
* focus-manager
* idle-manager
* animation-engine
* capture-service
* event-stream
* local-cache
* permissions-controller
* ipc-bridge
* ai-client

## Backend

* api-gateway
* session-orchestrator
* perception-service
* semantic-state-builder
* tutor-engine
* user-profile-service
* memory-service
* policy-engine
* audit-service

## Infra

* banco transacional
* cache efêmero
* storage temporário criptografado
* canal de sessão em tempo real quando necessário

---

# 8. Modelo de dados central

O sistema precisa de um objeto intermediário estável. Exemplo conceitual:

```json
{
  "session_id": "abc123",
  "current_mode": "study",
  "screen_context": {
    "surface_type": "chart",
    "regions": [
      { "type": "main_chart", "confidence": 0.92 },
      { "type": "indicator_panel", "confidence": 0.81 }
    ],
    "detected_text": ["PETR4", "15m", "RSI"],
    "change_summary": "user moved viewport left and zoomed into previous candles"
  },
  "semantic_state": {
    "user_focus": "price action near resistance zone",
    "topic_candidates": ["resistance", "trend continuation", "RSI divergence"],
    "uncertainty": 0.34
  },
  "teaching_context": {
    "user_level": "beginner",
    "preferred_style": "step_by_step",
    "current_goal": "understand what is happening on screen"
  }
}
```

Esse objeto é o ponto de passagem entre percepção e explicação.

---

# 9. Fases de implementação

Vou dividir em seis fases. Isso permite construir algo útil cedo sem comprometer a arquitetura final.

---

# Fase 1 — Fundação do cliente e HUD CONCLUÍDO ✅

## Objetivo

Criar o corpo do produto: app residente, HUD compacto/expandido, estados de foco e animações.

## Implementação da arquitetura

Implementar app desktop em Electron com:

* inicialização automática opcional
* HUD compacto sempre disponível
* expansão suave ao foco ou toque
* retorno automático ao modo compacto por inatividade
* máquina de estados de interface: idle, active, cooldown, collapsed
* overlay por cima de outros apps
* storage local para preferências

Criar animation system com:

* transform em vez de width e height
* fade entre conteúdo compacto e expandido
* transição de border-radius, sombra e escala

Implementar input layer com:

* caixa de texto
* histórico curto local
* streaming de resposta

## Testes

### Testes funcionais

* HUD abre ao foco
* HUD expande sem perder o input
* HUD retorna ao compacto após timeout
* interações do usuário resetam o idle timer

### Testes de UX

* medir tempo de expansão
* medir taxa de interrupção indevida
* validar ausência de flicker
* validar consistência entre estados compact e expanded

### Testes de performance

* uso de CPU em idle
* uso de memória em background
* renderização estável durante animações

## Segurança do usuário

* nenhuma captura de tela ativa nesta fase
* todo estado sensível apenas local
* opção clara para iniciar com o sistema desligada por padrão
* documentação de permissões antes de qualquer solicitação futura

---

# Fase 2 — Captura contextual e percepção mínima CONCLUÍDA ✅

## Objetivo

Permitir ao sistema enxergar a tela de forma controlada.

## Implementação da arquitetura

Implementar capture-service com:

* captura por snapshot sob demanda
* captura contextual em baixa frequência quando a sessão estiver ativa
* seleção de janela alvo
* exclusão de superfícies sensíveis

Implementar percepção mínima com:

* OCR em JavaScript
* detecção de regiões simples
* identificação de mudanças entre snapshots
* classificação básica de superfície: texto, código, gráfico, documento, dashboard

Implementar semantic-state-builder inicial com:

* detected_text
* surface_type
* change_summary
* focus_region aproximada

## Testes

### Testes funcionais

* OCR reconhece texto legível com precisão mínima aceitável
* sistema diferencia superfícies básicas
* tracking detecta mudança entre dois estados da tela
* seleção de janela restringe escopo de visão

### Testes de robustez

* diferentes resoluções
* dark mode e light mode
* zoom alto e baixo
* apps comuns: browser, PDF, editor de código, gráfico

### Testes de erro

* OCR falhando
* permissão revogada
* janela minimizada
* frame corrompido

## Segurança do usuário

* permissão explícita de screen recording
* indicador visual de captura ativa
* allowlist e blocklist de apps e janelas
* modo privado com suspensão imediata da visão
* retenção zero por padrão para frames
* frames temporários criptografados apenas se estritamente necessário

---

# Fase 3 — Estado semântico e memória curta CONCLUÍDA ✅

## Objetivo

Parar de pensar em frames isolados e passar a pensar em continuidade.

## Implementação da arquitetura

Criar memória efêmera de sessão:

* últimos estados visuais
* resumo incremental do que mudou
* foco provável do usuário
* intenção corrente inferida

Implementar semantic-state-builder v2:

* consolidar OCR, layout e tracking
* criar explicação do que está sendo visto
* marcar grau de incerteza
* estimar tópicos pedagógicos relacionados

Adicionar user-profile-service:

* nível do usuário
* tipo de explicação preferida
* objetivos de estudo
* idioma e tom de resposta

## Testes

### Testes funcionais

* o sistema mantém contexto entre mudanças leves da tela
* foco semântico muda quando a área observada muda
* memória curta não cresce indefinidamente
* incerteza sobe quando a percepção fica inconsistente

### Testes de qualidade

* comparar estado semântico gerado com anotação humana
* medir estabilidade entre frames semelhantes
* medir se o resumo incremental evita redundância

## Segurança do usuário

* separação rígida entre memória efêmera e perfil persistente
* expiração automática da sessão
* painel para apagar contexto atual
* nenhum conteúdo sensível persistido sem consentimento

---

# Fase 4 — Tutor engine e explicação contextual CONCLUÍDA ✅

## Objetivo

Transformar percepção em ensino real.

## Implementação da arquitetura

Criar tutor-engine com modos:

* explicação direta
* passo a passo
* analogia
* resumo
* diagnóstico por pergunta
* aprofundamento por camadas

Criar policy de resposta:

* quando afirmar
* quando sinalizar incerteza
* quando pedir confirmação
* quando oferecer opções didáticas

Prompting baseado em:

* semantic state
* perfil do usuário
* objetivo de aprendizagem
* histórico recente da conversa

Adicionar senso pedagógico:

* explicar sem assumir demais
* progredir do simples ao complexo
* preferir orientação a resposta pronta em tarefas educacionais

## Testes

### Testes funcionais

* respostas variam de acordo com nível do usuário
* sistema responde ao contexto atual da tela
* explicações mantêm coerência com mudanças recentes
* modo passo a passo fragmenta corretamente o ensino

### Testes de qualidade

* revisão humana das explicações
* avaliação de profundidade, clareza e relevância
* benchmark interno por tipo de tarefa: leitura, lição, gráfico, código

### Testes de alucinação

* cenários ambíguos
* estados visuais incompletos
* OCR incompleto
* superfície errada classificada

## Segurança do usuário

* respostas devem marcar incerteza quando necessário
* proibir posicionamento indevido em contextos de alto risco sem aviso claro
* evitar instruções que burlem avaliações escolares, quando isso violar a política do produto
* logging de eventos de risco sem armazenar conteúdo sensível desnecessário

---

# Fase 5 — Especializações por domínio CONCLUÍDA ✅

## Objetivo

Adicionar profundidade em áreas específicas sem quebrar o núcleo geral.

## Implementação da arquitetura

Criar plugins de domínio:

* leitura e texto
* dever de casa
* código
* gráficos e estudo de mercado
* documentos longos
* dashboards

Para gráficos, por exemplo:

* identificar tipo de gráfico
* inferir estruturas visuais básicas
* resumir mudança de viewport
* detectar elementos como indicador inferior, linhas e zonas marcadas
* transformar isso em tópicos didáticos, não em trading automático

Para texto:

* OCR refinado
* segmentação por parágrafo
* explicação de termos
* perguntas de compreensão

## Testes

### Testes funcionais

* cada plugin recebe o estado correto
* fallback para tutor geral quando plugin falha
* plugins não conflitam entre si

### Testes de domínio

* tarefas reais com usuários-alvo
* medir utilidade percebida
* medir frequência de correção manual necessária

## Segurança do usuário

* para mercado financeiro, posicionar como educacional
* para estudos, evitar respostas que facilitem cola automática em contextos proibidos
* para código, evitar execução de ações destrutivas sem confirmação

---

# Fase 6 — Maturidade de produto, observabilidade e hardening CONCLUÍDA ✅

## Objetivo

Preparar para uso real contínuo.

## Implementação da arquitetura

Adicionar:

* telemetria de uso opt-in
* traces de performance
* replay sem conteúdo sensível, apenas eventos técnicos
* crash reporting anonimizado
* política de feature flags
* rollout gradual de percepção avançada
* escopo de captura por janela selecionada + bloqueio local por palavras-chave de fontes sensíveis

Melhorar cliente:

* modo sempre visível opcional
* modo minimalista
* sugestões contextuais passivas
* voice mode opcional
* painel operacional com consentimento, diagnóstico, replay técnico e controles de captura

## Testes

### Testes de sistema

* testes ponta a ponta
* caos controlado em perda de conexão
* reconexão de WebSocket
* filas congestionadas
* backend degradado

### Testes de segurança

* threat modeling
* pentest
* revisão de permissões
* validação de isolamento de dados

### Testes de privacidade

* confirmar retenção real
* validar exclusão definitiva
* validar trilha de consentimento
* validar política de escopo de captura e detectores de superfície sensível

## Segurança do usuário

* consentimento por camadas
* auditoria de acesso
* criptografia em trânsito e em repouso
* chaves separadas por ambiente
* controles de exclusão de dados
* modos de proteção reforçada para janelas sensíveis

---

# 10. Máquina de estados do HUD

Isso merece definição explícita.

## Estados

* compact
* expanding
* expanded
* soft-idle
* collapsing

## Regras

* tocar no input: compact → expanding → expanded
* digitação ou interação: mantém expanded
* inatividade leve: expanded → soft-idle
* inatividade total: soft-idle → collapsing → compact
* nova atividade em soft-idle ou collapsing: retorna para expanded

## Requisitos

* nunca colapsar com input focado
* nunca colapsar durante streaming de resposta
* debounce de transições
* duração mínima aberto para evitar flicker

---

# 11. Fluxo principal de dados

## Fluxo

1. Cliente detecta foco ou intenção.
2. Se a sessão estiver ativa, captura snapshot controlado.
3. Perception-service extrai texto, regiões e mudanças.
4. Semantic-state-builder gera contexto consolidado.
5. Session-orchestrator decide se envia ao tutor.
6. Tutor-engine gera explicação.
7. Resposta retorna em streaming para o HUD.
8. Memória curta atualiza estado de continuidade.

---

# 12. Estratégia de testes global

## 12.1 Pirâmide de testes

Base forte em testes unitários e de contrato, meio em integração e topo com cenários end-to-end.

## 12.2 Categorias obrigatórias

* unitários para estados, timers, parsing e builders
* integração entre captura, percepção e estado semântico
* e2e de UX real
* testes humanos com tasks guiadas
* testes de segurança e privacidade

## 12.3 Métricas que importam

* latência até primeira resposta
* taxa de colapso indevido do HUD
* precisão de OCR por contexto
* utilidade percebida da explicação
* taxa de respostas marcadas como confusas
* taxa de revogação de permissão
* consumo de CPU e memória em idle e ativo

---

# 13. Segurança e privacidade como arquitetura, não feature

## Princípios

* menor coleta possível
* menor retenção possível
* transparência de operação
* controle total do usuário
* revogação fácil

## Controles obrigatórios

* captura apenas quando a sessão permitir
* bloqueio por app e por janela
* indicador claro de modo ativo
* botão de pausa imediata
* exclusão de histórico
* criptografia em trânsito
* criptografia em armazenamento temporário
* isolamento entre sessão e perfil
* auditoria interna de eventos técnicos

## Superfícies de risco

* tela contendo dados bancários
* mensagens privadas
* credenciais
* documentos sensíveis
* dados médicos e legais

## Mitigações

* detectores de superfície sensível
* suspensão automática em superfícies bloqueadas
* regras de mascaramento
* processamento local sempre que possível nas camadas iniciais
* persistência apenas do estado semântico necessário, não do frame bruto

---

# 14. Inspirações de produto

A principal referência de corpo continua sendo Spotlight. Além disso:

* Spotlight para presença e velocidade
* Raycast para densidade funcional e sensação premium
* Notion AI para tom de assistência natural

Mas a síntese correta do produto não é launcher nem chatbot. É um tutor residente contextual.

---

# 15. MVP recomendado

Se você quiser começar com o corte mais inteligente, eu faria assim:

## MVP 1

* Electron
* HUD compacto e expandido
* input contextual
* snapshot sob demanda
* OCR + classificação básica
* tutor textual
* memória curta de sessão
* modo privado

## O que não entra no MVP 1

* captura contínua agressiva
* múltiplos plugins de domínio
* voz
* tracking complexo
* automações

Isso reduz risco e preserva a forma correta da arquitetura.

---

# 16. Ordem prática de build

A ordem ideal de construção é:

1. HUD e máquina de estados
2. captura controlada
3. OCR e classificação simples
4. estado semântico
5. tutor contextual
6. memória curta
7. plugins de domínio
8. hardening, segurança e observabilidade

Essa ordem mantém o produto usável desde cedo.

---

# 17. Resumo executivo

O produto é um tutor visual residente de desktop com HUD inspirado em Spotlight. A arquitetura correta separa percepção, estado semântico e raciocínio. O cliente deve ser persistente, context-aware e simples de evoluir. A visão deve operar como camada de percepção mínima suficiente. O LLM deve operar como tutor adaptativo. Segurança e privacidade devem ser parte da estrutura do sistema desde o início. O roadmap ideal passa por seis fases, cada uma com implementação, testes e proteção do usuário claramente definidos.

A stack final fica assim:

* **Cliente:** Electron + React + TypeScript
* **UI:** Tailwind + Framer Motion
* **Backend:** Node.js + Fastify
* **Captura:** Electron Desktop Capture
* **OCR:** tesseract.js
* **Modelos:** APIs multimodais externas
* **Persistência:** Postgres opcional + cache local
* **Observabilidade:** logs estruturados + Sentry opcional

Se você quiser, eu posso agora converter isso para um formato mais executivo, tipo **PRD técnico**, ou para um formato mais operacional, tipo **árvore de pastas + módulos + contratos de dados**.
