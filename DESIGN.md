---
name: NutriAI
description: Instrumento clínico calmo para gestão de consultórios de nutrição — cor e espaço fazem a hierarquia, nunca o peso da fonte.
colors:
  teal-brand: "#14b8a6"
  teal-brand-deep: "#0d9488"
  teal-brand-50: "#f0fdfa"
  teal-brand-100: "#ccfbf1"
  teal-brand-700: "#0f766e"
  teal-brand-800: "#115e59"
  teal-brand-900: "#134e4a"
  action-blue: "#5024fc"
  action-blue-hover: "#431cdb"
  panel-ground: "#e2e8f0"
  surface-muted: "#f1f5f9"
  surface-raised: "#ffffff"
  ink: "#0f172a"
  ink-body: "#334155"
  ink-support: "#64748b"
  hairline: "rgba(203, 213, 225, 0.5)"
  status-positive: "#059669"
  status-positive-bg: "rgba(236, 253, 245, 0.5)"
  status-critical: "#e11d48"
  status-critical-bg: "rgba(255, 241, 242, 0.5)"
  status-info: "#1d4ed8"
  status-pending: "#b45309"
  sidebar-navy: "#11162a"
  sidebar-navy-active: "#1c2342"
  sidebar-graphite: "#1a1a1a"
  sidebar-graphite-raised: "#242424"
  dark-ground: "#0b0f19"
  dark-surface: "#242424"
  dark-inset: "#1a1a1a"
  dark-hairline: "#333333"
  dark-hairline-strong: "#383838"
  dark-hover: "#2e2e2e"
  dark-ink: "#f5f5f5"
  dark-ink-support: "#b3b3b3"
  dark-ink-placeholder: "#666666"
  dark-focus-ring: "#8b6dff"
  dark-teal: "#2dd4bf"
  dark-status-positive: "#34d399"
  dark-status-critical: "#f87171"
  dark-status-info: "#818cf8"
  dark-status-pending: "#fbbf24"
typography:
  display:
    fontFamily: "Inter, Roboto, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.75rem)"
    fontWeight: 800
    lineHeight: "1.1"
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, Roboto, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "1.2"
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.4"
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1.3"
    letterSpacing: "0.05em"
rounded:
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
  3xl: "1.5rem"
  full: "9999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1.5rem"
  lg: "2rem"
  card: "1.625rem"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.surface-raised}"
    rounded: "{rounded.xl}"
    padding: "0.625rem 1.25rem"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-hover}"
    textColor: "{colors.surface-raised}"
    rounded: "{rounded.xl}"
    padding: "0.625rem 1.25rem"
  button-secondary:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink-body}"
    rounded: "{rounded.xl}"
    padding: "0.625rem 1.25rem"
  card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.3xl}"
    padding: "1.625rem"
  input:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink-body}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 0.75rem"
    typography: "{typography.body}"
  badge:
    backgroundColor: "{colors.status-positive-bg}"
    textColor: "{colors.status-positive}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.625rem"
    typography: "{typography.label}"
  sidebar-item-active:
    backgroundColor: "{colors.teal-brand-50}"
    textColor: "{colors.teal-brand-700}"
    rounded: "{rounded.lg}"
    padding: "0.75rem"
---

# Design System: NutriAI

## Overview

**Creative North Star: "O Instrumento Clínico Calmo"**

NutriAI é uma ferramenta de precisão para um profissional que a usa dezenas de vezes por dia, muitas vezes cansado, entre atendimentos. A interface trabalha para reduzir ruído e fadiga: o painel interno rejeita o branco puro agressivo em favor de um cinza-slate fosco e relaxante, os pesos de fonte são contidos (títulos nunca passam de 600, texto de apoio fica em 400), e o destaque é feito por **cor e espaço, nunca por grossura de letra**. A calma não é decoração — é o recurso principal.

O sistema tem duas faces coerentes. A **face pública** (landing, login, portal do paciente) é mais aberta e expressiva: o teal da marca aparece em gradientes, o hero usa peso extrabold, há respiro generoso. A **face de trabalho** (dashboard, agenda, prontuário, exames, financeiro) é densa, tabular e silenciosa: superfícies planas em camadas de tom, acento azul reservado para ação e números, tudo a serviço da leitura rápida de dados clínicos. As duas compartilham tipografia, escala de raio e vocabulário de status.

A profundidade vem primeiro das **camadas de tom** — o chão do painel é slate-200, os cards recuam para slate-100 fosco, elementos aninhados recuperam o branco puro para um leve efeito 3D. Sombras existem, mas são suaves e ambientes (`shadow-sm`/`shadow-md`), um reforço e não o mecanismo. O modo escuro desliga todas as sombras e se apoia só nas camadas.

**Key Characteristics:**
- Cinza fosco em vez de branco puro no painel interno; branco reservado para elementos que precisam "subir".
- Hierarquia por cor e espaço; pesos de fonte limitados a 600 (títulos) e 400–500 (corpo).
- Teal = identidade da marca; azul `#5024fc` = ação primária e métricas de destaque.
- Cantos generosos: cards em 1.5rem (rounded-3xl), botões em 0.75rem (rounded-xl).
- Quatro temas de navegação (claro, azul-navy, teal, grafite) + um modo escuro global.
- Português do Brasil em toda a interface; densidade compacta (base 15px).

## Colors

Paleta de dois acentos sobre uma base slate fria, com quatro cores de status semânticas.

### Primary
- **Teal da Marca** (#14b8a6, profundo #0d9488): identidade do produto. Aparece no logo, na landing (gradientes `from-primary-600 to-primary-400`, sombras coloridas de CTA), no sidebar tema claro (item ativo `teal-brand-50` / texto `teal-brand-700`) e no tema teal (`#115e59`). É a cor que diz "NutriAI".
- **Azul de Ação** (#5024fc, hover #431cdb): o "azul tecnológico". A camada de recalibração ergonômica o aplica a **botões primários de formulário** (Salvar/Confirmar/Agendar), ao **anel de foco de inputs**, e a **números de destaque / métricas grandes** (`text-3xl`+) no painel interno. Sinaliza ação e dado, não marca.

### Neutral
- **Chão do Painel** (#e2e8f0, slate-200): fundo de `main` em todo o app autenticado. Nunca branco.
- **Superfície Fosca** (#f1f5f9, slate-100): cards, modais e `.bg-white` rebaixado dentro do painel — "branco fosco e relaxante".
- **Superfície Elevada** (#ffffff): só para elementos aninhados que precisam de contraste 3D, inputs, e a face pública.
- **Tinta** (#0f172a, slate-900): todos os títulos, forçado sólido.
- **Tinta de Corpo** (#334155, slate-700): texto de formulário, labels, valores.
- **Tinta de Apoio** (#64748b, slate-500): legendas e textos de suporte, sempre peso 400.
- **Fio de Cabelo** (rgba(203,213,225,0.5), slate-300/50): todas as bordas e divisórias internas, unificadas para sintonia máxima.

### Status
- **Positivo / Dentro da Referência** (#059669 sobre rgba(236,253,245,0.5)): biomarcadores normais, agendamento concluído.
- **Crítico / Alerta** (#e11d48 sobre rgba(255,241,242,0.5)): biomarcadores fora da referência, cancelamentos, ação destrutiva ("Sair" usa red-600).
- **Informação** (#1d4ed8 sobre blue-50): agendamento confirmado.
- **Pendente** (#b45309 sobre amber-50): aguardando confirmação.

### Navigation themes
O sidebar e header têm quatro variantes escolhidas pelo profissional (`profile.theme_color`): **claro** (branco, acento teal), **azul** (`#11162a` navy, ativo `#1c2342`), **teal** (`#115e59` turquesa), **grafite** (`#1a1a1a`/`#242424`, acento `primary-400`, barra lateral de 4px no item ativo). O tema grafite ativa a classe `.theme-dark` global.

### Modo Escuro (tema grafite)

Quando `.theme-dark` está ativa, a camada de recalibração de `index.css` remapeia todo o painel para uma paleta grafite fechada. A profundidade vem só da escada de tom — **todas as sombras são desligadas** (ver Elevation & Depth).

**Superfícies (escada de tom):**
- **Chão** (`#0b0f19`, dark-ground): fundo de `main`.
- **Superfície de card / modal / prontuário** (`#242424`, dark-surface): o que era `bg-white`/`bg-card`.
- **Recuo aninhado / inputs / listas** (`#1a1a1a`, dark-inset): o que era `slate-50`/`slate-100`/`slate-150`.
- **Hover de superfície** (`#2e2e2e`, dark-hover): `hover:bg-slate-50` / `hover:bg-slate-100`.

**Fios de cabelo:**
- **Divisória padrão** (`#333333`, dark-hairline): bordas e `divide` de `slate-100`–`slate-300/50`.
- **Divisória nítida** (`#383838`, dark-hairline-strong): borda de cards/modais, um passo mais visível.

**Tinta:**
- **Tinta de alto contraste** (`#f5f5f5`, dark-ink): headings (forçados a `#ffffff`), texto `slate-600`–`slate-955`, valores.
- **Tinta de apoio** (`#b3b3b3`, dark-ink-support): legendas, labels, texto `slate-400`–`slate-550`.
- **Placeholder** (`#666666`, dark-ink-placeholder).

**Acentos e status (fundo opaco a ~40%, texto claro):**
- **Anel de foco** (`#8b6dff`, dark-focus-ring): a única troca do `#5024fc` no escuro — o azul de ação perde legibilidade sobre grafite, então o foco usa um lavanda mais claro.
- **Teal da marca** (`#2dd4bf`, dark-teal): `text-primary-*` e `bg-primary-50`/`bg-teal-50`.
- **Positivo** (`#34d399` sobre `rgba(6,78,59,0.4)`), **Crítico** (`#f87171` sobre `rgba(127,29,29,0.4)`), **Informação** (`#818cf8` sobre `rgba(30,58,138,0.4)`), **Pendente** (`#fbbf24` sobre `rgba(120,53,4,0.4)`).

### Named Rules
**A Regra do Branco Fosco.** No painel interno, `bg-white` renderiza como slate-100 (#f1f5f9). O branco puro só volta para elementos aninhados dentro de outra superfície branca, para criar profundidade. Branco puro de página inteira é proibido no app autenticado.

**A Regra da Cor com Propósito.** Destaque numérico e de ação usa `#5024fc`; identidade usa teal; estado usa a cor de status semântica. Nenhum desses três é intercambiável, e nenhum vira "só uma cor bonita".

**A Regra do Grafite Fechado.** No `.theme-dark`, nenhuma superfície é preta pura (`#000`) nem cinza-azulado: a rampa é `#0b0f19` → `#242424` → `#1a1a1a`, os fios são `#333333`/`#383838`, e o único acento que muda de valor é o anel de foco (`#5024fc` → `#8b6dff`). Cor de status vira fundo opaco a 40% + texto claro, nunca o par claro do tema claro.

## Typography

**Fonte primária:** Inter (com Roboto, sans-serif como fallback)
**Também carregadas:** Plus Jakarta Sans e Geist — disponíveis via `--font-internal` para superfícies internas; Inter continua sendo a voz padrão.

**Character:** Inter em pesos contidos. A personalidade vem da restrição — nada de black, nada de extrabold no painel interno. A base é reduzida a 93.75% (15px) para um leiaute compacto e elegante.

### Hierarchy
- **Display** (800, clamp ~2.25–3.75rem, line-height 1.1): apenas o hero da landing e páginas públicas de marketing. `text-transparent bg-clip-text` sobre gradiente teal permitido aqui.
- **Headline** (600, 1.875rem / text-3xl, tracking tight): título de página no painel ("Visão Geral"). Forçado a slate-900 sólido.
- **Title** (600, 1.125rem / text-lg): títulos de card e seção ("Próximos Agendamentos").
- **Body** (400–500, 0.875rem / text-sm, line-height 1.5): texto de interface, valores de formulário, linhas de tabela. Peso 500 é o teto para texto não-heading.
- **Label** (500, 0.75rem / text-xs, letter-spacing 0.05em, frequentemente UPPERCASE): rótulos de métrica nos stat cards, labels de formulário (estes em text-sm 500, mb-1, block).

### Named Rules
**A Regra do Peso Contido.** No painel interno (`main`, `.modal`, `[role="dialog"]`), qualquer `font-bold`/`font-extrabold`/`font-black` em texto que não seja heading, botão ou link é remapeado para 500. Títulos são travados em 600. Se algo precisa de ênfase, use cor ou tamanho — nunca grossura.

## Layout

Shell de aplicativo: sidebar fixa de 16rem (w-64) + área `main` rolável com header de 4rem (h-16). O conteúdo de rota vive em um container com padding de 2rem (`p-8`); no print, o padding zera e a sidebar/header somem.

Grids de conteúdo: stat cards em `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` com gap de 1.5rem; seções divididas em `lg:grid-cols-2` com gap de 2rem. Formulários usam `max-w-5xl mx-auto` e `space-y-6`, com blocos em cards de `p-5 rounded-2xl`.

Densidade: compacta por escolha (base 15px). Ritmo vertical entre seções de página é `space-y-8`. Cards internos usam padding de ~1.625rem (`p-6.5`).

Responsivo: um único breakpoint dominante em ~1024px (lg) separa layout de coluna única (mobile/tablet) de multi-coluna. Cabeçalhos de página empilham (`flex-col sm:flex-row`) abaixo de sm.

### Grade do mês da Agenda (`components/agenda/AgendaMonthGrid`)

Extraída de `pages/Agenda.tsx` no `/impeccable layout`. Tese espacial: a superfície é para **varrer a carga do mês e ver alertas**, não para ler cada consulta. Modelo: célula `min-h-[124px] p-2`, grade de 7 colunas com `gap-px` sobre `bg-slate-200/70` (as linhas são a divisória — sem borda nas células). Número do dia em `text-sm` como âncora; badge de contagem + badge âmbar de "atenção" (nº de consultas passadas sem prontuário) no canto — o alerta sobe ao nível do dia, não fica só no chip. Chips: `text-xs` (piso de 12px — antes 8–11px), `HH:mm` + primeiro nome + iniciais do profissional; 3 visíveis + "+N mais". Cada chip é `<button>` (foco por teclado). `min-w-[720px]` com scroll horizontal no container em telas estreitas (mobile usa as visões dia/semana). Verificado com screenshots desktop 1440 + mobile 390.

## Elevation & Depth

Sistema híbrido, **camadas de tom primeiro**. A profundidade principal é uma escada de superfícies: `#e2e8f0` (chão) → `#f1f5f9` (card) → `#ffffff` (elemento aninhado / input). Sombras são um reforço ambiente sutil, nunca o mecanismo estrutural. No modo escuro (`.theme-dark`) todas as sombras são removidas e a escada de tom (`#0b0f19` → `#242424` → `#1a1a1a`) carrega a profundidade sozinha.

### Shadow Vocabulary
- **Sutil / Repouso** (`box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05)` — shadow-sm): estado padrão de cards, inputs, botões, header. A maioria das superfícies vive aqui.
- **Ambiente / Card de conteúdo** (`shadow-md`): stat cards com gradiente e cards de destaque em repouso.
- **Hover** (`shadow-xl` + `translateY(-2px)`): resposta de elevação em stat cards e CTAs interativos.

### Named Rules
**A Regra da Escada de Tom.** Antes de adicionar uma sombra para separar dois elementos, tente uma diferença de superfície (slate-200 vs slate-100 vs branco). A sombra só entra quando a escada de tom já foi usada e ainda falta separação.

## Shapes

Linguagem de cantos generosa e suave, escalando com o tamanho do elemento:

- **Inputs e chips pequenos:** 0.5rem (rounded-lg).
- **Botões e badges internos:** 0.75rem (rounded-xl).
- **Controles agrupados, blocos de formulário, pills de navegação de mês:** 1rem–1.25rem (rounded-2xl).
- **Cards de conteúdo e stat cards:** 1.5rem (rounded-3xl).
- **Avatares, badges de status, indicadores:** totalmente redondo (rounded-full).

Bordas são sempre o fio de cabelo slate-300/50 de 1px. Ícones vêm do `lucide-react` em traço de ~1.5–2px, dimensionados 16–24px (h-4 a h-6). Gradientes são reservados: `bg-gradient-to-br` nos stat cards (cada métrica com seu par de cores) e `bg-gradient-to-r` teal→indigo no botão de análise de IA.

## Components

### Buttons
- **Shape:** 0.75rem (rounded-xl) para botões de ação; badges e toggles menores em rounded-lg/full.
- **Primary:** fundo `#5024fc`, texto branco, peso 600, padding `0.625rem 1.25rem` (py-2.5 px-5), `shadow-sm`. É o botão de submit de formulário e a ação primária de página.
- **Hover / Focus:** fundo escurece para `#431cdb` com `opacity: 0.9`; transição de 0.2s em background e opacity.
- **Secondary (Cancelar/Fechar):** fundo slate-100 (`#f1f5f9`), texto slate-700, peso 500, mesmo raio e padding; hover para slate-200.
- **Landing (público):** pill totalmente redonda (`rounded-full`), fundo `primary-600`, com sombra colorida (`shadow-primary-500/30`) e micro-interação `hover:-translate-y-1` / `hover:scale-105`.
- **Ação especial de IA:** largura total, gradiente `from-teal-600 to-indigo-600`, `rounded-xl`, peso 600.

### Chips / Badges
- **Status de agendamento:** pill redonda, `px-2.5 py-0.5`, text-xs, ícone lucide de 12px + rótulo, fundo de status a 50 e borda a 100. Concluído (emerald), Confirmado (blue), Cancelado (rose), Pendente (amber).
- **Rótulo de métrica em card:** pill `bg-white/15 backdrop-blur-md` sobre o gradiente do stat card.

### Cards / Containers
- **Corner:** 1.5rem (rounded-3xl) para cards de conteúdo; 1rem (rounded-2xl) para blocos de formulário.
- **Background:** `#ffffff` na marcação, renderizado como `#f1f5f9` fosco pela camada de recalibração; `#242424` no modo escuro.
- **Shadow:** `shadow-sm` em repouso (ver Elevation).
- **Border:** fio de cabelo slate-300/50 de 1px; hover pode escurecer para slate-300.
- **Padding:** ~1.625rem (p-6.5) em cards de conteúdo; p-5 em blocos de formulário.
- **Stat card (variante):** gradiente `bg-gradient-to-br` por métrica, texto branco, ícone em placa `bg-white/15 backdrop-blur-md`, `border-white/10`, `shadow-md` → `shadow-xl` + lift no hover.

### Inputs / Fields
- **Style:** fundo branco, borda slate-200 de 1px, 0.5rem (rounded-lg), padding `0.5rem 0.75rem` (py-2 px-3), text-sm, texto slate-700, `shadow-sm`. Labels acima, slate-700, peso 500, text-sm, mb-1, block.
- **Focus:** borda vira `#5024fc` e anel de 1px `#5024fc` (`box-shadow: 0 0 0 1px #5024fc`); sem outline. Alguns formulários públicos usam anel de 2px `primary-500/20` e trocam o fundo de `slate-50/30` para branco no foco.
- **Rodapé de ações do formulário:** `flex justify-end`, gap-3, `pt-6`, borda superior slate-100, `mt-6`.

### Navigation (sidebar)
- **Style:** coluna de 16rem, item de nav em `flex gap-x-3 rounded-md p-3 text-sm font-medium` (peso 500), ícone lucide de 20px.
- **Estados (tema claro):** ativo = `bg-primary-50` + texto `primary-700` + ícone `primary-600`; inativo = texto slate-700, hover `bg-slate-50` + texto `primary-600`. Ícone inativo slate-400 → primary-600 no hover do grupo.
- **Temas navy/teal/grafite:** invertem para superfície escura com texto claro; grafite adiciona barra lateral de 4px `primary-500` no item ativo.
- **Superadmin:** item "Painel Master" (ícone Shield) fixado no topo.
- **Rodapé:** Configurações + "Sair" (texto red-600, hover `bg-red-50`), separados por borda superior.
- **Mobile (`<lg`):** a sidebar vira drawer com backdrop (`Layout.tsx`) — `role="dialog"` + `aria-modal`, fecha no `Escape`, trava o scroll do body, fecha ao trocar de rota. O header ganha um botão de menu (`lg:hidden`). Skip link "Pular para o conteúdo" precede tudo.

### Painel de Análise de IA (signature)
Área rolável do "Assistente de IA Nutricional". Estado vazio: ícone Sparkles em disco `bg-gradient-to-tr from-indigo-50 to-primary-50` que se assenta uma vez na montagem (`ia-settle`), título text-base 600, parágrafo slate-500, e botão de ação em gradiente teal→indigo largura total. Estado preenchido: lista de alertas com tamanho de fonte configurável (`sm`/`base`/`lg`/`xl`), parecer clínico em texto corrido, e tabela de biomarcadores com indicador de evolução por linha. O tamanho de fonte ajustável é uma afordância real da tela — o profissional lê isso em voz alta para o paciente.

## Motion

Tese: **"Instrumento Clínico Calmo" — um beat, nunca um loop.** Movimento serve feedback, estado e continuidade; nada de bounce/elastic (banido) nem laço decorativo perpétuo. Desaceleração confiante: `cubic-bezier(0.16, 1, 0.3, 1)`.

- **`ia-settle`** (380ms): assentamento único de um ícone de estado vazio/erro na montagem — `translateY(8px) scale(0.94) → 0/1`. O usuário chega num estado de repouso, não numa animação.
- **`ia-pop`** (460ms): a única entrada com energia, reservada para O momento autorado — o check de confirmação do agendamento (`ConfirmAppointment`), quando o paciente acabou de agir. Scale `0.72 → 1.04 → 1`.
- **`animate-in fade-in slide-in-from-bottom-*`** (Tailwind): entrada de rota/seção. Uma vez.
- **Feedback ao vivo / espera**: `animate-pulse` (opacidade) para "gravando" e loaders; `animate-pulse-subtle` (2.2s, mais discreto) para CTAs de IA em espera; spinners só giram.
- **`prefers-reduced-motion`**: bloco global em `index.css` — `ia-settle`/`ia-pop`/`animate-in` caem para `rm-fade` (só opacidade, 160ms); pulsos ficam mais lentos e suaves; feedback essencial permanece.

### Primitivos de UI (`src/components/ui/`)

1ª onda do design system, extraída da camada de recalibração `!important` de `index.css` (auditoria P1.4). Objetivo: mover a identidade visual para componentes com API tipada e acessibilidade embutida; ondas seguintes migram o restante das telas e então aposentam as regras globais redundantes. Enquanto a migração não termina, os componentes emitem marcação **compatível** com a camada `!important` (renderizam idêntico).

- **`<Button>`** — `variant`: `primary` (Azul de Ação `#5024fc`, submit/ação primária), `secondary` (slate-100, cancelar/fechar), `danger` (rose-600), `ghost`. `size`: `md` / `sm` / `icon`. Props `loading` (spinner + `aria-busy` + disable) e `fullWidth`. `type` default `button`. Raio `rounded-xl`, `shadow-sm`, foco herda a regra `:focus-visible` global.
- **`<Card>`** — shell `bg-white shadow-sm border` (renderiza slate-100 fosco pela Regra do Branco Fosco). `padding`: `md` (p-6.5) / `sm` (p-5) / `xs` (p-4) / `none`. `radius`: `3xl` (default, cards de conteúdo) / `2xl` (blocos de formulário). `interactive` (hover `shadow-sm → shadow-md`). `as`: `div` / `section` / `article`. `className` é mesclado com `tailwind-merge` (via `lib/cn.ts`), então a chamada sobrescreve o default sem travar.
- **`<Input>` / `<Select>` / `<Textarea>`** (onda 4) — encapsulam o "Golden Standard" que a camada `!important` força em `main input/select/textarea` (`py-2 px-3 text-sm rounded-lg border-slate-200 bg-white text-slate-700 shadow-sm` + anel de foco `0 0 0 2px #fff, 0 0 0 4px #5024fc`). Props `label` (liga `htmlFor`/`id` via `useId`), `hint`, `error` (marca `aria-invalid` + `aria-describedby`), `required` (asterisco rose). `<Select>` adiciona `appearance-none` + chevron próprio; `<Textarea>` tem `min-h-[80px] resize-y`. Constantes `INPUT_BASE` / `FIELD_LABEL` exportadas para casos que precisam só das classes.
- **`<PageHeader>`** — par `<h1>` (headline, travado em 600/slate-900) + `description` opcional + slot `actions` à direita + `icon` opcional. Substitui o header inconsistente de cada rota (`font-extrabold` vs `font-semibold` vs `text-2xl`).
- **`<FormActions>`** — rodapé `flex gap-3 pt-6 mt-6 border-t`. `align`: `end` (padrão) / `between` / `start`. Botão primário por último.
- **`<EmptyState>`** — bloco tracejado `border-2 border-dashed rounded-3xl` + `icon` / `title` / `description` / `action`. `size`: `md` / `sm`.
- **`<Modal>`** (harden) — portal + `role="dialog"` + `aria-modal` + `aria-labelledby`/`aria-describedby`, armadilha de foco (Tab cicla dentro), Escape, restauração do foco ao fechar, trava de scroll do body, clique no backdrop. Painel `bg-white bg-white-pure` (branco puro real — modal é a exceção à Regra do Branco Fosco no primitivo, para casar com os modais atuais), `rounded-3xl`, header `bg-slate-50/50` com `badge` opcional + título + X, corpo rolável, `footer` opcional. `size`: `sm`/`md`/`lg`; `dismissible` (padrão true). Botão primário do rodapé submete o form via `form="<id>"`.
- **`<ConfirmDialog>`** (harden) — decisão destrutiva "ícone + pergunta + Cancelar/Confirmar". `role="alertdialog"`, foco inicial no **Cancelar** (opção segura), Escape cancela, trava de scroll. `tone`: `danger` (padrão) / `primary`.

**Migração de modais legados** (`<div className="fixed inset-0">` sem semântica → primitivos): **completa** — todos os 16 modais do app usam `<Modal>` ou `<ConfirmDialog>`. `<Modal>` ganhou `size="xl"` (max-w-3xl) para modais de conteúdo largos e `badge` para a etiqueta indigo acima do título. O modal de PDF (`<iframe>`) usa `size="xl"` com o iframe em `h-[68vh]`.

**Resiliência (harden):** `ErrorBoundary` no root (`components/ErrorBoundary.tsx`) — crash de renderização vira tela recuperável ("Tentar novamente" limpa só `localStorage` `nutri-ai:*`, nunca a sessão, e recarrega). Skip link "Pular para o conteúdo" no `Layout` (`sr-only` → visível no foco, alvo `#conteudo`).

**Migrado:**
- 1ª onda — Dashboard (completo: header, cards, empty states, botão), Financial, Patients (header).
- 2ª onda — `<PageHeader>` em **todas** as rotas do painel: Agenda, Settings, Consultas, Acompanhamento, Exames, Planos Alimentares, Serviços. Elimina a divergência de `<h1>` (`font-extrabold` vs `font-semibold` vs `text-2xl font-bold`).

- **Onda 4:**
  - `Services.tsx` (piloto) — ponta a ponta: `<Card radius="2xl" interactive>`, `<Button>`, `<EmptyState>`. Primitivos `<Card>` flexível + `<Input>` + `<Select>` criados aqui.
  - `Settings.tsx` — ponta a ponta: 6 cards de seção → `<Card as="section" padding="none" radius="2xl">` (mantendo o `shadow-[custom]` via `className` mesclado), ~24 campos de formulário → `<Input>`/`<Select>` (incluindo os 2 modais e os 2 campos de busca, agora com `aria-label`), 2 rodapés → `<FormActions>`, cards de membro/paciente → `<Card padding="sm" interactive>`. Campos de busca: `pl-10` (que a camada `!important` engolia, sobrepondo o ícone ao texto) → `pl-12` (exceção sancionada da camada). Verificado com screenshot desktop+mobile.
  - `Consultations.tsx` — **migração parcial por natureza**: o form Ficha Clínica/Anamnese (4 `<Textarea>` + 3 `<Input>` + 1 `<Select>` + `<FormActions>`), 3 stat cards → `<Card padding="xs" interactive>`; `ConsultationForm.tsx` 3 shells de bloco → `<Card padding="sm">`. **Deixado bespoke de propósito** (não é card/campo genérico): a área de trabalho split (sidebar de filtro + painel de lista com `min-h`/sticky header), o pill de filtro (`<select bg-transparent border-0>` dentro de um contêiner estilizado com ícone), o gravador de áudio, e os rótulos uppercase de "grade de entrada de dados" (antropometria) — todos já normalizados pela camada `!important` nos pontos que importam. `<Textarea>` criado nesta onda.
  - `Exams.tsx` — **sem alvos de primitivo**: a rota é 100% área de trabalho bespoke (painéis `bg-card-premium` com `h-[calc(100vh-…)]` e scroll interno, dropzone de arraste, o painel-assinatura de IA). Nada é `<Card>`/`<Input>`/`<Select>` de forma limpa; a busca é `type="text"` já normalizada pela camada. Migrar aqui seria regressão de layout.
  - `Agenda.tsx` — form Novo Agendamento (3 `<Select>` + `<Input>` busca + `<Input type=date/time>`) e form Reagendar (`<Input>` + `<Textarea>`); CTA "Novo Agendamento" → `<Button>`. **Bespoke preservado:** grade do calendário + `overflow-x-auto`, pill de filtro `<select bg-transparent>` no header.
  - `Tracking.tsx` — só o `<select>` de paciente do header → `<Select>` (com `aria-label`). **Bespoke preservado:** cards de gráfico (`rounded-xl border-2 border-slate-300 shadow-md`, contêiner do Recharts).
  - `MealPlans.tsx` — card "Parâmetros da Dieta" → `<Card>`; `<Select>` paciente + `<Input>` meta kcal; 2 botões de ação → `<Button fullWidth>`. **Bespoke preservado:** editor de dieta denso e todos os inputs com modificadores `print:` (painéis de impressão), cards de contexto com toggle, shell do visualizador de plano (`flex-1` + `print:!*`).

**Fase 5 — `index.css` sem `!important` (feito):** toda a camada de recalibração, os temas (`.theme-dark`, `html[data-theme="blue"]`) e o anel de foco global `:focus-visible` agora funcionam **pela cascata nativa, com zero `!important`** (174 → 0 no design system). Como isso funciona — o **Contrato de Cascata** documentado no topo do `index.css`:
1. O bloco é *unlayered*; os utilitários do Tailwind v4 ficam em `@layer utilities`. Declaração normal sem camada vence qualquer declaração em camada → `main .text-slate-500 { color: … }` já ganha de `.text-slate-500`.
2. As 3 regras que os temas precisavam sobrescrever (matte `bg-white`, `bg-white` aninhado, `label`) foram baixadas a (0,1,0)/(0,0,1) via `:where()`, para que `.theme-dark .bg-white` (0,2,0) etc. vençam por especificidade.
3. `html[data-theme="blue"]` (0,1,1) vence `:root`/`@theme` (0,1,0) por especificidade; a suppressão de foco do Recharts subiu a (0,3,1) para vencer o anel global.

`!important` restante: **só em `@media (prefers-reduced-motion)` (reset WCAG 2.3.3, padrão MDN) e `@media print`** — fora do escopo do design system, defensivo e correto.

**Ainda NÃO removido — o bloco de re-skin de utilitários (`index.css` ~92–260):** é infra viva. `<Card>`/`<EmptyState>` emitem `bg-white` de propósito e dependem da regra matte; ~80 superfícies `bg-white` bespoke preservadas e centenas de `font-black`/`font-extrabold` em texto de corpo espalhados pelas 12 rotas dependem da contenção de peso e da hierarquia de cor. Deletar exige: `<Card>`/`<EmptyState>` emitindo o tom fosco direto (via token) + auditoria de cada `bg-white`/`font-black` bespoke. É uma migração própria. Mas o bloco **não é mais "brutal"** — é CSS cascade-native, limpo e comentado.

**Feito (colorize):** botões de ação primária e submit do painel interno migraram de `bg-primary-600`/`bg-teal-600` para `bg-[#5024fc] hover:bg-[#431cdb]` (AdminDashboard, Agenda, Consultas, Planos, Pacientes, Configurações, Serviços). As superfícies públicas/de entrada (Landing, Login, Onboarding, ConfirmAppointment, PreConsulta, visualizadores públicos) **permanecem no teal da marca** — é a face pública. Botões primários pequenos (`text-xs`) subiram para `text-sm`.

## Do's and Don'ts

### Do:
- **Do** usar `#e2e8f0` como fundo de qualquer superfície de painel interno e deixar cards recuarem para `#f1f5f9`.
- **Do** sinalizar ação primária e números de destaque com `#5024fc`; manter o teal da marca para identidade e face pública.
- **Do** limitar títulos a peso 600 e texto de apoio a 400; criar ênfase com cor ou tamanho.
- **Do** usar as quatro cores de status semânticas (emerald/rose/blue/amber a 600 sobre fundo a 50) para todo estado de agendamento e biomarcador.
- **Do** arredondar cards em 1.5rem (rounded-3xl) e botões em 0.75rem (rounded-xl).
- **Do** tentar uma diferença de superfície antes de adicionar sombra para separar elementos.
- **Do** escrever toda a interface em português do Brasil.
- **Do** respeitar os quatro temas de navegação e o modo escuro — testar novas telas em `.theme-dark` (sem sombras).

### Don't:
- **Don't** usar branco puro (#ffffff) como fundo de página no app autenticado.
- **Don't** aplicar `font-bold`/`font-extrabold`/`font-black` a texto de corpo no painel interno.
- **Don't** trocar teal e `#5024fc` — não são a mesma cor com papéis diferentes.
- **Don't** usar `text-transparent bg-clip-text` sobre gradiente fora da face pública de marketing.
- **Don't** depender de sombra dramática (`shadow-2xl`) para hierarquia; ela some no modo escuro.
- **Don't** introduzir uma quinta cor de status ou um segundo acento sem atualizar este documento.
