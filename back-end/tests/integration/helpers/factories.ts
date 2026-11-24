import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import type { AccountStatus } from "@prisma/client";
import { CUSTOMER_SESSION_COOKIE, signCustomerJwt } from "../../../src/lib/customerAuth";
import { prisma } from "../../../src/lib/prisma";

/** Apaga todos os dados (menos o controle de migrations) entre cenários. */
export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

function uid(): string {
  return randomUUID().slice(0, 8);
}

export interface BusinessHourInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface TenantOptions {
  /** Liberação do dono (padrão: ACTIVE, para o cenário mais comum). */
  status?: AccountStatus;
  name?: string;
  slug?: string;
  serviceMinutes?: number;
  /** Padrão: segundas-feiras das 09:00 às 12:00. */
  hours?: BusinessHourInput[];
}

/** Um estabelecimento completo: dono, serviço e horário de funcionamento. */
export async function createTenant(options: TenantOptions = {}) {
  const id = uid();
  const hours = options.hours ?? [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }];

  const establishment = await prisma.establishment.create({
    data: {
      name: options.name ?? `Barbearia ${id}`,
      slug: options.slug ?? `barbearia-${id}`,
      businessHours: { create: hours },
    },
  });

  const owner = await prisma.user.create({
    data: {
      email: `dono-${id}@teste.com`,
      name: `Dono ${id}`,
      role: "ADMIN",
      status: options.status ?? "ACTIVE",
      establishmentId: establishment.id,
    },
  });

  const service = await prisma.service.create({
    data: {
      establishmentId: establishment.id,
      name: `Corte ${id}`,
      durationMinutes: options.serviceMinutes ?? 60,
      priceCents: 5000,
    },
  });

  return { establishment, owner, service };
}

/**
 * Cookie de sessão do Auth.js para um usuário, assinado com o mesmo segredo
 * da aplicação. É o mesmo formato que o login real produz, então a rota é
 * exercitada de verdade (requireAuth -> getSession -> banco).
 */
export async function adminCookie(userId: string): Promise<string> {
  const token = await encode({
    token: { id: userId, sub: userId },
    secret: process.env.NEXTAUTH_SECRET!,
    salt: "authjs.session-token",
    maxAge: 60 * 60,
  });
  return `authjs.session-token=${token}`;
}

/** Cliente final de um estabelecimento, já com cookie de sessão. */
export async function createCustomer(establishmentId: string) {
  const id = uid();
  const customer = await prisma.customer.create({
    data: {
      establishmentId,
      name: `Cliente ${id}`,
      phone: String(Math.floor(1e10 + Math.random() * 9e9)),
      email: `cliente-${id}@teste.com`,
      passwordHash: "hash-de-teste",
    },
  });
  const cookie = `${CUSTOMER_SESSION_COOKIE}=${signCustomerJwt({
    customerId: customer.id,
    establishmentId,
  })}`;
  return { customer, cookie };
}

/** Dono da plataforma: e-mail de PLATFORM_ADMIN_EMAIL, com ou sem login Google vinculado. */
export async function createPlatformOwner(options: { withGoogle: boolean }) {
  const user = await prisma.user.create({
    data: {
      email: process.env.PLATFORM_ADMIN_EMAIL!,
      name: "Dono da plataforma",
      status: "ACTIVE",
      ...(options.withGoogle
        ? {
            accounts: {
              create: {
                type: "oidc",
                provider: "google",
                providerAccountId: `google-${uid()}`,
              },
            },
          }
        : {}),
    },
  });
  return user;
}

/** Próximo dia da semana (0 = domingo ... 6 = sábado), pelo menos `minDaysAhead` dias à frente, às 00:00. */
export function nextWeekday(dayOfWeek: number, minDaysAhead = 7): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + minDaysAhead);
  while (date.getDay() !== dayOfWeek) date.setDate(date.getDate() + 1);
  return date;
}

/** `date` (00:00 local) com a hora/minuto informados. */
export function at(date: Date, hours: number, minutes = 0): Date {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/** YYYY-MM-DD no fuso local, formato esperado por /availability. */
export function dateParam(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
