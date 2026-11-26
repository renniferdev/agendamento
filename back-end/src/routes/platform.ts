import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { listEstablishmentCustomers } from "../lib/customerList";
import { prisma } from "../lib/prisma";
import { requirePlatformAdmin } from "../middleware/requireAdmin";

/** Área do dono da plataforma: ver todos os cadastros e liberar/bloquear. */
export const platformRouter = Router();

platformRouter.use(requirePlatformAdmin);

/** GET /platform/merchants — todas as contas (exceto a sua), mais novas primeiro. */
platformRouter.get("/merchants", async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { id: { not: req.authUser!.id } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        accounts: { select: { provider: true } },
        establishment: { select: { name: true, slug: true } },
      },
    });

    res.json(
      users.map(({ accounts, ...u }) => ({
        ...u,
        loginMethod: accounts.some((a) => a.provider === "google") ? "google" : "email",
      }))
    );
  } catch (err) {
    next(err);
  }
});

/** GET /platform/merchants/:id/customers — clientes finais da loja daquele comerciante. */
platformRouter.get("/merchants/:id/customers", async (req, res, next) => {
  try {
    const merchant = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { establishmentId: true },
    });
    if (!merchant) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }
    res.json(merchant.establishmentId ? await listEstablishmentCustomers(merchant.establishmentId) : []);
  } catch (err) {
    next(err);
  }
});

const statusSchema = z.object({ status: z.enum(["ACTIVE", "BLOCKED", "PENDING"]) });

/** PATCH /platform/merchants/:id/status — libera, bloqueia ou volta para pendente. */
platformRouter.patch("/merchants/:id/status", async (req, res, next) => {
  try {
    const { status } = statusSchema.parse(req.body);

    if (req.params.id === req.authUser!.id) {
      res.status(400).json({ error: "Você não pode alterar a própria conta." });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status },
      select: { id: true, status: true },
    });
    res.json(user);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Status inválido.", details: err.issues });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }
    next(err);
  }
});
