import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin } from "../middleware/requireAdmin";

export const blockedSlotsRouter = Router();

blockedSlotsRouter.use(requireAdmin);

const blockedSlotSchema = z
  .object({
    startsAt: z.coerce.date({ errorMap: () => ({ message: "Data/hora de início inválida" }) }),
    endsAt: z.coerce.date({ errorMap: () => ({ message: "Data/hora de fim inválida" }) }),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.startsAt < v.endsAt, {
    message: "Início deve ser anterior ao fim",
    path: ["endsAt"],
  });

/**
 * GET /admin/blocked-slots — bloqueios que ainda não terminaram (inclui um
 * bloqueio em andamento). Bloqueios passados só poluiriam o painel.
 */
blockedSlotsRouter.get("/", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const slots = await prisma.blockedSlot.findMany({
      where: { establishmentId, endsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
    });
    res.json(slots);
  } catch (err) {
    next(err);
  }
});

/** POST /admin/blocked-slots — novo bloqueio (folga, feriado, manutenção...). */
blockedSlotsRouter.post("/", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const data = blockedSlotSchema.parse(req.body);

    // Bloqueios sobrepostos são apenas redundantes, não inválidos (a
    // disponibilidade trata qualquer união deles), então não há checagem.
    const slot = await prisma.blockedSlot.create({
      data: { ...data, reason: data.reason || null, establishmentId },
    });
    res.status(201).json(slot);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Dados inválidos.", details: err.issues });
      return;
    }
    next(err);
  }
});

/** DELETE /admin/blocked-slots/:id */
blockedSlotsRouter.delete("/:id", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const existing = await prisma.blockedSlot.findFirst({
      where: { id: req.params.id, establishmentId },
    });
    if (!existing) {
      res.status(404).json({ error: "Bloqueio não encontrado." });
      return;
    }
    await prisma.blockedSlot.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
