# PROGRESS.md — Sistema de Agendamento (SaaS multi-tenant)

> Log de decisões e progresso do projeto. Atualizado conforme o desenvolvimento avança.
> Última atualização: 2026-09-07 (horários de funcionamento e bloqueios, backend + front)

## 1. Visão geral do projeto

Sistema de agendamento online multi-tenant (SaaS): cada estabelecimento (salão,
clínica, barbearia etc.) tem sua própria página pública de agendamento e um
painel administrativo para gerenciar serviços, horários e agendamentos.

**Arquitetura escolhida:**

| Camada | Tecnologia | Papel |
|---|---|---|
| Hospedagem | Vercel | Deploy do front-end e (provavelmente) das rotas de API |
| Banco de dados | Neon (Postgres serverless) | Armazenamento persistente |
| ORM | Prisma | Modelagem e acesso ao banco |
| E-mail transacional | Resend | Confirmação de agendamento, notificações |
| Autenticação | Auth.js (`@auth/express` + `@auth/prisma-adapter`) | Login do painel admin (e-mail/senha via `bcryptjs` e login com Google) |
| Back-end | Node.js + Express + TypeScript (`tsx`) | API REST |
| Front-end | React 18 + TypeScript + Vite 6 + Tailwind CSS 4 + React Router 6 | Login/cadastro, onboarding, painel admin (serviços, horários, bloqueios); página pública ainda não |

Repositório dividido em `back-end/` e `front-end/` na raiz do projeto.

## 2. Decisões de arquitetura

- **Multi-tenant por `slug`, não por subdomínio.** Cada `Establishment` tem um
  campo `slug` único (ex: `barbearia-do-joao`) usado na URL pública
  (`/barbearia-do-joao`) em vez de subdomínios (`joao.meusistema.com`).
  Motivo: subdomínios exigem configuração de DNS wildcard e certificado SSL
  wildcard, o que complica o deploy na Vercel (principalmente no plano
  gratuito) e a configuração do Neon/DNS local. Um path-based slug funciona
  imediatamente com qualquer domínio único, sem configuração extra de
  infraestrutura, e é trivial de migrar para subdomínio no futuro se
  necessário.
- **Isolamento de dados por `establishmentId`** em todas as tabelas de
  domínio (ver seção 3), em vez de bancos de dados separados por cliente.
  Motivo: simplicidade operacional (um único banco Neon para gerenciar) e
  custo — múltiplos bancos por tenant não se paga no estágio atual do
  projeto. O isolamento lógico via `establishmentId` + índices é suficiente
  e é o padrão usual para SaaS neste porte.
- **Auth.js com adapter Prisma**, seguindo o schema padrão exigido pelo
  `@auth/prisma-adapter` (`Account`, `Session`, `VerificationToken`) em vez de
  autenticação própria do zero. Motivo: suporte pronto a múltiplos
  provedores (login com Google já configurado via `GOOGLE_CLIENT_ID`/
  `GOOGLE_CLIENT_SECRET`, além de e-mail/senha via `passwordHash` +
  `bcryptjs`), sessões e tokens de verificação gerenciados pela biblioteca.
- **Sessão JWT carrega só o `id` do usuário; `role` e `establishmentId`
  são lidos do banco a cada requisição** (middleware `requireAuth`).
  Motivo: o token JWT é gerado no login e não muda sozinho — se guardasse
  `establishmentId`, o usuário faria o onboarding e continuaria "sem
  estabelecimento" até deslogar e logar de novo. Uma query extra por
  requisição admin é o preço de manter isso sempre correto.
- **Um usuário administra exatamente um estabelecimento (MVP).** A rota de
  onboarding recusa (409) quem já tem vínculo. Simplifica o modelo de
  permissões agora; se um dia for necessário multi-estabelecimento por
  conta, vira uma tabela de junção `User <-> Establishment`.
- **Front-end como SPA separada (Vite) falando com o backend por CORS +
  cookies**, em vez de servir o front pelo Express ou usar proxy do Vite.
  Cada `fetch` vai com `credentials: "include"`; o backend responde
  `Access-Control-Allow-Origin: <FRONTEND_URL>` + `Allow-Credentials`. Em
  dev (`localhost:5173` -> `localhost:3333`) o cookie `SameSite=Lax` do
  Auth.js é enviado porque porta não faz parte de "site". **Atenção para
  produção:** se front e API ficarem em hosts que não são same-site (ex:
  `*.vercel.app` e outro domínio), o cookie de sessão vai precisar de
  `SameSite=None; Secure` (opção `cookies` no `authConfig`), e o Auth.js
  exige `AUTH_TRUST_HOST=true` ou `AUTH_URL` fora de `NODE_ENV=development`.
- **Login por fetch usando o header `X-Auth-Return-Redirect`.** O Auth.js
  responde 302 por padrão; com esse header devolve `{ url }` em JSON, e o
  front sabe se deu certo pela URL (falha = `?error=CredentialsSignin`).
  Login com Google não pode ser fetch (o browser precisa navegar até o
  Google), então o front monta um `<form method="POST">` para
  `/auth/signin/google` com `csrfToken` e `callbackUrl`. Para o retorno
  cair no front, o callback `redirect` do Auth.js foi sobrescrito para
  aceitar `FRONTEND_URL` (o padrão só aceita a origem do próprio backend).
- **Rota de cadastro montada em `/auth/register` antes do Auth.js.** O
  Auth.js captura `/auth/*`; como o Express resolve rotas em ordem, o
  router de cadastro vem primeiro no `server.ts`. Cadastro só cria o
  usuário; o login em seguida é o fluxo normal de Credentials.
- **Janelas de funcionamento não podem se sobrepor; bloqueios podem.**
  Duas janelas sobrepostas no mesmo dia (08-12 e 11-15) seriam um erro de
  cadastro, então o backend recusa com 409 `OVERLAP`; janelas que apenas
  se tocam (08-12 e 12-18) são aceitas. Já dois bloqueios sobrepostos são
  só redundantes: a disponibilidade descarta qualquer slot que colida com
  qualquer bloqueio, então a união deles é o que vale, e não há checagem.
- **Horários como texto "HH:MM"** (já era assim no schema) permitem
  comparar e detectar sobreposição direto no `where` do Prisma
  (`startTime < fim AND endTime > início`), porque com zero à esquerda a
  ordem lexicográfica é a ordem cronológica. O regex de validação garante
  o zero à esquerda.
- **`User.establishmentId` opcional (`String?`)** com `onDelete: SetNull`.
  Permite existir um usuário administrador não vinculado a nenhum
  estabelecimento ainda (ex: durante onboarding) sem quebrar a integridade
  referencial, e evita apagar a conta do usuário se o estabelecimento for
  removido.
- **`BusinessHour` como tabela separada, uma linha por janela de
  funcionamento** (não um campo único por dia). Permite múltiplas janelas no
  mesmo dia da semana (ex: manhã e tarde com intervalo de almoço).
- **`BlockedSlot` separado de `Appointment`** para representar bloqueios
  administrativos (folga, feriado, manutenção) que não são agendamentos de
  clientes, mas que a lógica de disponibilidade de horários também precisa
  considerar.
- **Preço em centavos (`priceCents: Int`)** em vez de tipo decimal/float,
  para evitar problemas de arredondamento com ponto flutuante.

## 3. Schema do banco de dados (Prisma)

Definido em [back-end/prisma/schema.prisma](back-end/prisma/schema.prisma),
migração inicial aplicada: `20260907143954_init`.

- **`Establishment`** — o tenant. Nome, `slug` único, cor primária, logo,
  telefone. Ponto central do isolamento multi-tenant: todas as tabelas de
  domínio abaixo referenciam `establishmentId`.
- **`BusinessHour`** — horário de funcionamento por dia da semana
  (`dayOfWeek` 0–6), múltiplas janelas por dia.
- **`User`** — usuários do painel admin (`Role`: `ADMIN` | `STAFF`),
  vinculados opcionalmente a um `Establishment`.
- **`Account`, `Session`, `VerificationToken`** — tabelas padrão exigidas
  pelo `@auth/prisma-adapter` para o Auth.js funcionar (contas OAuth,
  sessões ativas, tokens de verificação de e-mail).
- **`Service`** — serviços oferecidos pelo estabelecimento (nome, duração em
  minutos, preço em centavos, ativo/inativo).
- **`Customer`** — clientes finais que agendam (nome, telefone), isolados
  por `establishmentId`.
- **`Appointment`** — o agendamento em si: cliente, serviço, início/fim,
  status (`PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`).
- **`BlockedSlot`** — bloqueios administrativos de horário (ver seção 2).

**Por que isolamento por `establishmentId` em vez de bancos separados:**
simplicidade operacional e de custo (um único banco Neon), com índices
compostos (`@@index([establishmentId, ...])`) garantindo que as consultas
mais comuns (listar serviços de um estabelecimento, buscar agendamentos por
data) continuem eficientes mesmo com todos os tenants na mesma tabela. Toda
query de aplicação deve sempre filtrar por `establishmentId` — é a fronteira
de segurança/isolamento entre tenants (a ser reforçada na camada de API).

## 4. Problema resolvido: erro P1001 do Prisma (bloqueio de IPv6 local)

**Sintoma:** `npx prisma migrate dev --name init` falhava com o erro
`P1001: Can't reach database server` ao tentar conectar no Neon
(`ep-cold-night-acjpuv9b.sa-east-1.aws.neon.tech`).

**Diagnóstico:**
1. O hostname do Neon resolve tanto para um endereço IPv6 quanto IPv4. O
   Prisma, por padrão, tentava conectar via IPv6 primeiro.
2. A rede Wi-Fi local do desenvolvedor bloqueia/não roteia corretamente
   tráfego IPv6 de saída, causando o timeout de conexão.
3. Confirmado com `nslookup` no hostname do Neon para obter o IP IPv4 direto
   (`18.230.255.48`).
4. Confirmado com `Test-NetConnection` (PowerShell) usando esse IPv4 direto
   na porta do Postgres — a conexão funcionou normalmente, isolando o
   problema como sendo especificamente de roteamento IPv6 da rede local, e
   não do banco, das credenciais ou do projeto.

**Solução aplicada:** entrada manual no arquivo hosts do Windows
(`C:\Windows\System32\drivers\etc\hosts`) forçando a resolução do hostname
do Neon diretamente para o IPv4:

```
18.230.255.48 ep-cold-night-acjpuv9b.sa-east-1.aws.neon.tech
```

Com isso, `npx prisma migrate dev --name init` completou com sucesso
(`Your database is now in sync with your schema`) e a migração
`20260907143954_init` foi criada e aplicada.

**⚠️ Importante — isto é uma correção local de ambiente, não do projeto:**
- A entrada no arquivo hosts existe **apenas na máquina/rede onde o
  problema ocorreu**. Ela não faz parte do código, não está em nenhum
  arquivo versionado, e **não deve (nem precisa) ser replicada em
  produção** — na Vercel a conexão sai por uma infraestrutura de rede
  diferente e não deve sofrer esse bloqueio de IPv6.
- **Se o projeto for rodado em outro computador, ou por outra pessoa, e o
  mesmo erro `P1001` aparecer**, o procedimento é:
  1. Rodar `nslookup <host-do-neon>` para obter o IP IPv4 atual (o IP pode
     mudar; o valor acima não é garantido permanente).
  2. Testar a conexão nesse IP com `Test-NetConnection -ComputerName <ip> -Port 5432`
     (ou a porta configurada no `DATABASE_URL`).
  3. Se o IPv4 direto funcionar e o hostname normal não, adicionar a mesma
     entrada (host atualizado) no arquivo hosts do sistema operacional
     (`/etc/hosts` no Linux/macOS, `C:\Windows\System32\drivers\etc\hosts`
     no Windows).
  4. Alternativa sem editar o hosts: forçar IPv4 no Node/Prisma (ex:
     variável de ambiente `NODE_OPTIONS=--dns-result-order=ipv4first` no
     Node 18+), o que evita depender de uma entrada manual e específica de
     IP.

## 5. Status atual

**Pronto:**
- Estrutura de pastas `back-end/` e `front-end/` criada.
- `back-end/package.json` com dependências definidas (Express, Prisma,
  Auth.js + adapter, Resend, bcryptjs, zod, TypeScript/tsx).
- Schema Prisma completo (`back-end/prisma/schema.prisma`) cobrindo tenant,
  auth, serviços, clientes, agendamentos e bloqueios.
- Migração inicial `20260907143954_init` criada e aplicada com sucesso no
  banco Neon (ambiente de desenvolvimento).
- `.env` local configurado com `DATABASE_URL`, `RESEND_API_KEY`,
  credenciais Google OAuth e `NEXTAUTH_SECRET`/`NEXTAUTH_URL`.
- Problema de conectividade IPv6 local diagnosticado e contornado (seção 4).

- Servidor Express criado (`back-end/src/server.ts`), testado localmente
  (`GET /health` responde 200).
- Configuração do Auth.js (`back-end/src/lib/auth.ts`): Google OAuth +
  login por e-mail/senha (Credentials + `bcryptjs`), sessão via JWT
  (obrigatório ao usar Credentials — ver comentário no arquivo).
- Middleware `requireAdmin` (`back-end/src/middleware/requireAdmin.ts`):
  exige sessão válida com role `ADMIN`/`STAFF` vinculada a um
  `establishmentId`; anexa esse ID a `req.adminUser` para as rotas
  usarem — nenhuma rota confia em `establishmentId` vindo do
  client, o que é a garantia real do isolamento multi-tenant.
- **Lógica de disponibilidade de horários**
  (`back-end/src/lib/availability.ts` + rota
  `GET /establishments/:slug/availability?serviceId=&date=` em
  `back-end/src/routes/availability.ts`): cruza `BusinessHour` do dia da
  semana, `Appointment`s ativos (`PENDING`/`CONFIRMED`) e `BlockedSlot`
  para retornar os horários livres de um serviço em uma data. Testada
  manualmente (retorna 404 para estabelecimento inexistente).
- **Painel admin — CRUD de serviços**
  (`back-end/src/routes/services.ts`, montado em `/admin/services`,
  protegido por `requireAdmin`): listar, detalhar, criar, editar,
  ativar/desativar (`PATCH .../toggle-active`) e excluir — exclusão é
  bloqueada (409) se o serviço já tiver agendamentos, para não perder
  histórico via cascade; nesse caso orienta a desativar em vez de excluir.
  Testada manualmente (retorna 401 sem sessão).

- **Onboarding de estabelecimento** (`back-end/src/routes/onboarding.ts`):
  - `POST /onboarding/establishment` — exige login (Google ou e-mail/senha),
    recebe `name`, `slug` e `phone` opcional; valida o slug com zod
    (minúsculas, números e hífens, sem hífen nas pontas, 3–60 chars, e uma
    lista de slugs reservados como `admin`/`auth`/`api` para não colidir
    com rotas do sistema); cria o `Establishment` e vincula o usuário como
    `ADMIN` numa transação. Erros: 400 dados inválidos, 409 `SLUG_TAKEN`,
    409 `ALREADY_ONBOARDED`, 401 sem sessão. A corrida de duas requisições
    simultâneas é fechada pelo `updateMany` condicional dentro da
    transação (só grava se `establishmentId` ainda for null) e pela
    constraint UNIQUE do slug (erro Prisma `P2002` vira 409).
  - `GET /onboarding/status` — o front usa para decidir se mostra o
    formulário de onboarding ou o painel.
- Middleware refatorado em duas camadas
  (`back-end/src/middleware/requireAdmin.ts`): `requireAuth` só exige
  sessão válida e popula `req.authUser` (usado pelo onboarding);
  `requireAdmin` exige também `establishmentId` e responde 403 com o código
  `ONBOARDING_REQUIRED` se faltar (usado pelo CRUD de serviços).
- Login por e-mail/senha (Credentials) **validado ponta a ponta via curl**:
  `GET /auth/csrf` → `POST /auth/callback/credentials` → cookie de sessão
  → `GET /auth/session`. Fluxo completo do onboarding testado em 14 passos
  (login, 403 antes, slug inválido, slug reservado, 201, status, 200 no
  painel na mesma sessão sem relogar, criação de serviço, 409 segundo
  estabelecimento, 401 sem sessão, 409 slug já usado por outro usuário).
  Dados de teste removidos do banco ao final.
- Scripts de apoio em `back-end/scripts/`: `create-dev-user.ts` (cria um
  usuário com senha, já que não existe rota de cadastro) e
  `test-onboarding.sh` (reproduz o roteiro de teste acima com curl).

- **Cadastro por e-mail/senha**: `POST /auth/register`
  (`back-end/src/routes/register.ts`). zod (nome >= 2, e-mail válido e
  normalizado para minúsculas, senha 8-72), 409 `EMAIL_TAKEN` se já
  existe (sem revelar se a conta é Google-only), hash bcrypt. Testado via
  curl: 400, 201, 409.
- **Backend preparado para o front em outra origem**: CORS com
  `credentials: true` e origem `FRONTEND_URL` (nova variável no `.env`,
  default `http://localhost:5173`); callback `redirect` do Auth.js aceita
  `FRONTEND_URL`. Criado `back-end/.env.example` (só as chaves).
- **Front-end** (`front-end/`: React + TS + Vite + Tailwind 4 via
  `@tailwindcss/vite`, React Router 6). `VITE_API_URL` no `.env`
  (`http://localhost:3333`). Estrutura:
  - `src/lib/api.ts`: `fetch` com JSON + `credentials: "include"` +
    `ApiError` tipado com `{ error, code, details }` do backend.
  - `src/lib/auth.ts`: csrf, sessão, login Credentials (JSON via
    `X-Auth-Return-Redirect`), login Google (form POST), logout,
    cadastro, status de onboarding.
  - `src/context/AuthContext.tsx`: `user`, `onboarded`, `loading`,
    `refresh()`, `signOut()`; consulta `/auth/session` e
    `/onboarding/status` ao carregar e após login/onboarding.
  - `src/components/guards.tsx`: `PublicOnly` (login/cadastro; logado
    vai para `/admin` ou `/onboarding`), `RequireNotOnboarded`
    (`/onboarding`), `RequireOnboarded` (`/admin`; sem estabelecimento ->
    `/onboarding`; deslogado -> `/login`).
  - Telas: `/login` (e-mail/senha + "Entrar com Google"), `/registro`
    (cria conta e já loga), `/onboarding` (nome, slug sugerido a partir
    do nome, telefone), `/admin` (CRUD de serviços: listar, criar,
    editar, ativar/desativar, excluir com confirmação; preço digitado em
    reais e convertido para centavos).
  - Validado: `tsc` e `vite build` limpos; o fluxo HTTP que o browser
    executa (preflight CORS, cadastro, csrf + login com senha errada e
    certa, sessão, status, logout) testado via curl com
    `Origin: http://localhost:5173`. **Ainda não foi clicado num
    navegador**; ver "Como rodar e testar" abaixo.

- **Horários de funcionamento**: `/admin/business-hours`
  (`back-end/src/routes/businessHours.ts`), protegido por `requireAdmin`.
  `GET` lista ordenado por dia e horário; `POST` e `PUT /:id` validam com
  zod (`dayOfWeek` 0-6, `HH:MM` com regex, início < fim) e recusam
  sobreposição no mesmo dia com 409 `OVERLAP` (o `PUT` exclui a própria
  janela da checagem); `DELETE /:id`.
- **Bloqueios**: `/admin/blocked-slots`
  (`back-end/src/routes/blockedSlots.ts`). `GET` lista só os que ainda
  não terminaram (`endsAt >= agora`); `POST` com `startsAt`/`endsAt`
  (qualquer formato que `new Date()` aceite; `z.coerce.date`) e `reason`
  opcional, início < fim; `DELETE /:id`.
- **Testado via curl em 23 passos** contra o servidor de dev (com
  usuário, estabelecimento e serviço de 30 min criados só para isso e
  apagados ao final): validações 400 (dia 7, `8:00` sem zero, início =
  fim), 201 nas janelas 08-12 e 14-18, 409 na 11-15, 201 na 12-14 que
  só encosta, mesma faixa em outro dia sem conflito, `PUT` movendo a
  tarde para 13-18 (200), `PUT` para 11-18 (409), `PUT` sem mudar (200,
  não colide consigo mesma). **Disponibilidade**: 18 slots amanhã (8 de
  manhã + 10 à tarde), 16 com bloqueio 09-10 (somem 09:00 e 09:30), 18
  ao apagar o bloqueio, 10 ao apagar a janela da manhã. Bloqueio passado
  é aceito mas não aparece na lista. 401 sem sessão. Roteiro em
  `back-end/scripts/test-schedule.sh`.
- **Front**: nova página `/admin/horarios`
  (`front-end/src/pages/AdminSchedulePage.tsx`) com um card por dia da
  semana (janelas cadastradas + "Remover", form início/fim com
  `<input type="time">`) e a seção de bloqueios (form com
  `datetime-local` + motivo, lista dos futuros com "Remover"). Header do
  painel extraído para `front-end/src/components/AdminLayout.tsx` com
  navegação Serviços / Horários; `AdminServicesPage` passou a usá-lo.
  Validada no navegador. Ajustes de clareza feitos depois do primeiro
  teste: cada card mostra "Salvo ✓" com destaque verde por 2,5 s após
  gravar (não há botão "salvar" e isso não estava claro); texto de ajuda
  em cada card explicando que intervalo de almoço = duas janelas
  separadas; erro de sobreposição agora aparece no próprio card e diz o
  que fazer ("Remova-a primeiro ou ajuste o horário"). A validação em si
  não mudou.

**Como rodar e testar (dev):**

```
# terminal 1
cd back-end && npm run dev        # http://localhost:3333
# terminal 2
cd front-end && npm run dev       # http://localhost:5173
```

1. `/registro`: criar conta -> deve logar sozinho e cair em `/onboarding`.
2. `/onboarding`: preencher nome (o slug é sugerido), enviar -> `/admin`.
3. `/admin`: criar serviço, editar, desativar, excluir. Sair -> `/login`.
4. `/login` com a mesma conta -> direto em `/admin` (já tem estabelecimento).
5. Google: exige, no console do Google Cloud, a URI de redirect
   `http://localhost:3333/auth/callback/google`. Depois de autorizar, o
   Auth.js redireciona para `http://localhost:5173/admin`, e o guard
   manda para `/onboarding` se for a primeira vez.
6. `/admin/horarios` (link "Horários" no topo): adicionar 08:00-12:00 e
   14:00-18:00 num dia; tentar 11:00-15:00 no mesmo dia -> erro
   "Sobrepõe a janela..."; remover uma janela. Criar um bloqueio para
   amanhã com motivo; ele aparece na lista; remover.
7. Conferir o efeito: com o id de um serviço ativo, abrir no navegador
   `http://localhost:3333/establishments/<slug>/availability?serviceId=<id>&date=<amanhã YYYY-MM-DD>`
   e ver os slots mudarem ao mexer em horários/bloqueios.

**Falta (próximas etapas planejadas):**
- Testar as quatro telas num navegador de verdade (o fluxo HTTP foi
  validado via curl, mas não a UI) e o login com Google ponta a ponta.
- Fluxo de criação de agendamento pelo cliente final (`POST` de
  `Appointment` reaproveitando `getAvailableSlots` para validar o horário
  escolhido) + envio de e-mail de confirmação via Resend, e a página
  pública `/:slug` no front.
- Tratar `?error=` de OAuth na tela de login (hoje um erro do Google cai
  na página padrão do Auth.js no backend).
- Configuração de deploy na Vercel (variáveis de ambiente de produção,
  cookies cross-site se front e API ficarem em hosts diferentes,
  `AUTH_TRUST_HOST`, confirmar que a conexão com o Neon funciona sem o
  ajuste de hosts local).

## 6. Próxima etapa

1. Página pública `/:slug` (lista de serviços + calendário de slots livres
   via `/establishments/:slug/availability`) + `POST` de agendamento no
   backend (revalidando o slot com `getAvailableSlots` para evitar corrida)
   + e-mail de confirmação via Resend.
