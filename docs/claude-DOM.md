# Documentação Técnica da UI do Claude (claude.ai)

> **Fonte:** Inspeção direta do DOM em produção — claude.ai (build v2, abril 2026)

---

## 1. Stack Tecnológica

O frontend do Claude é uma **SPA (Single Page Application)** sem Next.js ou Remix detectados. A aplicação usa:

- **Editor de texto:** TipTap sobre ProseMirror (`contenteditable`, `role="textbox"`)
- **Componentes headless:** Radix UI (accordion, dialog, tooltip, popper — detectados via `data-state="open/closed"`)
- **Estilização:** Tailwind CSS v3+ com design tokens customizados via CSS custom properties
- **Fontes proprietárias:** `Anthropic Sans`, `Anthropic Serif`, `Anthropic Mono`
- **PWA:** Manifesto configurado com `display: standalone`, preferindo apps nativos (Play Store)
- **Rastreamento:** Amplitude para analytics
- **Suporte:** Intercom (iframe embutido)

O bundle principal é servido via `assets-proxy.anthropic.com/claude-ai/v2/assets/v1/`, com assets prefetchados via `<link rel="modulepreload">`.

---

## 2. Design Tokens (Tema Escuro)

Todo o sistema de cores opera em **HSL** via CSS custom properties no `:root`:

```
Backgrounds:
  --bg-000: hsl(60 2% 17%)   → Input box / surface elevada
  --bg-100: hsl(60 2% 12%)   → Fundo principal do chat
  --bg-200: hsl(60 2% 9%)    → Sidebar / superfície mais profunda
  --bg-300: hsl(0 0% 7%)     → User message bubble
  --bg-400: hsl(0 0% 4%)     → Fundo máximo escuro
  --bg-500: hsl(0 0% 4%)     → Alias de bg-400

Textos:
  --text-000: hsl(60 14% 97%)  → Branco quente (máximo contraste)
  --text-100: hsl(60 14% 97%)  → Texto primário (headings, UI principal)
  --text-200: hsl(55 9% 74%)   → Texto secundário
  --text-300: hsl(55 9% 74%)   → Texto terciário / ícones
  --text-400: hsl(48 5% 57%)   → Texto sutil
  --text-500: hsl(48 5% 57%)   → Texto mínimo / timestamps

Bordas:
  --border-300: hsl(53 12% 87%)  → Borda padrão (usada com /0.15 a /0.6 de opacidade)

Accent:
  --accent-brand: hsl(14.8 63.1% 59.6%)  → Laranja Anthropic
  --accent-000: hsl(213 80% 79%)          → Azul claro (accent pro)
  --accent-100: hsl(213 77% 56%)          → Azul médio
  --accent-900: hsl(213 87% 18%)          → Azul escuro (hover de citations)

Perigo / Sucesso:
  --danger-100: hsl(0 73% 59%)
  --success-100: hsl(81 100% 30%)
```

**Paleta do tema claro** usa `--theme-color: hsl(49, 26.8%, 92%)` (bege Anthropic).

---

## 3. Tipografia

O Claude usa três famílias tipográficas proprietárias com fallbacks:

| Variável | Família | Uso |
|---|---|---|
| `--font-anthropic-sans` | `"Anthropic Sans"`, system-ui, Roboto… | Interface (UI, input, sidebar) |
| `--font-anthropic-serif` | `"Anthropic Serif"`, Georgia… | Respostas do Claude |
| `--font-anthropic-mono` | `"Anthropic Mono"`, ui-monospace… | Blocos de código |

Aplicação via tokens semânticos:

```
.font-claude-response     → Anthropic Serif, 16px, lh 26.4px, weight 360
.font-claude-response-body → Anthropic Serif, 16px, lh 24px, weight 360
.font-user-message        → Anthropic Sans, 16px (alias de .font-large)
.font-large               → Anthropic Sans, 16px, lh 22.4px, weight 400
.font-base                → Anthropic Sans, 14px, lh 19.6px, weight 400
.font-base-bold           → Anthropic Sans, 14px, weight 530
```

A escolha de **peso 360** para o corpo da resposta e **530** para bold cria contraste leve e natural, compatível com a legibilidade da Anthropic Serif.

---

## 4. Estrutura do Layout (DOM Tree)

```
<body class="bg-bg-100 text-text-100 font-ui min-h-screen chat-ui-core">
  <div id="root">
    <div class="root">

      <!-- LAYOUT PRINCIPAL: grid com sidebar + chat -->
      <div class="grid w-full overflow-hidden">
        <!-- grid-template-rows com transition: 0.15s ease-out para suporte a headers colapsáveis -->

        <!-- SIDEBAR WRAPPER -->
        <div class="shrink-0">
          <div class="fixed lg:sticky z-sidebar">  <!-- z-index: 30 -->
            <nav class="flex flex-col fixed left-0 h-screen w-[288px]
                        bg-bg-100 border-r-0.5 border-border-300
                        transition-[background-color,border-color,box-shadow] duration-[35ms]">
              <!-- Logo + toggle -->
              <!-- Nav links: Conversas, Projetos, Artefatos, Código, Design -->
              <!-- Lista de chats recentes -->
              <!-- User button -->
            </nav>
          </div>
        </div>

        <!-- ÁREA PRINCIPAL -->
        <div class="w-full relative min-h-0 h-full">
          <div class="flex flex-1 h-full w-full overflow-hidden">

            <!-- PADRÃO DE GRADE (background decorativo) -->
            <div class="pointer-events-none absolute inset-0 bg-bg-100
                        [background-image:linear-gradient(to_right,hsl(var(--bg-200))_1px,transparent_1px),
                         linear-gradient(to_bottom,hsl(var(--bg-200))_1px,transparent_1px)]
                        [background-size:32px_32px]" />
            <!-- Grade CSS pura de 32×32px em bg-200 sobre bg-100 -->

            <!-- COLUNA DA CONVERSA -->
            <div class="h-full flex flex-col overflow-hidden">

              <!-- HEADER (sticky) -->
              <header class="flex w-full bg-bg-100 sticky top-0 z-header h-12 -mb-3"
                      data-testid="page-header">
                <!-- Gradiente blur abaixo do header para fade do conteúdo -->
                <div class="from-bg-100 via-bg-100 via-65% to-bg-100/0
                            pointer-events-none absolute inset-0 -bottom-5 z-[-1]
                            bg-gradient-to-b blur-sm" />
                <!-- Título do chat + botão de share -->
              </header>

              <!-- SCROLL AREA DAS MENSAGENS -->
              <div class="overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] pt-6 flex-1">
                <div class="relative w-full min-h-full flex flex-col">
                  <div class="mx-auto flex w-full flex-1 flex-col max-w-3xl md:px-2">

                    <!-- CONTAINER DE MENSAGENS -->
                    <div class="flex-1 flex flex-col px-4 max-w-3xl mx-auto w-full pt-1">
                      <!-- [mensagens user + assistant] -->
                      <div class="h-px w-full pointer-events-none" /> <!-- sentinel invisível -->
                      <div class="h-12" />  <!-- espaçador para input flutuante -->
                    </div>

                    <!-- INPUT BAR (sticky bottom) -->
                    <div class="sticky bottom-0 mx-auto w-full pt-6 z-[5]">
                      <!-- ... -->
                    </div>

                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</body>
```

---

## 5. Mensagens do Usuário

```html
<!-- Wrapper de turn -->
<div class="mb-1 mt-6 group">
  <div class="flex flex-col items-end gap-1">  <!-- alinhado à DIREITA -->

    <!-- Bubble da mensagem -->
    <div class="group relative inline-flex gap-2
                bg-bg-300 rounded-xl pl-2.5 py-2.5
                break-words text-text-100 transition-all
                max-w-[75ch] flex-col !px-4 max-w-[85%]">
      <!-- bg-bg-300 = hsl(0 0% 7%) — escuro sutil diferente do fundo -->
      <!-- border-radius: 20px via rounded-xl -->

      <div class="flex flex-row gap-2 relative">
        <div class="flex-1">
          <div class="font-large !font-user-message grid grid-cols-1 gap-2 py-0.5 relative"
               data-testid="user-message">
            <p class="whitespace-pre-wrap break-words">
              [texto da mensagem]
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Action buttons (hover only) -->
    <div class="flex justify-start opacity-0
                group-hover:opacity-100 group-focus-within:opacity-100
                transition"
         aria-label="Message actions" role="group">
      <div class="text-text-300">09:29</div>
      <!-- Retry, Edit, Copy buttons -->
    </div>

  </div>
</div>
```

**Regras visuais:** bubble right-aligned, fundo `bg-bg-300`, sem avatar, ação buttons aparecem no hover com `opacity-0 → opacity-100` (transition padrão 150ms).

---

## 6. Mensagens do Claude (Assistant)

```html
<!-- Turn wrapper -->
<div class="group">
  <div class="contents">  <!-- display:contents — sem caixa visual própria -->
    <div class="group relative pb-3">

      <!-- Container principal da resposta -->
      <div class="font-claude-response relative leading-[1.65rem]
                  [&_pre>div]:bg-bg-000/50 [&_pre>div]:border-0.5
                  [&_pre>div]:border-border-400
                  [&_.standard-markdown_:is(p,blockquote,...)]:pl-2
                  [&_.standard-markdown_:is(p,blockquote,ul,ol,...)]:pr-8">

        <!-- Tool calls (ex: Pesquisou na web) -->
        <div>
          <div class="grid grid-rows-[auto_auto] min-w-0">
            <!-- Row 1: header do tool call -->
            <div class="row-start-1 col-start-1 min-w-0">
              <div class="min-w-0 pl-2 py-1.5">
                <button class="group/status flex items-center gap-2 py-1 text-sm
                               transition-colors text-text-500 hover:text-text-300"
                        aria-expanded="false">
                  <div class="inline-flex items-center gap-1 min-w-0">
                    <span class="truncate text-sm font-base">Pesquisou na web</span>
                    <!-- Chevron com transform rotate -90deg (fechado) / 0deg (aberto) -->
                    <span class="inline-flex transition-transform duration-200 shrink-0 -rotate-90">
                      [ícone chevron SVG]
                    </span>
                  </div>
                </button>
                <span class="sr-only" role="status">Pesquisou na web</span>
              </div>
            </div>

            <!-- Row 2: conteúdo expandível (accordion) -->
            <div class="row-start-2 col-start-1 relative grid isolate min-w-0">
              <!-- Markdown content da resposta -->
            </div>
          </div>
        </div>

      </div><!-- /font-claude-response -->

    </div>
  </div>

  <!-- Action buttons do assistant (sempre visíveis) -->
  <div class="flex justify-start" aria-label="Message actions" role="group">
    <div class="text-text-300 flex items-stretch justify-between">
      <!-- Copy, Thumbs Up, Thumbs Down, Retry -->
    </div>
  </div>

</div>
```

---

## 7. Sistema de Markdown Rendering

O Claude usa **dois modos de renderização** de markdown:

**`standard-markdown`** — resposta finalizada:
```
.standard-markdown {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;  /* gap-3 */
}
```

**`progressive-markdown`** — durante streaming (aparece como classe ativa durante geração):
- Aplica paddings ligeiramente diferentes (`pl-2`, `pr-8` nos blocos)
- A mesma estrutura de grid, mas o conteúdo vai chegando progressivamente via tokens do SSE stream

**Elementos de markdown mapeados:**

| Elemento | Classes CSS | Estilo computado |
|---|---|---|
| `<p>` | `font-claude-response-body break-words whitespace-normal leading-[1.7]` | Serif, 16px, lh 24px |
| `<h2>` | `text-text-100 mt-3 -mb-1 text-[1.125rem] font-bold` | 18px, weight 530 |
| `<h3>` | `text-text-100 mt-2 -mb-1 text-base font-bold` | 16px, weight 530 |
| `<ul>` | `list-disc flex flex-col gap-1 pl-8 mb-3` | list-style: disc |
| `<li>` | `whitespace-normal break-words pl-2` | Serif, 16px, lh 26.4px |
| `<hr>` | `border-border-200 border-t-0.5 my-3 mx-1.5` | Divisor fino |
| `<table>` | `min-w-full border-collapse text-sm leading-[1.7] whitespace-normal` | collapsed, 14px |
| `<th>` | `text-text-100 border-b-0.5 border-border-300/60 py-2 pr-4 font-bold` | weight 530, borda 60% opacidade |
| `<td>` | `border-b-0.5 border-border-300/30 py-2 pr-4 align-top` | borda 30% opacidade |

**Blocos de código** — estrutura baseada em `<pre>` com wrapper:
```css
.font-claude-response [pre>div] {
  background: bg-bg-000/50;   /* bg semi-transparente */
  border: 0.5px solid border-border-400;
}
```

---

## 8. Tags de Citação (Source Badges)

Os badges de fonte (ex: "Nxcode", "LLM Leaderboard") são implementados como links inline com design de pill:

```html
<a href="[url]" target="_blank"
   class="group/tag relative h-[18px] rounded-full inline-flex
          items-center overflow-hidden -translate-y-px cursor-pointer">

  <!-- Pill principal -->
  <span class="relative transition-colors h-full max-w-[180px] overflow-hidden
               px-1.5 inline-flex items-center font-small rounded-full
               border-0.5 border-border-300 bg-bg-200
               group-hover/tag:bg-accent-900
               group-hover/tag:border-accent-100/60">
    <span class="text-nowrap text-text-300 break-all truncate font-normal
                 group-hover/tag:text-text-200">
      Nxcode
    </span>
  </span>

  <!-- Overlay de gradiente (aparece no hover, simula efeito de "ir para link") -->
  <span class="transition-all opacity-[0%] h-[17px] absolute right-[0.5px]
               inline rounded-r-full flex items-center px-1.5
               bg-gradient-to-r from-accent-900/0 via-accent-900/100 via-30% to-accent-900/100
               group-hover/tag:opacity-100">
    [ícone de link externo SVG]
  </span>

</a>
```

**Hover:** `bg-bg-200 → bg-accent-900` (azul escuro) + overlay de gradiente revelado via `opacity-0 → opacity-100`.

---

## 9. Input Bar

```html
<!-- Container sticky -->
<div class="sticky bottom-0 mx-auto w-full pt-6 z-[5]">

  <!-- Botão "rolar para o final" (flutuante acima do input) -->
  <button aria-label="Rolar para o final"
          class="z-[1] size-9 absolute -top-8 left-1/2 -translate-x-1/2
                 border-0.5 overflow-hidden !rounded-full p-1 shadow-md
                 hover:shadow-lg bg-bg-000/80 hover:bg-bg-000
                 backdrop-blur-sm">
    <!-- Efeito de brilho blur (brand color blur + ícone seta) -->
    <div class="absolute blur-md transition duration-300 pointer-events-none
                opacity-0 w-8 text-accent-brand" />
  </button>

  <!-- FORM / FIELDSET principal -->
  <fieldset class="flex w-full min-w-0 flex-col">

    <!-- File input oculto -->
    <input type="file" class="absolute -z-10 h-0 w-0 opacity-0"
           data-testid="file-upload" aria-label="Enviar arquivos" />

    <!-- Área de preview de anexos -->
    <div class="px-3 md:px-2">
      <div role="status" />  <!-- status para screen readers -->
    </div>

    <!-- INPUT BOX com bordas e sombra -->
    <div class="relative">

      <!-- Glow de gradiente atrás do box (animado quando gerando) -->
      <div class="absolute bottom-0 left-1/2 -translate-x-1/2 z-0
                  pointer-events-none transition-opacity duration-500" />

      <!-- O box principal -->
      <div class="!box-content flex flex-col bg-bg-000 mx-2 md:mx-0
                  items-stretch transition-all duration-200 relative z-10
                  rounded-[20px] cursor-text border border-transparent
                  shadow-[0_0.25rem_1.25rem_hsl(var(--always-black)/3.5%),
                          0_0_0_0.5px_hsla(var(--border-300)/0.15)]
                  hover:shadow-[...,0_0_0_0.5px_hsla(var(--border-200)/0.3)]
                  focus-within:shadow-[0_0.25rem_1.25rem_hsl(var(--always-black)/7.5%),
                                       0_0_0_0.5px_hsla(var(--border-200)/0.3)]">
        <!-- bg-bg-000 = rgb(44, 44, 42) — cinza quente elevado -->
        <!-- border-radius: 20px -->
        <!-- sombra tripla: drop-shadow + ring via box-shadow -->
        <!-- focus-within aumenta a sombra drop de 3.5% → 7.5% de opacidade -->

        <div class="flex flex-col m-3.5 gap-3">

          <!-- ÁREA DO TEXTO (TipTap/ProseMirror) -->
          <div class="relative">
            <div class="w-full overflow-y-auto font-large break-words
                        transition-opacity duration-200
                        max-h-96 min-h-[1.5rem] pl-[6px] pt-[6px]">
              <div class="tiptap ProseMirror"
                   contenteditable="true"
                   role="textbox"
                   aria-label="Escreva as instruções para o Claude"
                   data-testid="chat-input">
              </div>
            </div>
          </div>

          <!-- TOOLBAR DO INPUT -->
          <div class="relative flex gap-2 w-full items-center">

            <!-- Esquerda: botões de ferramentas -->
            <div class="relative flex-1 flex items-center shrink min-w-0 gap-1">
              <button aria-label="Adicionar arquivos, conectores e mais">
                [ícone +]
              </button>
              <!-- Outros conectores/plugins -->
            </div>

            <!-- Direita: seletor de modelo + voice -->
            <div class="flex items-center gap-1 shrink-0">
              <button class="h-8 rounded-md px-3 inline-flex items-center gap-1.5
                             text-[14px] leading-none transition duration-300
                             ease-[cubic-bezier(0.165,0.85,0.45,1)]">
                <div class="inline-flex gap-1.5 items-baseline">
                  Sonnet 4.6
                </div>
                [chevron icon]
              </button>

              <!-- Voice mode button -->
              <button class="h-8 rounded-lg overflow-hidden flex items-center
                             justify-center font-base-bold transition-colors duration-200
                             hover:bg-bg-300"
                      aria-label="Usar modo de voz">
                [waveform bars icon]
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  </fieldset>

</div>
```

---

## 10. Animações — Catálogo Completo

### 10.1 Keyframes Definidos

**`shimmer`** — efeito de loading/skeleton de texto:
```css
@keyframes shimmer {
  0%   { transform: translate(-100%); }
  60%  { transform: translate(100%); }
  100% { transform: translate(100%); }
}
/* Duração: 1.5s, infinite — um pseudo-element desliza sobre o elemento */
```

**`shimmertext`** — shimmer adaptado para texto (gradient que percorre):
```css
@keyframes shimmertext {
  0%   { background-position: right top; }
  65%  { background-position: left top; }
  100% { background-position: left top; }
}
/* Duração: 2.25s, infinite */
```

**`blink`** — cursor de texto piscando:
```css
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
/* Duração: 4s, infinite — ritmo muito lento e suave */
```

**`pulse`** / **`pulse-dot`** — estado de loading:
```css
@keyframes pulse { 50% { opacity: 0.5; } }
@keyframes pulse-dot {
  0%, 100% { transform: scale(0.75); }
  50%       { transform: scale(1); }
}
/* pulse: 2s infinite; pulse-dot: 1.5s infinite */
```

**`dframe-dot-pulse`** — os 3 pontos animados que aparecem DURANTE a geração:
```css
@keyframes dframe-dot-pulse {
  0%, 5%    { opacity: 0.3; animation-timing-function: cubic-bezier(0.165, 0.84, 0.44, 1); }
  15%, 25%  { opacity: 1;   animation-timing-function: cubic-bezier(0.165, 0.84, 0.44, 1); }
  65%, 100% { opacity: 0.3; }
}
/* Duração: 1.8s, infinite — cada ponto tem delay diferente criando efeito cascata */
```

**`dot-aura`** — pulso de brilho ao redor dos pontos de loading:
```css
@keyframes dot-aura {
  0%   { transform: scale(1);   opacity: 0.7; }
  100% { transform: scale(2.4); opacity: 0;   }
}
```

**`claude-pulse`** — glow animado no box do input durante geração (border glow laranja):
```css
@keyframes claude-pulse {
  0% {
    box-shadow:
      rgba(217, 119, 87, 0.5) 0px 0px 10px inset,
      rgba(217, 119, 87, 0.3) 0px 0px 20px inset,
      rgba(217, 119, 87, 0.1) 0px 0px 30px inset;
  }
  50% {
    box-shadow:
      rgba(217, 119, 87, 0.7) 0px 0px 15px inset,
      rgba(217, 119, 87, 0.5) 0px 0px 25px inset,
      ...
  }
}
/* Efeito de "respiração" em laranja Anthropic durante streaming */
```

**`outline-pulse`** — anel de foco pulsante:
```css
@keyframes outline-pulse {
  0%, 100% { box-shadow: 0 0 0 1px rgb(from var(--tw-ring-color) r g b / .5); }
  50%       { box-shadow: 0 0 0 3px rgb(from var(--tw-ring-color) r g b / .5); }
}
/* 1s infinite */
```

**`spin`** — spinner de loading:
```css
@keyframes spin { 100% { transform: rotate(360deg); } }
/* Variantes: 1s, 1.2s, 1.5s, 2s — velocidades diferentes por contexto */
```

**`loading-background`** — gradiente em movimento para skeleton screens:
```css
@keyframes loading-background {
  0%,100% { background-position: 0% 0%; }
  25%      { background-position: 100% 0%; }
  50%      { background-position: 100% 100%; }
  75%      { background-position: 0% 100%; }
}
/* 2s infinite — gradiente que "orbita" o elemento */
```

**`fade` / `zoom`** — entrada de modais e popovers (Radix UI):
```css
@keyframes fade { 0% { opacity: 0; } 100% { opacity: 1; } }
@keyframes zoom { 0% { transform: scale(0.95); } 100% { transform: scale(1); } }
/* Combinados: fade 125ms + zoom 125ms para dialogs */
/* Fade 200ms ease-out para dropdowns */
```

**`accordion-open` / `accordion-close`** — animação de acordeão (ex: "Pesquisou na web"):
```css
@keyframes accordion-open {
  0%   { height: 0px;                             opacity: 0; }
  100% { height: var(--radix-accordion-content-height); opacity: 1; }
}
@keyframes accordion-close {
  0%   { height: var(--radix-accordion-content-height); opacity: 1; }
  100% { height: 0px;                             opacity: 0; }
}
/* 150ms ease-out — rápido e orgânico */
```

**`timeline-fade-in` / `timeline-collapse` / `timeline-fade-out`** — animações do painel de raciocínio/thinking:
```css
@keyframes timeline-fade-in    { 0% { opacity: 0; } 100% { opacity: 1; } }
@keyframes timeline-collapse   { 0% { grid-template-rows: 1fr; opacity: 1; }
                                  100% { grid-template-rows: 0fr; opacity: 0; } }
@keyframes timeline-fade-out   { 0% { opacity: 1; } 100% { opacity: 0; } }
/* timeline-collapse usa grid-template-rows para colapsar suavemente sem altura fixa */
```

**`_voice-pulse_`** — barras de áudio do modo de voz:
```css
@keyframes _voice-pulse_ {
  0%, 100% { height: var(--pulse-min, 8px); }
  50%       { height: var(--pulse-max, 32px); }
}
/* Cada barra tem --pulse-min e --pulse-max diferentes → efeito waveform */
```

**`_flash_`** — flash de brilho em eventos de ação:
```css
@keyframes _flash_ {
  0%   { box-shadow: 0 0 0 2px hsla(var(--accent-100) / .55),
                     0 0 16px 2px hsla(var(--accent-100) / .25); }
  100% { box-shadow: transparent 0px 0px 0px 0px; }
}
```

**`_march_`** — traço SVG animado (estilo "marching ants" para seleção ou borda de artefato):
```css
@keyframes _march_ { 100% { stroke-dashoffset: -1; } }
```

**`ping`** — indicador de notificação (badge pulsante):
```css
@keyframes ping {
  75%, 100% { transform: scale(2); opacity: 0; }
}
/* 1s infinite */
```

**`planMinimize` / `planRestore`** — colapso do painel de plano/thinking:
```css
/* planMinimize: 150ms | planRestore: 200ms */
```

**`scale-in`** — entrada de elementos com escala (popovers, tooltips):
```css
/* scale-in: 250ms */
```

**`slideDown`** — deslizamento de painéis laterais:
```css
/* slideDown: 500ms */
```

**`securitySidebarIn`** — entrada da sidebar de segurança:
```css
/* securitySidebarIn: 200ms */
```

**`bounceUpRight`** / **`look-around`** — animações de onboarding/easter eggs:
```css
/* bounceUpRight: 0.6s infinite | look-around: 2.4s infinite */
```

---

### 10.2 Transições Principais do Sistema

| Elemento | Propriedade | Duração | Easing |
|---|---|---|---|
| Layout root grid | `grid-template-rows` | 150ms | `ease-out` |
| Sidebar | `background-color, border-color, box-shadow` | 35ms | `ease-in-out` |
| Input box | `all` (sombra, borda) | 200ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Botões primários | 12 propriedades | 300ms | `cubic-bezier(0.165, 0.85, 0.45, 1)` |
| Botões secundários | 12 propriedades | 75ms | `ease-in-out` |
| Share button | 11 propriedades | 100ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Citation hover | `background-color, border-color` | 150ms | padrão |
| Chevron do tool call | `transform` | 200ms | padrão |
| Action buttons (hover) | `opacity` | 150ms | `ease-out` |
| Sidebar items (hover) | `opacity` | 75ms | padrão |
| Chat scroll border | `border-color` | 150ms | padrão |

---

## 11. Como o Claude Faz Card Design em Tempo Real

O "card design em tempo real" no Claude é um sistema de **renderização progressiva de markdown via streaming SSE**, combinando múltiplas técnicas:

### 11.1 Protocolo de Comunicação

A API do Claude usa **Server-Sent Events (SSE)** — o servidor envia tokens incrementalmente. O frontend acumula tokens e re-renderiza o DOM progressivamente. Não é WebSocket, não é polling: é um fluxo HTTP chunked unidirecional.

### 11.2 Dois Modos de Renderização

Durante o streaming, a classe `.progressive-markdown` é aplicada ao container da resposta. Quando o streaming termina, ela é trocada por `.standard-markdown`. Ambas têm o mesmo layout (`grid, grid-cols-1, gap-3`), mas a troca dispara uma nova renderização com o markdown completamente parseado.

### 11.3 Como Tabelas Aparecem em Tempo Real

Quando o Claude gera uma tabela markdown (` | col | col | `), o parser de markdown do frontend:

1. Detecta o padrão `| ... |` durante o streaming
2. Cria o `<table>` HTML com as classes de estilo antes de terminar todas as linhas
3. Vai adicionando `<tr>` e `<td>` à medida que os tokens chegam
4. A estrutura final: `div.overflow-x-auto > table.min-w-full.border-collapse`

O efeito visual é a tabela "construindo-se" linha a linha.

### 11.4 Grid CSS para Colapso do Tool Call

O bloco de "Pesquisou na web" usa um grid com `grid-template-rows: [auto_auto]` e transição `all` para criar o accordeão:

```
Estado fechado:  grid-template-rows: 39px 0px      (segunda row = 0)
Estado aberto:   grid-template-rows: 39px 1099px   (segunda row = altura real)
Transição: all   (qualquer mudança no grid-template-rows é interpolada)
```

Isso é mais eficiente que `max-height` porque não requer estimar alturas máximas artificiais.

### 11.5 Animação dos 3 Pontos Durante Geração

Durante o streaming, o Claude exibe 3 pontos animados (`dframe-dot-pulse`). Cada ponto tem um `animation-delay` diferente (ex: 0ms, 200ms, 400ms), criando efeito cascata. A `animation-timing-function: cubic-bezier(0.165, 0.84, 0.44, 1)` é a curva easeOutQuart — onset rápido, finalização suave.

### 11.6 Glow do Input Durante Streaming

Quando o Claude está gerando, o box do input recebe `claude-pulse` — um `box-shadow inset` laranja que "respira" com 50% de amplitude entre ciclos. A cor `rgba(217, 119, 87, ...)` é exatamente o `--accent-brand: hsl(14.8 63.1% 59.6%)` em RGB.

### 11.7 Renderização de Código com Tree-sitter

O bundle inclui `tree-sitter-BfScwQVn.js` — o parser incremental de código. Durante streaming de blocos de código, o tree-sitter parseia a AST do código incrementalmente (não re-parseia do início), aplicando highlight de sintaxe em tempo real. Os tokens são coloridos conforme chegam.

---

## 12. Z-Index System

```
z-toast:    60  → Notificações (topo absoluto)
z-overlay:  50  → Overlays de modal
z-dropdown: 50  → Menus dropdown
z-tooltip:  50  → Tooltips
z-modal:    40  → Dialogs modais
z-sidebar:  30  → Sidebar de navegação
z-header:   20  → Header sticky da conversa
z-[5]:       5  → Input bar sticky
z-[2]:       2  → Conteúdo do tool call
z-[1]:       1  → Input box principal / botão scroll-to-bottom
z-10:       10  → Posicionamentos internos
```

---

## 13. Sidebar

```css
nav {
  position: fixed;
  left: 0;
  width: 288px;   /* 18rem */
  height: 100vh;
  background: bg-bg-100;
  border-right: 0.5px solid hsl(var(--border-300));
  /* No desktop: gradiente sutil lg:bg-gradient-to-t from-bg-200/5 to-bg-200/30 */
  /* No mobile: shadow-lg */
  transition: background-color 35ms, border-color 35ms, box-shadow 35ms;
}
```

A transição de 35ms é propositalmente ultra-rápida — o tema muda instantaneamente sem piscar.

**Items da sidebar** usam o padrão `group-hover:opacity-100 transition-opacity duration-75` nos botões "..." que aparecem ao passar o mouse em um chat.

---

## 14. Responsividade

O sistema tem breakpoints específicos além do Tailwind padrão:

| Breakpoint | Largura | Uso |
|---|---|---|
| `sm` | 640px | Ajustes de padding |
| `md` | 768px | Sidebar oculta / layout mobile |
| `lg` | 1024px | Sidebar sticky (sai de `fixed` para `sticky`) |
| `xl` | 1280px | Expansão de max-width |
| Customizados | 840px, 1000px, 1104px, 1200px, 1400px, 1562px | Fine-tuning de layouts específicos |

A largura máxima do conteúdo