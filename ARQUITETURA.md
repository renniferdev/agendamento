# Arquitetura do sistema — Agendamento (SaaS multi-tenant)

Documento de referência sobre como o sistema está construído hoje: stack, banco de dados, autenticação, regras de negócio e estrutura do front-end. Serve como mapa para quem for mexer no projeto depois.

## Visão geral

É um SaaS de agendamento de horários no estilo "Calendly para estabelecimentos" (pensado inicialmente para barbearias, mas genérico). **Multi-tenant em uma única aplicação**: cada estabelecimento (`Establishment`) tem seus próprios serviços, horários, clientes e agendamentos, isolados por `establishmentId`. Uma única instância do back-end e um único deploy do front-end atendem todos os estabelecimentos — cada um tem uma página pública própria em `/:slug`.

Há dois públicos completamente diferentes, com **dois sistemas de login independentes**:

- **Dono/staff do estabelecimento (admin)** — faz login via Auth.js (Google ou e-mail/senha), cadastra o estabelecimento, gerencia serviços/horários/agendamentos pelo painel `/admin`.
- **Cliente final** — acessa a página pública `/:slug` e precisa criar conta/logar (e-mail/senha) **especificamente naquele estabelecimento** para agendar. A conta não é global: a mesma pessoa loga separadamente em cada barbearia que usa o sistema.

## Stack

| Camada | Tecnologia |
|---|---|
| Back-end | Node.js + TypeScript, Express |
| Banco de dados | PostgreSQL, acessado via Prisma ORM |
| Autenticação | Auth.js (`@auth/express`) com `@auth/prisma-adapter` |
| E-mail transacional | Resend |
| Validação de entrada | Zod (em toda rota que recebe body/query) |
| Front-end | React 18 + TypeScript, Vite, React Router 6 |
| Estilo | Tailwind CSS 4 |

## Estrutura de pastas

```
agendamento/
├─ back-end/
│  ├─ prisma/
│  │  ├─ schema.prisma        # modelo de dados (fonte da verdade)
│  │  └─ migrations/          # histórico de migrations SQL
│  ├─ scripts/                 # scripts utilitários (seed de dev, testes manuais em .sh)
│  └─ src/
│     ├─ server.ts             # bootstrap do Express, monta todas as rotas
│     ├─ lib/
│     │  ├─ prisma.ts          # instância única do PrismaClient
│     │  ├─ auth.ts            # configuração do Auth.js (providers, callbacks)
│     │  ├─ availability.ts    # cálculo de horários livres (regra central do negócio)
│     │  └─ email.ts           # envio de e-mails via Resend
│     ├─ middleware/
│     │  ├─ requireAdmin.ts    # requireAuth / requireAdmin (guarda das rotas de admin)
│     │  └─ requireCustomer.ts # guarda das rotas do cliente final (escopada por :slug)
│     └─ routes/
│        ├─ register.ts             # POST /auth/register (cadastro e-mail/senha do admin)
│        ├─ onboarding.ts           # criação do estabelecimento pelo usuário logado
│        ├─ services.ts             # CRUD de serviços (admin)
│        ├─ businessHours.ts        # CRUD de horário de funcionamento (admin)
│        ├─ blockedSlots.ts         # CRUD de bloqueios/folgas (admin)
│        ├─ appointments.ts         # listagem/cancelamento de agendamentos (admin)
│        ├─ availability.ts         # GET horários livres (público)
│        ├─ customerAuth.ts         # registro/login/logout/me do cliente final (por :slug)
│        └─ publicEstablishments.ts # dados da página pública + criação de agendamento (exige login do cliente)
└─ front-end/
   └─ src/
      ├─ App.tsx               # todas as rotas da SPA
      ├─ context/
      │  ├─ AuthContext.tsx          # sessão do admin (global)
      │  └─ CustomerAuthContext.tsx  # sessão do cliente final (escopada por :slug)
      ├─ components/
      │  ├─ guards.tsx          # RequireAuth/RequireOnboarded/RequireNotOnboarded/PublicOnly
      │  ├─ AdminLayout.tsx
      │  └─ ui.tsx
      ├─ lib/
      │  ├─ api.ts              # wrapper de fetch com convenções do backend
      │  ├─ auth.ts             # chamadas a /auth/* e /onboarding/status (admin)
      │  └─ customerAuth.ts     # chamadas a /establishments/:slug/customers/* (cliente final)
      └─ pages/
         ├─ LoginPage.tsx / RegisterPage.tsx
         ├─ OnboardingPage.tsx
         ├─ AdminServicesPage.tsx / AdminSchedulePage.tsx / AdminAppointmentsPage.tsx
         └─ PublicBookingPage.tsx   # página pública /:slug — exige login do cliente antes de agendar
```

Também há `lib/customerAuth.ts` no back-end (JWT/cookie da sessão do cliente), ao lado dos outros libs.

## Banco de dados

PostgreSQL via Prisma. Schema completo em `back-end/prisma/schema.prisma`. Toda tabela de domínio carrega `establishment_id` — é isso que garante o isolamento entre tenants (nenhuma query de admin roda sem filtrar por esse campo).

### Modelos

**`Establishment`** (tenant)
Nome, `slug` único (define a URL pública `/:slug`), cor primária, logo, telefone. Raiz de todos os relacionamentos.

**`BusinessHour`**
Janela de funcionamento por dia da semana (`dayOfWeek` 0-6, `startTime`/`endTime` em `"HH:MM"`). Um estabelecimento pode ter várias janelas no mesmo dia (ex: manhã e tarde). Sobreposição de janelas no mesmo dia é bloqueada na API (`businessHours.ts`).

**`User`** (conta do dono/staff — login administrativo)
- `email` único, `passwordHash` (nulo se só usa login Google), `role` (`ADMIN` | `STAFF`).
- `establishmentId` **opcional**: um usuário existe antes de ter estabelecimento — é assim que funciona o onboarding (login primeiro, cadastro do estabelecimento depois).
- `Account` / `Session` / `VerificationToken`: tabelas exigidas pelo `@auth/prisma-adapter`, não são usadas diretamente pelo resto do código.

**`Customer`** (cliente final — tem login, escopado por estabelecimento)
Nome, telefone e `email` (ambos únicos por estabelecimento — `@@unique([establishmentId, phone])` e `@@unique([establishmentId, email])`) e `passwordHash`. É uma conta de verdade: o cliente se cadastra e loga em cada estabelecimento separadamente (não é uma conta global entre barbearias). Usa um sistema de autenticação próprio, independente do Auth.js do `User` — ver seção "Autenticação do cliente final" abaixo.

**`Service`**
Nome, duração em minutos, preço em centavos, `active` (desativar em vez de apagar quando já tem histórico).

**`Appointment`**
Liga `Customer` + `Service` + `Establishment`, com `startsAt`/`endsAt` e `status` (`PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`). Hoje o fluxo público já cria direto como `CONFIRMED` (não há aprovação manual). `PENDING`/`CONFIRMED` são os únicos status que bloqueiam um horário na disponibilidade.

**`BlockedSlot`**
Bloqueio administrativo (folga, feriado, manutenção) — mesma lógica de colisão dos agendamentos, mas sem cliente associado.

### Migrations

Ficam em `back-end/prisma/migrations/`. Fluxo de desenvolvimento:

```bash
cd back-end
npm run prisma:migrate     # cria/aplica uma migration a partir de mudanças no schema.prisma
npm run prisma:generate    # regenera o Prisma Client (@prisma/client) — necessário após qualquer mudança de schema
```

Em produção usa-se `prisma migrate deploy` (aplica migrations já existentes, sem gerar novas interativamente).

## Autenticação (só para admin/staff)

Usa **Auth.js** (`@auth/express`) com **dois providers**:

1. **Google OAuth** — login social.
2. **Credentials** (e-mail/senha) — cadastro próprio via `POST /auth/register` (`register.ts`), senha com hash `bcryptjs`.

Pontos importantes da configuração (`lib/auth.ts`):

- **Sessão via JWT** (`session.strategy = "jwt"`), não sessão em banco — obrigatório porque o provider Credentials do Auth.js não é compatível com sessão em banco; ao usar Credentials, isso vira global para toda a aplicação (inclusive o login Google).
- O JWT guarda **só o `id`** do usuário. `role` e `establishmentId` **nunca** vêm do token — são lidos do banco em toda requisição autenticada (`requireAuth`), porque senão ficariam desatualizados até o próximo login (ex: usuário faz onboarding, mas o token antigo ainda diz "sem estabelecimento").
- `redirect` customizado: por padrão o Auth.js só permite redirecionar para a própria origem do back-end; como o front roda em outra origem/porta, `FRONTEND_URL` é liberada explicitamente — senão o retorno do login Google cairia em `localhost:3333` em vez de voltar pro painel.
- Cookies de sessão cross-origin: front e back rodam em portas/domínios diferentes, então o back usa `cors({ origin: FRONTEND_URL, credentials: true })` e o front sempre chama `fetch` com `credentials: "include"` (`front-end/src/lib/api.ts`).

### Guarda de rotas no back-end (`middleware/requireAdmin.ts`)

Duas camadas:

- **`requireAuth`** — exige apenas sessão válida (usuário existe no banco). Usada em `/onboarding`, porque nesse momento o usuário ainda não tem estabelecimento.
- **`requireAdmin`** — `requireAuth` + exige `establishmentId` não nulo. Usada em todas as rotas `/admin/*`. É o que garante que toda query de admin filtra pelo estabelecimento certo (`req.adminUser.establishmentId`), nunca por um valor vindo do client.

### Onboarding

Fluxo: usuário se cadastra/loga → ainda sem `establishmentId` → tela de onboarding cria o estabelecimento (`POST /onboarding/establishment`) e vincula o usuário como `ADMIN`. Regras:

- Slug validado por regex (minúsculas, números, hífen) e contra uma lista de slugs reservados (`admin`, `auth`, `login` etc.) para não colidir com as rotas fixas do front.
- Condição de corrida coberta: o vínculo usuário↔estabelecimento é feito com `updateMany` filtrando `establishmentId: null` dentro de uma transação — se duas requisições do mesmo usuário chegarem ao mesmo tempo, só uma vence; a outra reverte a criação do estabelecimento (não sobra tenant órfão).
- `GET /onboarding/status` é o que o front usa para decidir se redireciona para onboarding, painel ou login (ver seção de guards abaixo).

## Autenticação do cliente final (`lib/customerAuth.ts`, `middleware/requireCustomer.ts`, `routes/customerAuth.ts`)

Sistema de login **completamente separado** do Auth.js usado pelo admin — outro secret, outro formato de sessão, outro cookie. Só e-mail/senha (sem login social). Motivo de não reaproveitar o Auth.js: a conta do cliente é escopada por estabelecimento (mesmo e-mail pode ter contas diferentes em barbearias diferentes), o que não é o modelo do `@auth/prisma-adapter`.

- **Sessão**: JWT assinado com `CUSTOMER_JWT_SECRET` (payload `{ customerId, establishmentId }`, validade 30 dias), guardado no cookie `customer_session` (`httpOnly`; `SameSite=Lax` em dev, `SameSite=None; Secure` em produção — necessário porque em produção front e back ficam em domínios diferentes).
- **`requireCustomer`**: middleware usado nas rotas escopadas por `:slug`. Depois de validar o JWT, **sempre confere que o `establishmentId` do token bate com o estabelecimento do `:slug` da rota atual** — é isso que impede uma sessão criada na barbearia A de ser aceita numa rota da barbearia B.
- Rotas, todas sob `/establishments/:slug/customers/*`:
  - `POST /register` — cria a conta (nome, telefone, e-mail, senha com hash `bcryptjs`) e já loga (seta o cookie).
  - `POST /login` — valida e-mail/senha *dentro daquele estabelecimento* e seta o cookie.
  - `POST /logout` — limpa o cookie.
  - `GET /me` — dados do cliente logado, `401` se não autenticado.

**Agendar pela página pública agora exige estar logado**: `POST /establishments/:slug/appointments` passou a rodar atrás de `requireCustomer` — o body deixou de receber nome/telefone/e-mail (não existe mais `upsert` de `Customer` nesse ponto); o `customerId` vem da sessão.

## Regra central: cálculo de disponibilidade (`lib/availability.ts`)

Função `getAvailableSlots({ establishmentId, serviceId, date })`, usada tanto pela rota pública de consulta (`GET /establishments/:slug/availability`) quanto na hora de criar o agendamento (revalidação server-side). Passos:

1. Busca o `Service` (precisa existir, pertencer ao estabelecimento e estar `active`).
2. Busca as janelas de `BusinessHour` do dia da semana pedido (pode haver mais de uma).
3. Dentro de cada janela, gera candidatos a cada `slotIntervalMinutes` (por padrão, a própria duração do serviço) — descarta candidato cujo término passaria do fim da janela.
4. Busca, numa única query, todos os agendamentos ativos (`PENDING`/`CONFIRMED`) e bloqueios (`BlockedSlot`) que colidem com o dia — depois filtra em memória (evita N queries, uma por slot candidato).
5. Descarta candidato que colida com qualquer agendamento/bloqueio (`overlaps`), ou que já esteja no passado se a data pedida for hoje.
6. Retorna a lista ordenada de slots livres.

## Criação de agendamento (fluxo público)

`POST /establishments/:slug/appointments` (`routes/publicEstablishments.ts`), **exige cliente logado** (`requireCustomer`). Passo a passo:

1. Valida o body com Zod (só `serviceId` e `startsAt` — dados do cliente já vêm da sessão, não do body).
2. Abre uma transação Prisma que começa com `SELECT ... FOR UPDATE` na linha do `Establishment` — isso serializa as reservas daquele tenant especificamente (dois clientes do mesmo estabelecimento tentando o mesmo horário entram em fila; estabelecimentos diferentes não se bloqueiam entre si).
3. Dentro da transação, **revalida** a disponibilidade chamando `getAvailableSlots` de novo (com o client da própria transação) e confere se o horário pedido é exatamente o início de um slot livre — evita duplo agendamento por condição de corrida (ex: duas abas abertas na mesma página).
4. Cria o `Appointment` usando o `customerId` da sessão (`req.customer.customerId`), já como `CONFIRMED` (não há fluxo de aprovação manual hoje).
5. Responde ao cliente **antes** de disparar e-mails — envio de e-mail nunca atrasa nem pode derrubar a resposta da reserva (roda depois, com erros só logados, nunca lançados).

## E-mails (`lib/email.ts`)

Via Resend. Dois e-mails disparados por agendamento (em paralelo, com `Promise.allSettled` — falha de um não afeta o outro):
- Confirmação para o cliente (se ele informou e-mail).
- Aviso para o e-mail do usuário `ADMIN` daquele estabelecimento.

Sem `RESEND_API_KEY` configurada, o envio é pulado com um aviso no log (não quebra o fluxo — útil em desenvolvimento). Importante: sem domínio verificado no Resend, o remetente só pode ser `onboarding@resend.dev`, e nesse modo o Resend só entrega e-mails para o dono da conta Resend — qualquer outro destinatário falha silenciosamente (erro só aparece no log do back-end). Para entregar a clientes reais, é necessário verificar um domínio no Resend e configurar `EMAIL_FROM`.

## Rotas da API

Prefixos montados em `server.ts`:

| Prefixo | Router | Autenticação |
|---|---|---|
| `/auth/register` | `register.ts` | pública (cadastro do admin) |
| `/auth/*` | Auth.js (`ExpressAuth`) — signin, callback, session, signout | pública (login do admin) |
| `/establishments/:slug/availability` | `availability.ts` | pública |
| `/establishments/:slug` | `publicEstablishments.ts` | pública |
| `/establishments/:slug/customers/register`, `/login`, `/logout` | `customerAuth.ts` | pública (login do cliente final) |
| `/establishments/:slug/customers/me` | `customerAuth.ts` | `requireCustomer` |
| `/establishments/:slug/appointments` | `publicEstablishments.ts` | `requireCustomer` |
| `/onboarding/*` | `onboarding.ts` | `requireAuth` |
| `/admin/services` | `services.ts` | `requireAdmin` |
| `/admin/business-hours` | `businessHours.ts` | `requireAdmin` |
| `/admin/blocked-slots` | `blockedSlots.ts` | `requireAdmin` |
| `/admin/appointments` | `appointments.ts` | `requireAdmin` |
| `/health` | health check | pública |

Todas as rotas de escrita validam o body/query com **Zod** e devolvem `400` com `{ error, details }` em caso de erro de validação. Erros não tratados caem no handler genérico do `server.ts`, que loga a stack completa no console e responde `500 { error: "Erro interno do servidor." }` — o detalhe real do erro só aparece no terminal do back-end, nunca no browser.

## Front-end

SPA em React Router (`App.tsx`). Todo acesso à API passa pelo helper `api()` (`lib/api.ts`), que já injeta `credentials: "include"` e converte erros do back-end (`{ error, code, details }`) em `ApiError` tipado.

### Estado de sessão (`context/AuthContext.tsx`)

Ao montar, consulta `GET /auth/session` e, se houver usuário, `GET /onboarding/status`. Expõe `{ loading, user, onboarded, establishment, refresh, signOut }` para toda a árvore via `useAuth()`.

### Guardas de rota (`components/guards.tsx`)

- **`PublicOnly`** — `/login`, `/registro`. Usuário já logado é redirecionado para `/admin` (se onboarded) ou `/onboarding`.
- **`RequireNotOnboarded`** — `/onboarding`. Exige login; quem já tem estabelecimento é mandado para `/admin`.
- **`RequireOnboarded`** — `/admin/*`. Exige login **e** estabelecimento; sem um dos dois, redireciona para `/login` ou `/onboarding`.
- A página pública `/:slug` não tem guarda de rota do React Router (é o site de agendamento do cliente final), mas embrulha o conteúdo em `CustomerAuthProvider` (com `key={slug}`, para resetar a sessão ao trocar de barbearia) e, enquanto não há `customer` logado, mostra uma tela de login/cadastro (`CustomerAuthGate`) em vez do fluxo de agendamento.

### Páginas

| Rota | Página | Descrição |
|---|---|---|
| `/login` | `LoginPage` | Login com Google ou e-mail/senha |
| `/registro` | `RegisterPage` | Cadastro e-mail/senha (`POST /auth/register`) |
| `/onboarding` | `OnboardingPage` | Formulário de criação do estabelecimento |
| `/admin` | `AdminServicesPage` | CRUD de serviços |
| `/admin/horarios` | `AdminSchedulePage` | Horário de funcionamento + bloqueios |
| `/admin/agendamentos` | `AdminAppointmentsPage` | Lista de agendamentos, cancelamento |
| `/:slug` | `PublicBookingPage` | Página pública: exige login/cadastro do cliente (naquele estabelecimento), depois escolhe serviço, dia e horário para agendar |

## Multi-tenancy e deploy

Como tudo já é isolado por `establishmentId` e a URL pública é dinâmica (`/:slug`), **não é necessário nada especial por estabelecimento** para colocar uma nova barbearia no sistema: o dono se cadastra, faz o onboarding escolhendo um slug, e a página `seusite.com/<slug>` já existe. Um único deploy do front-end (ex: Vercel) e um único deploy do back-end atendem todos os tenants — não há deploy por cliente.

Pontos a considerar para produção:
- `NEXTAUTH_URL` e `FRONTEND_URL` precisam apontar para os domínios reais (não `localhost`).
- `DATABASE_URL` de um Postgres gerenciado (o schema já é Postgres-only via Prisma).
- Domínio verificado no Resend + `EMAIL_FROM` configurado, senão e-mails para clientes reais não são entregues (ver seção de e-mails).
- Credenciais OAuth do Google precisam ter a URL de callback de produção cadastrada no Google Cloud Console.
- `CUSTOMER_JWT_SECRET` configurada (secret próprio, diferente de `NEXTAUTH_SECRET`) — gerar com `openssl rand -base64 32`.
- Como front e back ficam em domínios diferentes em produção, o cookie `customer_session` só funciona sobre HTTPS (`SameSite=None; Secure`) — confirmar que ambos os deploys servem em HTTPS.

## O que ainda não existe

- **Histórico de agendamentos do cliente / cancelamento pelo próprio cliente** — o cliente já loga e agenda, mas não há tela para ver ou cancelar agendamentos passados/futuros pelo próprio painel.
- **Recuperação de senha** — nem para o `Customer`, nem para o `User` admin.
- **Login social (Google) para o cliente final** — só e-mail/senha por enquanto.
- **Aprovação manual de agendamento** — todo agendamento público entra direto como `CONFIRMED`.
- **Papel `STAFF` com permissões diferentes de `ADMIN`** — o enum existe no schema mas o código atual não distingue os dois (tudo que passa por `requireAdmin` tem acesso igual).
