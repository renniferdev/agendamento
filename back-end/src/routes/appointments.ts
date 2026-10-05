import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin } from "../middleware/requireAdmin";
import { sendCancellationEmail } from "../lib/email";

export const appointmentsRouter = Router();

appointmentsRouter.use(requireAdmin);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const listQuerySchema = z.object({
  from: z.string().regex(DATE_ONLY).optional(),
  to: z.string().regex(DATE_ONLY).optional(),
});

/**
 * GET /admin/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Sem `from`, lista a partir de hoje (00:00 local); sem `to`, sem limite
 * superior. Inclui cancelados para o dono ver o histórico do dia.
 */
appointmentsRouter.get("/", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const { from, to } = listQuerySchema.parse(req.query);

    const start = from ? new Date(`${from}T00:00:00`) : new Date();
    if (!from) start.setHours(0, 0, 0, 0);
    const end = to ? new Date(`${to}T23:59:59.999`) : undefined;

    const appointments = await prisma.appointment.findMany({
      where: { establishmentId, startsAt: { gte: start, ...(end ? { lte: end } : {}) } },
      orderBy: { startsAt: "asc" },
      take: 200,
      include: {
        customer: { select: { name: true, phone: true, email: true } },
        service: { select: { name: true, durationMinutes: true, priceCents: true } },
      },
    });
    res.json(appointments);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Parâmetros inválidos.", details: err.issues });
      return;
    }
    next(err);
  }
});

/** PATCH /admin/appointments/:id/cancel — libera o horário na disponibilidade. */
appointmentsRouter.patch("/:id/cancel", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id, establishmentId },
      include: {
        customer: { select: { email: true } },
        service: { select: { name: true } },
        establishment: { select: { name: true, phone: true } },
      },
    });
    if (!existing) {
      res.status(404).json({ error: "Agendamento não encontrado." });
      return;
    }
    if (existing.status !== "PENDING" && existing.status !== "CONFIRMED") {
      res.status(409).json({ error: `Agendamento já está ${existing.status === "CANCELLED" ? "cancelado" : "concluído"}.` });
      return;
    }
    const appointment = await prisma.appointment.update({
      where: { id: existing.id },
      data: { status: "CANCELLED" },
    });
    res.json(appointment);

    // Depois da resposta: e-mail nunca atrasa nem derruba o cancelamento.
    if (existing.customer.email) {
      sendCancellationEmail({
        to: existing.customer.email,
        establishmentName: existing.establishment.name,
        establishmentPhone: existing.establishment.phone,
        serviceName: existing.service.name,
        startsAt: existing.startsAt,
      }).catch((err) => console.error("[email] falha ao enviar cancelamento:", err));
    }
  } catch (err) {
    next(err);
  }
});
