# Base de Conhecimento — Nutri-AI

Este documento descreve o funcionamento do Nutri-AI para servir de insumo à IA de
suporte (fluxo n8n): dúvidas de uso e relatos de problema dos usuários são
comparados com este conteúdo para tentar responder automaticamente por e-mail antes
de escalar para o time.

## 1. Visão Geral

Nutri-AI é uma suíte de gestão para consultórios e clínicas de nutrição no Brasil.
Reúne num só lugar: agenda, prontuário/anamnese, planos alimentares, análise de
exames laboratoriais por IA, acompanhamento de evolução, financeiro e um portal
próprio para o paciente. Interface 100% em português do Brasil.

Público principal: nutricionistas autônomos e clínicas com equipe (vários
profissionais e, às vezes, secretaria compartilhando a mesma base de pacientes e
agenda). Público secundário: o paciente, que acessa um portal separado (sem o
painel administrativo) para preencher fichas de pré-consulta e ver seu plano
alimentar.

Fluxo típico de uso: agendamento → ficha de pré-consulta enviada por link ao
paciente → consulta com registro de anamnese e dados antropométricos → geração de
plano alimentar → upload e análise de exames → acompanhamento de evolução → retorno.

## 2. Contas, papéis e acesso

- **Proprietário (owner):** dono da clínica, acesso total, gerencia equipe, dados
  da clínica e assinatura.
- **Nutricionista:** atende pacientes, cria planos, registra consultas, analisa
  exames. Pode ter CRN cadastrado no perfil.
- **Secretária:** apoio administrativo (agenda, cadastro de pacientes), sem
  necessariamente acessar a parte clínica dependendo das permissões da clínica.
- **Paciente:** não usa o painel principal. Acessa um **Portal do Paciente**
  separado, com login próprio, para ver seu plano alimentar, histórico e
  preencher fichas de pré-consulta enviadas por link (com token, sem precisar de
  conta previamente criada nesse ponto de entrada).

Cada clínica é isolada das demais (multi-tenant): dados de uma clínica nunca
aparecem para outra. Se um usuário reportar "sumiram meus pacientes" ou "estou
vendo dados errados", é sempre um problema a escalar para o desenvolvedor — nunca
comportamento esperado.

### Login, senha e primeiro acesso

- O cadastro/login é feito por e-mail e senha via Supabase Auth.
- **Esqueci minha senha:** o usuário pede recuperação informando o e-mail; recebe
  um código de 6 dígitos por e-mail (válido por 10 minutos) para definir uma nova
  senha. Não existe link mágico de redefinição, é sempre por código.
- Perfil (nome, telefone, CRN) é editado em **Ajustes → Meu Perfil**. Trocar o
  e-mail de login exige confirmar pelo link enviado ao novo endereço.

## 3. Assinatura e período de teste (trial)

- Toda clínica nova começa em um **período de teste de 14 dias** a partir da
  criação da clínica.
- Quando o trial expira sem assinatura ativa, a clínica entra em **modo somente
  leitura**: dá para consultar dados, mas não para cadastrar ou editar nada novo.
  Isso é esperado — não é um bug. A saída é assinar um plano.
- Se a assinatura estiver marcada como ativa, o acesso completo continua liberado
  (com data de expiração, se houver).

### Limite de pacientes cadastrados

- **Durante o trial de 14 dias:** limite de **5 pacientes** cadastrados.
- **No plano pago Starter** (único plano comercial disponível hoje): limite de
  **50 pacientes** cadastrados.
- Ao atingir o limite, o botão de cadastrar novo paciente fica desabilitado até
  o usuário fazer upgrade de plano (ou o trial ainda estar dentro da cota).

## 4. Agenda e Consultas

- A Agenda mostra os horários marcados por profissional/clínica.
- Confirmação de agendamento pode ser feita pelo próprio paciente por um link com
  token, sem precisar logar.
- Ao realizar a consulta, o profissional registra anamnese, dados antropométricos
  e observações clínicas — com opção de **ditado por voz** para agilizar o
  registro durante o atendimento.
- Antes da consulta, é possível enviar ao paciente uma **ficha de pré-consulta**
  por link (token), que ele preenche sem precisar de conta.

## 5. Pacientes

- Cadastro central de pacientes da clínica, com histórico de consultas, planos e
  exames vinculados.
- É possível conceder ao paciente acesso ao **Portal do Paciente** (Ajustes →
  Acesso dos Pacientes), definindo uma senha temporária e podendo bloquear/
  desbloquear esse acesso a qualquer momento sem apagar os dados clínicos dele.

## 6. Planos Alimentares

- O profissional monta o plano alimentar do paciente dentro do sistema.
- Planos podem ser **compartilhados publicamente por um link** (visualizador
  público), sem exigir login de quem recebe o link — útil para o paciente ver o
  plano no celular.
- O paciente também vê o plano vigente dentro do Portal do Paciente, quando tem
  acesso liberado.

## 7. Exames laboratoriais (análise por IA)

- O profissional faz upload do laudo (PDF ou imagem) e a IA (via um proxy que
  chama o modelo Gemini) extrai os biomarcadores do documento.
- A IA compara os valores extraídos com faixas de referência e prioriza achados
  clinicamente relevantes (ex.: tireoide, anticorpos, hormonais) acima de
  metabólitos padrão, sugerindo direcionamento nutricional funcional.
- Importante: a IA **extrai e compara dados reais do laudo, não estima valores**.
  Se o usuário relatar um biomarcador claramente errado ou ausente que estava no
  laudo, é um problema a ser escalado (possível falha de extração), não uma
  limitação esperada do produto.

## 8. Acompanhamento (Tracking) e Financeiro

- **Acompanhamento:** evolução do paciente ao longo do tempo (peso, medidas,
  outros indicadores registrados nas consultas).
- **Financeiro:** controle de valores dos serviços prestados (consultas,
  retornos), cadastrados em Ajustes → Serviços Prestados, e o lançamento
  financeiro correspondente por atendimento.

## 9. Notificações e lembretes

- O Nutri-AI **não envia notificações automáticas** (push, SMS, WhatsApp) para
  pacientes nem profissionais.
- Existe uma lista de **lembretes** interna (visível na Agenda/Dashboard), que
  funciona como uma to-do list do profissional dentro do painel — não dispara
  e-mail, push ou mensagem para ninguém, é só um controle manual de tarefas.
- Os únicos e-mails automáticos que o sistema envia hoje são: código de
  recuperação de senha, confirmação de troca de e-mail de login, e as respostas
  do fluxo de Suporte (Seção 11).

## 10. Onboarding e primeiros passos

- Ao criar a conta, a clínica passa por um fluxo de Onboarding para configurar
  dados iniciais (nome da clínica, primeiro profissional, etc.) antes de cair no
  Dashboard.
- O Dashboard reúne uma visão geral rápida do dia/semana (agenda, pendências).

## 11. Suporte — como funciona

- Em **Ajustes → Suporte**, o usuário escolhe entre "Tenho uma dúvida" ou
  "Encontrei um problema", descreve a situação e envia. Uma IA tenta responder
  consultando esta base de conhecimento; se conseguir, o usuário recebe a
  resposta por e-mail; senão, o time de desenvolvimento é avisado para responder
  manualmente.
- Se o app quebrar e cair numa tela de erro inesperado, existe um botão
  "Reportar este erro" que já envia os detalhes técnicos do problema sem o
  usuário precisar digitar nada.

## 12. Perguntas frequentes

**"Por que não consigo cadastrar/editar nada?"**
Provavelmente o período de teste de 14 dias expirou e a clínica está em modo
somente leitura. Verifique em Ajustes se há um aviso de "Período de Degustação
Encerrado" e oriente a assinar um plano para reativar o acesso completo.

**"Esqueci minha senha, como recupero o acesso?"**
Na tela de login, use "Esqueci minha senha", informe o e-mail cadastrado e use o
código de 6 dígitos recebido por e-mail (válido por 10 minutos) para definir uma
nova senha.

**"O paciente não consegue acessar o portal dele."**
Confira em Ajustes → Acesso dos Pacientes se o acesso do paciente está marcado
como "Ativo" (não bloqueado) e se ele está usando o e-mail/senha corretos. Uma
nova senha temporária pode ser definida pelo mesmo painel.

**"O link do plano alimentar/ficha de pré-consulta não abre para o paciente."**
Esses links usam token e são públicos (não exigem login). Confirme que o link foi
copiado por completo, sem cortar caracteres, e que não expirou.

**"A análise de exame veio com valor errado ou não reconheceu o exame."**
Reportar como problema (não é comportamento esperado) — a IA deve extrair os
valores reais do laudo, nunca estimar. Vale anexar/descrever qual biomarcador e
laudo específico.

**"Consigo usar o Nutri-AI em outro idioma?"**
Não; o produto é 100% em português do Brasil, voltado ao contexto clínico e
regulatório brasileiro.

**"Meu acesso está liberado para todas as funcionalidades?"**
Depende de dois fatores: (1) seu papel na clínica — proprietário tem acesso
total, nutricionista tem acesso clínico e financeiro do seu escopo, secretária
tem acesso mais administrativo (agenda/cadastro) — e (2) o status da assinatura:
durante o trial de 14 dias e com assinatura ativa o acesso é completo; se o
trial expirar sem assinatura, o sistema entra em modo somente leitura (consulta
tudo, mas não cadastra/edita nada novo).

**"Quantos pacientes eu posso cadastrar?"**
No período de teste (trial), até 5 pacientes. No plano pago Starter, até 50
pacientes. Ao atingir o limite, o botão de novo cadastro fica bloqueado até
fazer upgrade de plano.

**"Existe envio de notificações (push, SMS, WhatsApp) para pacientes ou
profissionais?"**
Não. O Nutri-AI não dispara notificações automáticas externas. Existe apenas
uma lista de lembretes interna ao painel (uma to-do list manual do
profissional), e os poucos e-mails automáticos do sistema são transacionais:
recuperação de senha, confirmação de troca de e-mail e as respostas do fluxo
de Suporte.
