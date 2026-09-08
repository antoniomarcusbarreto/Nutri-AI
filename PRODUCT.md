# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dois públicos centrais, com paridade de importância:

- **Nutricionista autônomo(a)** gerindo o próprio consultório sem apoio administrativo — faz agenda, prontuário, planos alimentares, análise de exames e financeiro sozinho(a), muitas vezes entre atendimentos ou à noite.
- **Clínicas de nutrição com equipe** — vários profissionais e, às vezes, recepção/secretaria compartilhando a mesma base de pacientes e agenda, com isolamento e papéis por clínica.

Público secundário: o **paciente**, que acessa um portal próprio e preenche fichas de pré-consulta por link, sem sidebar nem acesso ao painel clínico.

## Product Purpose

NutriAI é uma suíte de gestão para consultórios e clínicas de nutrição no Brasil. Reúne num só lugar agenda, prontuário/anamnese, planos alimentares, análise de exames laboratoriais, acompanhamento de evolução, financeiro e portal do paciente. Existe para que o nutricionista pare de costurar planilhas, WhatsApp e ferramentas genéricas, e possa focar no atendimento clínico. Sucesso é o profissional rodar a operação inteira do consultório dentro do produto, do agendamento ao retorno.

## Positioning

A suíte completa e integrada, em português, pensada para o fluxo do nutricionista brasileiro: agenda + prontuário + planos + exames + financeiro + portal do paciente conversando entre si, sem integrações de terceiros nem adaptação de um CRM genérico. Um concorrente que só faz agenda, só prontuário, ou só plano alimentar não pode reivindicar essa cobertura de ponta a ponta.

## Operating Context

- Uso diário entre consultas e em horários irregulares; sessões curtas e objetivas.
- Fluxo típico: agendamento → ficha de pré-consulta enviada por link ao paciente → consulta com registro de anamnese e dados antropométricos → geração de plano alimentar → upload e análise de exames → acompanhamento de evolução → retorno.
- Documentos externos que entram no produto: laudos laboratoriais (PDF/imagem) analisados por IA; planos alimentares compartilhados publicamente por link.
- Reconhecimento de voz disponível para ditado durante o registro clínico.
- Portal do paciente e visualizador público de plano são superfícies separadas do painel do profissional.

## Capabilities and Constraints

**Capacidades confirmadas (rotas do app):** Landing, Login, Onboarding, Dashboard, Agenda, Pacientes, Serviços, Financeiro, Consultas, Acompanhamento (Tracking), Planos alimentares, Exames, Admin Dashboard, Settings; superfícies públicas/paciente: Ficha de pré-consulta por token, Confirmação de agendamento por token, Visualizador público de plano, Portal do Paciente, Termos, Privacidade.

**IA:** análise de exames laboratoriais via Gemini (por Edge Function proxy), com extração fiel de biomarcadores, comparação matemática com valores de referência, priorização clínica (tireoide/anticorpos/hormonal acima de metabólico padrão) e parecer de conduta nutricional funcional. Prompts centralizados em `src/lib/geminiPrompts.ts`.

**Multi-tenant:** isolamento por `clinic_id` com RLS no Supabase; papéis de membro por clínica e `is_superadmin`; mudança de `is_active`/`is_superadmin` só via RPC.

**Constraints duráveis:**
- Interface e conteúdo 100% em **português do Brasil**; contexto clínico e regulatório brasileiro.
- **LGPD / dados sensíveis de saúde:** RLS por clínica, exclusão real de dados do usuário, consentimento; erros de permissão não devem vazar dados entre tenants.
- **Stack fixa:** Supabase (Auth, Postgres/RLS, Edge Functions), React 19 + Vite + TypeScript, Tailwind v4, TanStack Query, react-router 7, Recharts, ícones lucide-react. Deploy Vercel como SPA (`vercel.json` com rewrite). Firebase foi descartado — não reintroduzir.
- Service worker / PWA: se adotado, preferir network-first com versionamento de cache (nota técnica global do usuário).

## Brand Commitments

- Nome: **NutriAI**, grafado com "AI" destacado (ex.: `Nutri` + `AI` em cor primária).
- Marca-símbolo atual: maçã (`Apple`, lucide) ou monograma "N" em quadrado arredondado.
- Cor primária: teal/verde-água (escala `primary` 50–900 ancorada em `#14b8a6`/`#0d9488`).
- Tipografia atual: Inter (base), com Plus Jakarta Sans e Geist carregadas; painel interno limita títulos a peso 600 e evita negrito bruto em texto corrido (recalibração ergonômica já aplicada em `index.css`).
- Voz: direta, profissional, próxima; tratamento por "você"; foco em "focar no que importa: a saúde dos pacientes".

## Evidence on Hand

- App funcional em produção: nutri-ai-self-nine.vercel.app.
- Copy real de landing, prompts clínicos de IA e telas do produto no repositório.
- Sem depoimentos, logos de clientes, números de adoção ou benchmarks confirmados — trabalho futuro não deve fabricar prova social, métricas nem claims de conformidade.

## Product Principles

1. **Cobertura de ponta a ponta antes de profundidade em um módulo** — o valor é o fluxo inteiro do consultório num só lugar.
2. **O clínico primeiro, o administrativo depois** — prontuário, exames e planos são o núcleo; financeiro e agenda servem a eles.
3. **Fidelidade em dados clínicos é inegociável** — a IA extrai e compara, nunca estima; nenhuma tela deve induzir imprecisão numérica.
4. **Isolamento por clínica é uma garantia, não um detalhe** — cada superfície assume multi-tenant e trata erro de permissão como falha visível, não silenciosa.
5. **Português do Brasil e a realidade do nutricionista BR** guiam terminologia, fluxo e prioridades.

## Accessibility & Inclusion

Sem padrão formal estabelecido pelo usuário. Requisito de produto derivado: uso frequente em sessões curtas entre atendimentos exige alvos de toque confortáveis, contraste adequado sobre o teal e formulários clínicos longos navegáveis por teclado e compatíveis com ditado por voz.
