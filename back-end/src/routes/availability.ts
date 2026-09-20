import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getAvailableSlots, ServiceNotFoundError } from "../lib/availability";

export const availabilityRouter = Router();

const querySchema = z.object({
  serviceId: z.string().min(1, "serviceId é obrigatório"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date deve estar no formato YYYY-MM-DD"),
});

/**
 * GET /establishments/:slug/availability?serviceId=xxx&date=YYYY-MM-DD
 *
 * Rota pública consumida pela página de agendamento do cliente final.
 */
availabilityRouter.get("/:slug/availability", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { serviceId, date } = querySchema.parse(req.query);

    const establishment = await prisma.establishment.findUnique({
      where: { slug },
    });

    if (!establishment) {
      res.status(404).json({ error: "Estabelecimento não encontrado." });
      return;
    }

    // Interpretada ao meio-dia local para evitar que o fuso horário jogue
    // a data para o dia anterior/seguinte ao calcular startOfDay/endOfDay.
    const parsedDate = new Date(`${date}T12:00:00`);
    if (Number.isNaN(parsedDate.getTime())) {
      res.status(400).json({ error: "Data inválida." });
      return;
    }

    const slots = await getAvailableSlots({
      establishmentId: establishment.id,
      serviceId,
      date: parsedDate,
    });

    res.json({
      establishment: establishment.slug,
      date,
      slots: slots.map((slot) => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
      })),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Parâmetros inválidos.", details: err.issues });
      return;
    }
    if (err instanceof ServiceNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    next(err);
  }
});
