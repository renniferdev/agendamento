# Agendamento

SaaS multi-tenant de agendamento de horários (estilo "Calendly para estabelecimentos"): cada estabelecimento tem sua página pública de reservas, horários de funcionamento, serviços e clientes.

## 🚀 Teste agora

### Como dono do comércio

**👉 [Entrar no painel](https://agendamento-rt.vercel.app/login)** com e-mail e senha:

| E-mail | Senha |
|---|---|
| `recrutadortest@gmail.com` | `Rr120505*` |

No painel você cadastra **Serviços** e **Horários**, marca e cancela **Agendamentos**, consulta **Clientes** e baixa o **QR Code** da loja.

### Como cliente

**👉 [Abrir a página da loja](https://agendamento-rt.vercel.app/recrutador)**

1. Crie uma conta com dados fictícios.
2. Em **Agendar**, escolha o serviço, o dia e o horário e confirme.
3. Em **Meus horários**, acompanhe o agendamento ou cancele (o cancelamento pelo site vale até 2 horas antes).

> O primeiro acesso pode levar cerca de 1 minuto, porque o servidor gratuito entra em repouso quando fica sem uso.
> A loja de demonstração é compartilhada: não cadastre dados pessoais reais.

## Stack

- **back-end**: Node.js + TypeScript, Express, Prisma (PostgreSQL), Auth.js (`@auth/express`), Resend (e-mails), Zod.
- **front-end**: React 18 + TypeScript, Vite, React Router, Tailwind CSS 4.

## Pré-requisitos

- Node.js 18+ e npm
- Um banco PostgreSQL (local ou remoto)
- Conta no [Resend](https://resend.com) para envio de e-mails (opcional em dev, mas necessário para os e-mails de agendamento funcionarem)
- Credenciais OAuth do Google (para login via Auth.js), se for usar login social

## Estrutura do projeto

```
agendamento/
├─ back-end/     # API Express + Prisma
└─ front-end/    # SPA React (Vite)
```

## 1. Configurar o back-end

```bash
cd back-end
npm install
```

Copie o arquivo de variáveis de ambiente e preencha os valores:

```bash
cp .env.example .env
```

Variáveis (`back-end/.env`):

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão do PostgreSQL |
| `RESEND_API_KEY` | Chave de API do Resend |
| `EMAIL_FROM` | Remetente dos e-mails. Deixe vazio para usar `onboarding@resend.dev` (só entrega para o e-mail do dono da conta Resend) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Credenciais OAuth do Google |
| `NEXTAUTH_SECRET` | Segredo usado pelo Auth.js (gere com `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | URL base do back-end (ex: `http://localhost:3333`) |
| `FRONTEND_URL` | URL do front-end, usada em CORS e no redirect pós-login (ex: `http://localhost:5173`) |
| `CUSTOMER_JWT_SECRET` | Secret do JWT de sessão do cliente final (login separado do admin, por estabelecimento). Gere com `openssl rand -base64 32` |

Rode as migrations do Prisma e gere o client:

```bash
npm run prisma:migrate
npm run prisma:generate
```

(Opcional) crie um usuário de teste com o script incluído:

```bash
npx tsx scripts/create-dev-user.ts
```

Suba o servidor em modo desenvolvimento (com watch):

```bash
npm run dev
```

A API sobe por padrão em `http://localhost:3333` (conforme `NEXTAUTH_URL`/configuração do servidor).

### Outros comandos úteis do back-end

```bash
npm run build           # compila TypeScript para dist/
npm run start            # roda a versão compilada (dist/server.js)
npm run prisma:studio    # abre o Prisma Studio (GUI do banco)
npm test                 # testes unitários
npm run test:integration # testes de integração (precisa do Postgres de teste)
```

Guia dos testes de integração e de carga: [docs/TESTES.md](docs/TESTES.md).

## 2. Configurar o front-end

Em outro terminal:

```bash
cd front-end
npm install
cp .env.example .env
```

Variável (`front-end/.env`):

| Variável | Descrição |
|---|---|
| `VITE_API_URL` | URL da API back-end (ex: `http://localhost:3333`) |

Suba o servidor de desenvolvimento:

```bash
npm run dev
```

O Vite normalmente sobe em `http://localhost:5173`.

### Outros comandos úteis do front-end

```bash
npm run build       # typecheck + build de produção
npm run preview     # serve o build de produção localmente
npm run typecheck   # apenas checagem de tipos
```

## 3. Rodando tudo junto

1. Suba o PostgreSQL.
2. Terminal 1: `cd back-end && npm run dev`
3. Terminal 2: `cd front-end && npm run dev`
4. Acesse o front-end em `http://localhost:5173`.

## Prisma / banco de dados

O schema fica em `back-end/prisma/schema.prisma`. Principais comandos:

```bash
cd back-end
npm run prisma:migrate    # cria/aplica migrations em dev
npm run prisma:studio     # navega pelos dados via GUI
npx prisma migrate deploy # aplica migrations em produção
```
