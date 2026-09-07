import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin } from "../middleware/requireAdmin";

export const businessHoursRouter = Router();

businessHoursRouter.use(requireAdmin);

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const businessHourSchema = z
  .object({
    dayOfWeek: z.number().int().min(0, "Dia deve ser 0 (domingo) a 6 (sábado)").max(6),
    startTime: z.string().regex(TIME_REGEX, "Horário deve estar no formato HH:MM"),
    endTime: z.string().regex(TIME_REGEX, "Horário deve estar no formato HH:MM"),
  })
  .refine((v) => v.startTime < v.endTime, {
    message: "Horário de início deve ser menor que o de fim",
    path: ["endTime"],
  });

/**
 * "HH:MM" compara corretamente como string (zero à esquerda garantido pelo
 * regex), então a sobreposição é o teste clássico de intervalos. Janelas
 * que apenas se tocam (08:00-12:00 e 12:00-18:00) NÃO se sobrepõem.
 */
async function findOverlap(
  establishmentId: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  excludeId?: string
) {
  return prisma.businessHour.findFirst({
    where: {
      establishmentId,
      dayOfWeek,
      id: excludeId ? { not: excludeId } : undefined,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });
}

/** GET /admin/business-hours — todas as janelas, ordenadas por dia e horário. */
businessHoursRouter.get("/", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const hours = await prisma.businessHour.findMany({
      where: { establishmentId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    res.json(hours);
  } catch (err) {
    next(err);
  }
});

/** POST /admin/business-hours — nova janela de funcionamento. */
businessHoursRouter.post("/", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const data = businessHourSchema.parse(req.body);

    const overlap = await findOverlap(establishmentId, data.dayOfWeek, data.startTime, data.endTime);
    if (overlap) {
      res.status(409).json({
        error: `Sobrepõe a janela ${overlap.startTime}-${overlap.endTime} já cadastrada neste dia. Remova-a primeiro ou ajuste o horário.`,
        code: "OVERLAP",
      });
      return;
    }

    const hour = await prisma.businessHour.create({ data: { ...data, establishmentId } });
    res.status(201).json(hour);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Dados inválidos.", details: err.issues });
      return;
    }
    next(err);
  }
});

/** PUT /admin/business-hours/:id — edita uma janela (todos os campos). */
businessHoursRouter.put("/:id", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const data = businessHourSchema.parse(req.body);

    const existing = await prisma.businessHour.findFirst({
      where: { id: req.params.id, establishmentId },
    });
    if (!existing) {
      res.status(404).json({ error: "Horário não encontrado." });
      return;
    }

    const overlap = await findOverlap(
      establishmentId, data.dayOfWeek, data.startTime, data.endTime, existing.id
    );
    if (overlap) {
      res.status(409).json({
        error: `Sobrepõe a janela ${overlap.startTime}-${overlap.endTime} já cadastrada neste dia. Remova-a primeiro ou ajuste o horário.`,
        code: "OVERLAP",
      });
      return;
    }

    const hour = await prisma.businessHour.update({ where: { id: existing.id }, data });
    res.json(hour);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Dados inválidos.", details: err.issues });
      return;
    }
    next(err);
  }
});

/** DELETE /admin/business-hours/:id */
businessHoursRouter.delete("/:id", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const existing = await prisma.businessHour.findFirst({
      where: { id: req.params.id, establishmentId },
    });
    if (!existing) {
      res.status(404).json({ error: "Horário não encontrado." });
      return;
    }
    await prisma.businessHour.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
