import { Router } from "express";
import { z } from "zod";
import { ServiceNotFoundError } from "../lib/availability";
import { createAppointment, notifyNewAppointment, SlotUnavailableError } from "../lib/booking";
import { phoneSchema } from "../lib/phone";
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

const manualBookingSchema = z
  .object({
    serviceId: z.string().min(1, "Escolha o serviço"),
    startsAt: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Data/hora inválida"),
    /** Cliente já cadastrado nesta loja... */
    customerId: z.string().min(1).optional(),
    /** ...ou os dados de quem ligou/chegou. E-mail é opcional. */
    customer: z
      .object({
        name: z.string().trim().min(2, "Informe o nome do cliente").max(120),
        phone: phoneSchema,
        email: z.preprocess(
          (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
          z.string().trim().toLowerCase().email("E-mail inválido").optional()
        ),
      })
      .optional(),
  })
  .refine((v) => Boolean(v.customerId) !== Boolean(v.customer), "Informe um cliente.");

class CustomerNotFoundError extends Error {}
class EmailTakenError extends Error {}

/**
 * POST /admin/appointments — o dono marca um horário para um cliente.
 *
 * Telefone já cadastrado reaproveita o cliente (sem sobrescrever os dados
 * dele). A disponibilidade segue as mesmas regras da página pública.
 */
appointmentsRouter.post("/", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const data = manualBookingSchema.parse(req.body);

    const appointment = await createAppointment({
      establishmentId,
      serviceId: data.serviceId,
      startsAt: new Date(data.startsAt),
      resolveCustomerId: async (tx) => {
        if (data.customerId) {
          // O filtro por loja impede marcar para cliente de outra empresa.
          const found = await tx.customer.findFirst({
            where: { id: data.customerId, establishmentId },
            select: { id: true },
          });
          if (!found) throw new CustomerNotFoundError();
          return found.id;
        }

        const { name, phone, email } = data.customer!;
        const byPhone = await tx.customer.findUnique({
          where: { establishmentId_phone: { establishmentId, phone } },
          select: { id: true },
        });
        if (byPhone) return byPhone.id;

        if (email) {
          const byEmail = await tx.customer.findUnique({
            where: { establishmentId_email: { establishmentId, email } },
            select: { id: true },
          });
          if (byEmail) throw new EmailTakenError();
        }
        const created = await tx.customer.create({
          data: { establishmentId, name, phone, email: email ?? null },
          select: { id: true },
        });
        return created.id;
      },
    });

    res.status(201).json({
      id: appointment.id,
      status: appointment.status,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      service: appointment.service,
      customer: appointment.customer,
    });

    // O dono acabou de marcar: só o cliente (se tiver e-mail) é avisado.
    void notifyNewAppointment(appointment, { notifyOwner: false });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Dados inválidos.", details: err.issues });
      return;
    }
    if (err instanceof ServiceNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof CustomerNotFoundError) {
      res.status(404).json({ error: "Cliente não encontrado." });
      return;
    }
    if (err instanceof EmailTakenError) {
      res.status(409).json({
        error: "Este e-mail já é de outro cliente. Escolha o cliente na lista.",
        code: "EMAIL_TAKEN",
      });
      return;
    }
    if (err instanceof SlotUnavailableError) {
      res.status(409).json({ error: err.message, code: "SLOT_UNAVAILABLE" });
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
