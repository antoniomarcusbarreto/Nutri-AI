# Base de Conhecimento — Nutri-AI

Este documento descreve o funcionamento do Nutri-AI para servir de insumo à IA de
suporte (fluxo n8n): dúvidas de uso e relatos de problema dos usuários são
comparados com este conteúdo para tentar responder automaticamente por e-mail antes
de escalar para o time.

Última revisão: 16/10/2026.

## 1. Visão Geral

Nutri-AI é uma suíte de gestão para consultórios e clínicas de nutrição no Brasil.
Reúne num só lugar: agenda (com agenda online para o paciente), prontuário e
anamnese, planos alimentares, análise de exames laboratoriais por IA, avaliação
corporal, acompanhamento de evolução, teleconsulta por vídeo, financeiro, triagem
de novos pacientes, um co-piloto de IA para a equipe e um portal próprio para o
paciente. Interface 100% em português do Brasil.

Público principal: nutricionistas autônomos e clínicas com equipe (vários
profissionais e, às vezes, secretaria). Público secundário: o paciente, que usa o
**Portal do Paciente** (separado do painel da equipe).

Fluxo típico de uso: triagem do novo paciente (link público) → cadastro e convite
para o portal → paciente preenche a ficha de saúde no portal → agendamento
(pela equipe ou pelo próprio paciente na agenda online) → lembrete e confirmação
pelo WhatsApp → consulta presencial ou teleconsulta, com anamnese e antropometria
→ plano alimentar → exames analisados pela IA → acompanhamento da evolução →
retorno.

Menu principal do painel: Dashboard, Acompanhamento, Agenda, Consultas, Exames,
Financeiro, Pacientes, Triagem, Planos Alimentares e Ajustes. Alguns itens só
aparecem para quem é profissional (ver Seção 2).

## 2. Contas, papéis e acesso

- **Proprietário (owner):** dono da clínica. Gerencia equipe, dados da clínica,
  serviços e assinatura, e também atende como nutricionista.
- **Nutricionista:** atende pacientes, registra consultas, cria planos, analisa
  exames, faz teleconsultas. Pode ter CRN cadastrado no perfil.
- **Secretária:** apoio administrativo. Vê a Agenda, Pacientes (cadastro) e
  Financeiro (somente recebimentos) de toda a clínica, mas **não** vê dados
  clínicos: Acompanhamento, Consultas, Exames, Planos Alimentares e Triagem não
  aparecem para ela. Também não vê despesas nem o resultado financeiro. Isso é
  esperado, não é um bug.
- **Paciente:** não usa o painel da equipe. Entra no **Portal do Paciente**
  (Seção 6) com o próprio e-mail e senha.

### Quem vê quais pacientes

- Cada clínica é isolada das demais: dados de uma clínica nunca aparecem para
  outra.
- Dentro da clínica, **cada nutricionista (inclusive o proprietário) vê só os
  próprios pacientes**. Se um nutricionista diz "não vejo os pacientes do meu
  colega", isso é o comportamento esperado.
- Para ver os pacientes de um colega, use **Ajustes → Compartilhamento**: o
  nutricionista pede acesso, escolhe o prazo (7, 30, 90 dias ou sem prazo até
  revogar) e o colega aprova ou recusa. O proprietário não libera esse acesso
  sozinho; é sempre o dono dos pacientes quem aprova.
- Se alguém relatar "sumiram meus pacientes" ou "estou vendo pacientes de outra
  clínica", é um problema a escalar para o desenvolvedor.

### Login, senha e primeiro acesso

- Cadastro e login por e-mail e senha.
- **Esqueci minha senha:** na tela de login, informar o e-mail; chega um código
  de 6 dígitos por e-mail (válido por 10 minutos) para definir a nova senha. Não
  existe link de redefinição, é sempre por código. Dá para pedir um novo código
  depois de 60 segundos, e são no máximo 5 tentativas por código.
- Se o código não chegar: conferir se o e-mail digitado é exatamente o
  cadastrado (letra trocada é a causa mais comum) e olhar a caixa de spam. Por
  segurança, a tela mostra sucesso mesmo quando o e-mail não existe.
- Perfil (nome, telefone, CRN) em **Ajustes → Meu Perfil**. Trocar o e-mail de
  login exige confirmar pelo link enviado ao novo endereço.
- Ao criar a conta, a clínica passa por um Onboarding (nome da clínica etc.)
  antes de chegar ao Dashboard.

## 3. Assinatura, período de teste e limites

- Toda clínica nova começa com **14 dias de teste grátis**, sem cartão de
  crédito, contados da criação da clínica. Ajustes mostra quantos dias restam.
- Quando o teste termina sem assinatura ativa, a clínica entra em **modo somente
  leitura**: dá para consultar tudo, mas não cadastrar nem editar. Ajustes mostra
  o aviso "Período de Degustação Encerrado". É esperado; a saída é assinar.
- Assinatura ativa com data de término vencida também volta para somente
  leitura.

### Planos

Todos os planos têm todas as funcionalidades (portal do paciente, agenda online,
teleconsulta, lembretes pelo WhatsApp, exames, prontuário e co-piloto com IA). O
que muda é o tamanho da equipe.

- **Autônomo — R$ 99,90/mês ou R$ 999/ano:** 1 nutricionista + 1 secretária.
- **Clínica / Equipe — R$ 249,90/mês ou R$ 2.499/ano:** até 3 nutricionistas,
  secretárias sem limite (sem acesso a dados clínicos), compartilhamento de
  pacientes entre nutricionistas e agenda/financeiro da clínica inteira numa
  visão só.
- No plano anual, o valor equivale a 10 mensalidades (2 meses grátis).
- Mais de 3 nutricionistas: R$ 79,90/mês por nutricionista adicional no plano
  Clínica / Equipe.
- WhatsApp com o número próprio da clínica ou plano sob medida: sob consulta,
  pelo e-mail suporte@codehatch.com.br.

### Pacientes sem limite

Não há limite de pacientes cadastrados em nenhum plano, nem durante o teste. O
botão de novo paciente só fica bloqueado quando a clínica está em modo somente
leitura.

## 4. Dashboard

Tela inicial da equipe, pensada para responder "o que faço agora?":

- **Primeiros passos** (só proprietário, pode ser dispensado).
- **Agenda de hoje.**
- **Pendências:** consultas sem confirmação nas próximas 48 h (com botão para
  mandar lembrete pelo WhatsApp), pacientes com ficha de saúde vazia, exames sem
  análise, pacientes atendidos sem plano alimentar há 30 dias, pacientes sem
  retorno há mais de 45 dias, pedidos de pacientes no portal e novos pedidos da
  Triagem.
- **Resultados do mês:** consultas, comparecimento (concluídas ÷ consultas
  passadas não canceladas) e outros números.
- **Financeiro** do mês e **Lembretes** (uma lista de tarefas interna, que não
  envia nada para ninguém).

## 5. Agenda e Consultas

- A Agenda mostra as consultas por dia, semana e mês. Cada consulta tem duração
  própria e pode ser **presencial** ou **online** (teleconsulta, Seção 9).
- A equipe pode encaixar consultas em horário já ocupado: a Agenda só avisa o
  conflito, não impede.
- **Horários de atendimento:** cada nutricionista configura em **Ajustes →
  Horários** a grade semanal, intervalo entre consultas, de quanto em quanto
  tempo oferecer horários, antecedência mínima e até quantos dias à frente o
  paciente pode marcar, além de bloqueios (toda semana, numa data ou num
  período). É essa grade que o paciente vê na agenda online.
- **Agenda online:** pelo portal, o paciente escolhe um horário livre para
  remarcar ou pedir retorno. O pedido chega para a equipe, que aceita, recusa ou
  sugere outra data. A sugestão só vale quando o paciente aceita. O fuso é o de
  Brasília e a antecedência mínima padrão é de 12 horas.
- **Confirmação:** o paciente confirma ou desmarca pelo link de confirmação ou
  pelo WhatsApp (Seção 10), **só até o horário da consulta**. Depois disso o
  link ainda abre, mas não permite mais mudar.
- **Registro da consulta (Consultas):** anamnese, antropometria e observações,
  com **ditado por voz** e organização do texto pela IA no formato SOAP.
- A cobrança da consulta nasce automaticamente ao agendar (Seção 13).

## 6. Pacientes e Portal do Paciente

- Cadastro central em **Pacientes**, com histórico de consultas, planos, exames e
  avaliações.
- **Prazo de acesso (definido pelo nutricionista):** ao liberar o portal, o
  nutricionista escolhe por quanto tempo o paciente terá acesso — 30, 60, 90 ou
  180 dias, ou até uma data específica. O normal é acompanhar a duração do
  tratamento. Depois do prazo, o portal fica **somente leitura** (o paciente vê
  plano e consultas, mas não confirma nem remarca). Dá para estender o prazo
  ("Mudar o prazo" / "Renovar acesso") ou encerrar o acesso a qualquer momento,
  sem apagar os dados.
- **Convite (primeiro acesso):** junto com o prazo, gera-se um link de convite
  para o paciente criar a própria senha. É preciso ter o e-mail do paciente
  cadastrado. As **72 horas valem só para esse link de convite** (uso único), não
  para o acesso ao portal: depois que o paciente cria a senha, ele entra
  normalmente até o fim do prazo escolhido pelo nutricionista. Quem abre o
  convite recebe um código no e-mail cadastrado. A equipe não define senha do
  paciente. Se o convite vencer antes de ser usado, basta gerar outro.
- **Enviar link:** para quem já criou a senha, a janela de acesso mostra o link
  de entrada com mensagem pronta para copiar, mandar por WhatsApp ou e-mail.
- **Ajustes → Acesso dos Pacientes:** lista quem tem acesso e permite bloquear
  ou desbloquear temporariamente.

### O que o paciente faz no portal

- Vê o **plano alimentar** vigente e as **consultas**; remarca ou pede retorno
  pela agenda online; entra na teleconsulta.
- Preenche a **ficha de saúde** (substituiu o antigo link público de ficha de
  pré-consulta).
- **Diário alimentar:** registra refeições por foto, galeria ou texto; a IA
  identifica os itens e estima os macros; o paciente revisa e marca se comeu
  tudo, metade ou pouco. O nutricionista vê o diário em Acompanhamento.
- **Avaliação corporal:** envia medidas com fita e/ou fotos quando o
  nutricionista pede.
- **Assistente:** chat de IA que responde com base no plano e no diário do
  paciente (receitas, trocas, lista de compras). Só leitura; não altera o plano.
- **Problema no app?** no Perfil do portal: envia relato ao suporte. Dúvidas
  sobre o tratamento devem ir direto à clínica.

## 7. Triagem de novos pacientes

- Cada nutricionista tem um link público próprio (`/n/<seu-link>`) para divulgar
  nas redes. O interessado preenche um formulário em 4 passos (contato, objetivo,
  saúde, finalizar), sem precisar de conta.
- Os pedidos aparecem em **Triagem** (badge no menu) e nas pendências do
  Dashboard. A IA organiza o pedido e o sistema avisa se a pessoa **já é
  paciente** (por WhatsApp, e-mail ou nome + nascimento).
- **Aceitar** cadastra o paciente com um clique (ou completa o cadastro
  existente). Nada é cadastrado automaticamente. Depois de aceitar, o caminho é
  mandar o convite do portal para o paciente marcar a consulta.
- Só o nutricionista dono do link vê os pedidos dele; a secretária não vê.
- Se a mesma pessoa reenviar o formulário com o mesmo WhatsApp em até 7 dias, o
  pedido é atualizado em vez de duplicado.

## 8. Planos Alimentares

- O nutricionista monta o plano dentro do sistema, refeição por refeição.
- O paciente vê o plano vigente no portal. Também existe um link público de
  visualização do plano.

## 9. Teleconsulta (consulta online)

- Ao agendar, escolher a modalidade **online**. Na hora, o nutricionista e o
  paciente entram pela própria plataforma (o paciente pelo portal). Não precisa
  de Zoom, Meet nem instalar nada; funciona no navegador do computador ou do
  celular.
- Só entram o nutricionista responsável e o paciente daquela consulta.
- Com o **consentimento** do paciente, a chamada pode ser **transcrita**. Ao
  terminar, o nutricionista revisa a transcrição e um **resumo feito pela IA**
  (editável) e escolhe **Salvar no histórico** ou **Descartar**. Até salvar, fica
  como rascunho visível só para ele.
- As teleconsultas salvas ficam na aba **Teleconsultas** do Acompanhamento.
- Problemas de câmera/microfone: conferir se o navegador tem permissão para usar
  câmera e microfone e se outro app não está usando a câmera.

## 10. Lembretes por WhatsApp

- O Nutri-AI envia **lembrete de consulta pelo WhatsApp** a partir de um número
  central da plataforma, em nome da clínica. O paciente confirma ou desmarca
  respondendo à mensagem, e a Agenda é atualizada sozinha.
- Ativar em **Ajustes → Dados da Clínica**, escolhendo a antecedência (12, 24 ou
  48 horas antes; padrão 24).
- Só vai para consultas **pendentes** e **futuras** de pacientes com telefone
  cadastrado. Quem responde "SAIR" deixa de receber.
- **Envio manual:** a equipe pode mandar o lembrete na hora pelo detalhe da
  consulta, pelo botão "Enviar aos não confirmados" (visão Dia da Agenda) ou
  pelas pendências do Dashboard. Chega em poucos minutos. Há um intervalo mínimo
  de 6 horas entre envios manuais para a mesma consulta.
- Se o paciente não recebeu: conferir se o telefone está cadastrado com DDD, se a
  consulta ainda está pendente (confirmadas não recebem) e se o paciente não
  respondeu "SAIR".

## 11. Exames laboratoriais (análise por IA)

- Upload do laudo (PDF ou imagem) em **Exames**; a IA extrai os biomarcadores,
  compara com as faixas de referência do próprio laudo e prioriza achados
  clinicamente relevantes (tireoide, anticorpos, hormonais), sugerindo
  direcionamento nutricional.
- A IA **extrai e compara valores reais do laudo, não estima**. Biomarcador
  errado ou ausente que estava no laudo é problema a escalar.
- A evolução dos biomarcadores aparece na aba Exames do Acompanhamento.

## 12. Acompanhamento e Avaliação corporal

- **Acompanhamento** é organizado por paciente e período (abas Visão geral,
  Corpo, Exames, Histórico, Diário alimentar e Teleconsultas), com pontos de
  atenção e a ficha clínica (alergias, restrições, patologias) em destaque.
- **Avaliação corporal:** o nutricionista abre um pedido (medidas com fita,
  fotos ou completa); o paciente envia pelo portal. A estimativa por fotos é
  feita pela IA só quando o nutricionista pede, e o paciente só vê o resultado
  depois que o nutricionista valida e compartilha. É uma estimativa, não
  substitui bioimpedância ou dobras cutâneas.

## 13. Financeiro

- A **cobrança nasce ao agendar** a consulta, com o valor do serviço (cadastrado
  em **Ajustes → Serviços Prestados**). Cancelar a consulta cancela a cobrança;
  reagendar muda o vencimento.
- Abas: recebimentos (a receber, vencidos, recebidos), despesas e visão do mês.
  Gera recibo e exporta CSV. Cobranças de meses antigos entram por "Lançar
  cobrança".
- A secretária só vê e registra recebimentos; despesas e resultado são só do
  proprietário e dos nutricionistas.
- Ainda não existe: pacotes pré-pagos, link de pagamento, emissão de nota fiscal
  (NFS-e) nem Carnê-Leão.

## 14. Co-piloto (IA da equipe)

- Botão **Co-piloto** (atalho Ctrl+K) abre um chat lateral que responde perguntas
  sobre pacientes, agenda, financeiro e exames ("quem não voltou há 2 meses?",
  "quanto recebi este mês?").
- Disponível para proprietário e nutricionistas (não para a secretária). Só
  consulta, não altera nada. Respeita as mesmas regras de acesso: só enxerga os
  pacientes que o usuário já vê. A conversa não fica salva.

## 15. E-mails que o sistema envia

- Código de recuperação de senha; confirmação de troca de e-mail; convite e
  código de acesso do portal; avisos de pedidos de agendamento do portal;
  respostas do Suporte.
- **Resumo por e-mail (opcional):** em **Ajustes → Meu Perfil**, cada pessoa da
  equipe pode ligar um resumo diário e/ou semanal (agenda, pendências e números;
  o semanal substitui o diário na segunda). A secretária recebe a agenda da
  clínica sem dados clínicos e sem valores. Vem desligado por padrão.
- Não há notificação push nem SMS. O WhatsApp é usado só para lembretes de
  consulta (Seção 10).

## 16. Suporte — como funciona

- Em **Ajustes → Suporte**, escolher "Tenho uma dúvida" ou "Encontrei um
  problema", descrever e enviar. Uma IA tenta responder consultando esta base; se
  conseguir, a resposta chega por e-mail; senão, o time é avisado.
- Se o app cair numa tela de erro inesperado, o botão "Reportar este erro" envia
  os detalhes técnicos sem precisar digitar nada.
- Relatos vindos de pacientes (portal) não recebem resposta automática: o time
  confirma o recebimento e trata manualmente.

## 17. Perguntas frequentes

**"Por que não consigo cadastrar/editar nada?"**
Provavelmente o teste de 14 dias terminou (ou a assinatura venceu) e a clínica
está em modo somente leitura. Ajustes mostra o aviso "Período de Degustação
Encerrado". Assinar um plano reativa tudo.

**"O botão de novo paciente está bloqueado."**
Não existe limite de pacientes. O botão só fica bloqueado quando a clínica está
em modo somente leitura (teste encerrado ou assinatura vencida). Se a clínica
estiver com assinatura ativa e o botão continuar bloqueado, é problema a
escalar.

**"Esqueci minha senha."**
Na tela de login, "Esqueci minha senha", informar o e-mail cadastrado e usar o
código de 6 dígitos (válido por 10 minutos). Se não chegar, conferir o e-mail
digitado e o spam.

**"Não vejo os pacientes de outro nutricionista da clínica."**
Esperado: cada nutricionista vê só os próprios pacientes. Para ver os de um
colega, pedir acesso em Ajustes → Compartilhamento; o colega aprova.

**"A secretária não vê Consultas, Exames ou Planos."**
Esperado: a secretária não acessa dados clínicos. Ela vê Agenda, Pacientes e
recebimentos do Financeiro.

**"O paciente não consegue entrar no portal."**
Conferir: (1) se ele já criou a senha pelo convite — se não, gerar um novo
convite (o link do convite vale 72 h e só uma vez; isso não muda o prazo de
acesso); (2) se está usando o e-mail cadastrado pela clínica; (3) se o acesso
não está bloqueado em Ajustes → Acesso dos Pacientes; (4) se o prazo de acesso
definido pelo nutricionista não venceu (aí o portal fica só leitura — o
nutricionista renova o prazo na janela de acesso do paciente). Se ele esqueceu a
senha, usa "Esqueci minha senha" na tela de login.

**"Por quanto tempo o paciente tem acesso ao portal?"**
Pelo prazo que o nutricionista escolhe ao liberar (30, 60, 90, 180 dias ou até
uma data), normalmente o tempo do tratamento. Pode ser estendido a qualquer
momento.

**"Como mando o link do portal para o paciente?"**
Em Pacientes, abrir o acesso ao app do paciente e usar "Enviar link" (copiar,
WhatsApp ou e-mail). Se ele ainda não criou a senha, gerar o convite.

**"O link de ficha de pré-consulta não funciona mais."**
A ficha agora é preenchida dentro do portal do paciente. Dar acesso ao portal
(convite) e pedir que ele preencha a ficha de saúde por lá.

**"O paciente não recebeu o lembrete no WhatsApp."**
Ver se o lembrete está ativo em Ajustes → Dados da Clínica, se o telefone tem
DDD, se a consulta está pendente e no futuro, e se o paciente não respondeu
"SAIR". Dá para reenviar manualmente pelo detalhe da consulta (intervalo mínimo
de 6 h).

**"O paciente não consegue confirmar a consulta."**
Confirmar ou desmarcar só é possível até o horário da consulta.

**"Como faço uma consulta online?"**
Agendar com modalidade online. Na hora, entrar pela consulta na Agenda; o
paciente entra pelo portal. Não precisa de outro aplicativo.

**"A transcrição/resumo da teleconsulta sumiu."**
A transcrição só existe se o paciente consentiu. Depois da chamada, ela fica
como rascunho até o nutricionista salvar; se ele descartou, não fica guardada.

**"A análise de exame veio com valor errado ou não reconheceu o exame."**
Reportar como problema — a IA deve extrair os valores reais do laudo.

**"Existe envio de notificações para pacientes?"**
Sim, lembretes de consulta pelo WhatsApp (Seção 10) e e-mails do portal
(convite, avisos de agendamento). Não há push nem SMS.

**"Consigo usar o Nutri-AI em outro idioma?"**
Não; o produto é 100% em português do Brasil.

**"Consigo emitir nota fiscal ou receber pagamento pelo sistema?"**
Ainda não. O Financeiro controla cobranças, recebimentos, despesas e recibos,
mas não emite NFS-e nem gera link de pagamento.
