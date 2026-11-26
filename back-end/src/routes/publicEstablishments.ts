import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ServiceNotFoundError } from "../lib/availability";
import { createAppointment, notifyNewAppointment, SlotUnavailableError } from "../lib/booking";
import { requireCustomer } from "../middleware/requireCustomer";

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
    // O client ID é público (vai no navegador); null esconde o botão do Google.
    res.json({ ...establishment, googleClientId: process.env.GOOGLE_CLIENT_ID || null });
  } catch (err) {
    next(err);
  }
});

const bookingSchema = z.object({
  serviceId: z.string().min(1),
  startsAt: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Data/hora inválida"),
});

/**
 * POST /establishments/:slug/appointments
 *
 * Cria um agendamento para o cliente final logado (regras e trava de
 * concorrência em lib/booking.ts).
 */
publicEstablishmentsRouter.post("/:slug/appointments", requireCustomer, async (req, res, next) => {
  try {
    const data = bookingSchema.parse(req.body);
    const startsAt = new Date(data.startsAt);

    const establishment = await prisma.establishment.findUnique({
      where: { slug: req.params.slug },
      select: { id: true },
    });
    if (!establishment) {
      res.status(404).json({ error: "Estabelecimento não encontrado." });
      return;
    }

    const { customerId } = req.customer!;

    const appointment = await createAppointment({
      establishmentId: establishment.id,
      serviceId: data.serviceId,
      startsAt,
      resolveCustomerId: async () => customerId,
    });

    res.status(201).json({
      id: appointment.id,
      status: appointment.status,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      service: appointment.service,
      customer: { name: appointment.customer.name, phone: appointment.customer.phone },
      establishment: appointment.establishment,
    });

    // Depois da resposta: e-mails nunca atrasam nem derrubam a reserva.
    void notifyNewAppointment(appointment, { notifyOwner: true });
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
