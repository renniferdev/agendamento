# Testes

O objetivo dos testes é pegar, antes de um cliente real pegar, os problemas
que mais custam em um sistema de agendamento multi-tenant: **dois clientes no
mesmo horário**, **uma empresa vendo dados de outra** e **conta bloqueada
continuando a usar o sistema**.

| Camada | O que cobre | Banco | Comando (em `back-end/`) |
|---|---|---|---|
| Unitários | Regra de geração de horários livres | não usa | `npm test` |
| Integração | API real (rotas, middlewares, Prisma) | Postgres de teste | `npm run test:integration` |
| Carga | 7 lojas, até 50 clientes simultâneos | Postgres de teste | `k6 run scripts/load/k6-agendamento.js` |

## Requisitos

- **Node 20.19 ou superior** (o repositório usa Node 22: ver `back-end/.nvmrc`).
  O vitest 4 não roda em versões mais antigas.
- **Docker** para o Postgres de teste.

## Testes de integração

```bash
cd back-end
npm run test:db:up          # sobe o Postgres de teste na porta 5433
npm run test:integration    # aplica as migrations e roda os cenários
npm run test:db:down        # remove o banco
```

O banco é separado do de produção e os testes **se recusam a rodar** contra
qualquer banco cujo nome não contenha `test`, porque apagam todas as tabelas
entre os cenários (ver `tests/integration/setup/test-database.ts`). Para usar
outro banco, defina `TEST_DATABASE_URL`.

| Arquivo | Garantia |
|---|---|
| `agendamento-concorrencia.test.ts` | 20 clientes no mesmo horário: exatamente 1 agenda e 19 recebem `409`. Lojas diferentes não se bloqueiam. Cancelar libera o horário. Horário fora da grade, em dia fechado, no passado ou bloqueado é recusado. |
| `isolamento-entre-empresas.test.ts` | O dono da empresa A não lê nem altera serviços, horários, bloqueios e agendamentos da B (responde `404` e o dado fica intacto). `establishmentId` no corpo é ignorado. Sessão de cliente de uma loja não vale em outra. |
| `liberacao-e-plataforma.test.ts` | Conta pendente ou bloqueada é barrada no painel e tira a página pública do ar; o bloqueio vale com a sessão aberta; bloquear e liberar não perde dados. Só o dono da plataforma (e-mail configurado **e** login Google) acessa `/platform`. |
| `limite-de-tentativas.test.ts` | A 11ª tentativa de cadastro em 15 minutos recebe `429`. |

As sessões dos testes são cookies reais do Auth.js e do cliente final,
assinados com os segredos da aplicação, então cada rota passa pelo mesmo
caminho de autenticação de produção.

## Teste de carga

Simula clientes de 7 lojas abrindo a página, consultando horários e reservando.
`409` (horário já tomado) é esperado quando muitos disputam; o que não pode
aparecer é erro `5xx` ou lentidão (limites no topo do script).

```bash
cd back-end
npm run test:db:up
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/agendamento_test npx prisma migrate deploy
npm run load:seed           # cria 7 lojas x 40 clientes e grava scripts/load/tokens.json

# API apontando para o banco de teste (outro terminal)
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/agendamento_test \
CUSTOMER_JWT_SECRET=carga-local NEXTAUTH_SECRET=x PORT=3334 npx tsx src/server.ts

k6 run scripts/load/k6-agendamento.js
```

> Rode a carga **sempre local ou em ambiente de teste**, nunca contra a
> produção: ela cria milhares de agendamentos e os planos gratuitos do Render e
> do Neon têm limites que distorcem o resultado.

## O que não está coberto

- **Fluxo de navegador de ponta a ponta** (cadastrar loja, agendar pela tela e
  receber e-mail): exigiria Playwright e o frontend no ar.
- **E-mails**: o Resend fica desligado nos testes (`RESEND_API_KEY` vazio).
- **Login com Google**: depende de um provedor externo; os testes usam a
  sessão já emitida.
