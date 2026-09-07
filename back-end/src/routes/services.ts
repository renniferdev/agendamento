import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin } from "../middleware/requireAdmin";

export const servicesRouter = Router();

// Todas as rotas abaixo exigem um admin/staff autenticado e vinculado a um
// estabelecimento (ver src/middleware/requireAdmin.ts).
servicesRouter.use(requireAdmin);

const serviceInputSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(120),
  durationMinutes: z.number().int().positive().max(24 * 60),
  priceCents: z.number().int().nonnegative(),
  active: z.boolean().optional(),
});

const serviceUpdateSchema = serviceInputSchema.partial();

/** GET /admin/services — lista os serviços do estabelecimento logado. */
servicesRouter.get("/", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const services = await prisma.service.findMany({
      where: { establishmentId },
      orderBy: { name: "asc" },
    });
    res.json(services);
  } catch (err) {
    next(err);
  }
});

/** GET /admin/services/:id — detalhe de um serviço. */
servicesRouter.get("/:id", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const service = await prisma.service.findFirst({
      where: { id: req.params.id, establishmentId },
    });
    if (!service) {
      res.status(404).json({ error: "Serviço não encontrado." });
      return;
    }
    res.json(service);
  } catch (err) {
    next(err);
  }
});

/** POST /admin/services — cria um serviço para o estabelecimento logado. */
servicesRouter.post("/", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const data = serviceInputSchema.parse(req.body);

    const service = await prisma.service.create({
      data: { ...data, establishmentId },
    });
    res.status(201).json(service);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Dados inválidos.", details: err.issues });
      return;
    }
    next(err);
  }
});

/** PUT /admin/services/:id — edita um serviço existente. */
servicesRouter.put("/:id", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const data = serviceUpdateSchema.parse(req.body);

    const existing = await prisma.service.findFirst({
      where: { id: req.params.id, establishmentId },
    });
    if (!existing) {
      res.status(404).json({ error: "Serviço não encontrado." });
      return;
    }

    const service = await prisma.service.update({
      where: { id: existing.id },
      data,
    });
    res.json(service);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Dados inválidos.", details: err.issues });
      return;
    }
    next(err);
  }
});

/**
 * PATCH /admin/services/:id/toggle-active — ativa/desativa um serviço sem
 * apagá-lo. É a forma recomendada de "remover" um serviço que já tem
 * histórico de agendamentos (ver DELETE abaixo).
 */
servicesRouter.patch("/:id/toggle-active", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const existing = await prisma.service.findFirst({
      where: { id: req.params.id, establishmentId },
    });
    if (!existing) {
      res.status(404).json({ error: "Serviço não encontrado." });
      return;
    }

    const service = await prisma.service.update({
      where: { id: existing.id },
      data: { active: !existing.active },
    });
    res.json(service);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /admin/services/:id — remove um serviço permanentemente.
 * Bloqueado se já existirem agendamentos vinculados (o schema teria que
 * cascatear a exclusão e apagaria o histórico do estabelecimento) — nesse
 * caso, oriente o uso de toggle-active para apenas desativar o serviço.
 */
servicesRouter.delete("/:id", async (req, res, next) => {
  try {
    const { establishmentId } = req.adminUser!;
    const existing = await prisma.service.findFirst({
      where: { id: req.params.id, establishmentId },
    });
    if (!existing) {
      res.status(404).json({ error: "Serviço não encontrado." });
      return;
    }

    const appointmentCount = await prisma.appointment.count({
      where: { serviceId: existing.id },
    });
    if (appointmentCount > 0) {
      res.status(409).json({
        error:
          "Este serviço possui agendamentos e não pode ser excluído. Desative-o em vez de excluir.",
      });
      return;
    }

    await prisma.service.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
