import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getAvailableSlots, ServiceNotFoundError } from "../lib/availability";
import { sendAppointmentEmails } from "../lib/email";

/**
 * Rotas públicas da página de agendamento do cliente final (sem login).
 * Montadas em /establishments, ao lado de /:slug/availability.
 */
export const publicEstablishmentsRouter = Router();

/** GET /establishments/:slug — dados de exibição + serviços ativos. */
publicEstablishmentsRouter.get("/:slug", async (req, res, next) => {
  try {
    const establishment = await prisma.establishment.findUnique({
      where: { slug: req.params.slug },
      select: {
        name: true,
        slug: true,
        primaryColor: true,
        logoUrl: true,
        phone: true,
        services: {
          where: { active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, durationMinutes: true, priceCents: true },
        },
      },
    });
    if (!establishment) {
      res.status(404).json({ error: "Estabelecimento não encontrado." });
      return;
    }
    res.json(establishment);
  } catch (err) {
    next(err);
  }
});

const bookingSchema = z.object({
  serviceId: z.string().min(1),
  customerName: z.string().trim().min(2, "Informe seu nome").max(120),
  customerPhone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 10 || v.length === 11, "Telefone deve ter DDD + número (10 ou 11 dígitos)"),
  customerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  startsAt: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Data/hora inválida"),
});

class SlotUnavailableError extends Error {
  constructor() {
    super("Este horário acabou de ficar indisponível. Escolha outro horário.");
  }
}

/**
 * POST /establishments/:slug/appointments
 *
 * Cria um agendamento para o cliente final. O horário enviado pelo front é
 * revalidado no servidor com a MESMA regra da disponibilidade
 * (`getAvailableSlots`): tem que ser exatamente o início de um slot livre.
 *
 * Concorrência: a transação começa com `SELECT ... FOR UPDATE` na linha do
 * estabelecimento, o que serializa as reservas daquele tenant. Duas
 * requisições simultâneas para o mesmo horário entram em fila nesse lock;
 * a segunda só revalida depois que a primeira já gravou (commit), enxerga o
 * novo agendamento e recebe 409 SLOT_UNAVAILABLE. Reservas de
 * estabelecimentos diferentes não se bloqueiam.
 */
publicEstablishmentsRouter.post("/:slug/appointments", async (req, res, next) => {
  try {
    const data = bookingSchema.parse(req.body);
    const startsAt = new Date(data.startsAt);

    const establishment = await prisma.establishment.findUnique({
      where: { slug: req.params.slug },
      select: { id: true, name: true, phone: true },
    });
    if (!establishment) {
      res.status(404).json({ error: "Estabelecimento não encontrado." });
      return;
    }

    const appointment = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM establishments WHERE id = ${establishment.id} FOR UPDATE`;

        const slots = await getAvailableSlots({
          establishmentId: establishment.id,
          serviceId: data.serviceId,
          date: startsAt,
          db: tx,
        });
        const slot = slots.find((s) => s.start.getTime() === startsAt.getTime());
        if (!slot) throw new SlotUnavailableError();

        const customer = await tx.customer.upsert({
          where: {
            establishmentId_phone: { establishmentId: establishment.id, phone: data.customerPhone },
          },
          create: {
            establishmentId: establishment.id,
            name: data.customerName,
            phone: data.customerPhone,
            email: data.customerEmail,
          },
          // Cliente recorrente: mantém o cadastro atualizado com o que digitou agora.
          update: { name: data.customerName, email: data.customerEmail ?? undefined },
        });

        return tx.appointment.create({
          data: {
            establishmentId: establishment.id,
            customerId: customer.id,
            serviceId: data.serviceId,
            startsAt: slot.start,
            endsAt: slot.end,
            status: "CONFIRMED",
          },
          include: {
            service: { select: { name: true, durationMinutes: true, priceCents: true } },
            customer: { select: { name: true, phone: true, email: true } },
          },
        });
      },
      { timeout: 15000 }
    );

    res.status(201).json({
      id: appointment.id,
      status: appointment.status,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      service: appointment.service,
      customer: { name: appointment.customer.name, phone: appointment.customer.phone },
      establishment: { name: establishment.name, phone: establishment.phone },
    });

    // Depois da resposta: e-mails nunca atrasam nem derrubam a reserva.
    void notify(establishment.id, {
      establishmentName: establishment.name,
      establishmentPhone: establishment.phone,
      serviceName: appointment.service.name,
      priceCents: appointment.service.priceCents,
      startsAt: appointment.startsAt,
      customerName: appointment.customer.name,
      customerPhone: appointment.customer.phone,
      customerEmail: appointment.customer.email,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Dados inválidos.", details: err.issues });
      return;
    }
    if (err instanceof ServiceNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof SlotUnavailableError) {
      res.status(409).json({ error: err.message, code: "SLOT_UNAVAILABLE" });
      return;
    }
    next(err);
  }
});

async function notify(
  establishmentId: string,
  data: Omit<Parameters<typeof sendAppointmentEmails>[0], "adminEmail">
): Promise<void> {
  try {
    const admin = await prisma.user.findFirst({
      where: { establishmentId, role: "ADMIN" },
      select: { email: true },
    });
    await sendAppointmentEmails({ ...data, adminEmail: admin?.email ?? null });
  } catch (err) {
    console.error("[email] erro inesperado ao notificar:", err);
  }
}
