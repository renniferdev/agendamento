import { Router } from "express";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authLimiter } from "../middleware/rateLimit";

export const registerRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(72),
});

/**
 * POST /auth/register — cadastro por e-mail/senha.
 *
 * Montada ANTES do handler do Auth.js em `/auth/*` (ver server.ts), então o
 * Express resolve este caminho primeiro. Só cria o usuário; o login em
 * seguida é feito pelo front via `/auth/callback/credentials`, como qualquer
 * outro login. Quem entrou com Google já é criado pelo adapter do Auth.js.
 */
registerRouter.post("/register", authLimiter, async (req, res, next) => {
  try {
    const { name, email, password } = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      // Não revela se a conta é Google-only ou com senha — só que existe.
      res.status(409).json({ error: "Já existe uma conta com este e-mail.", code: "EMAIL_TAKEN" });
      return;
    }

    const user = await prisma.user.create({
      data: { name, email, passwordHash: await bcrypt.hash(password, 10) },
      select: { id: true, name: true, email: true },
    });

    res.status(201).json(user);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Dados inválidos.", details: err.issues });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "Já existe uma conta com este e-mail.", code: "EMAIL_TAKEN" });
      return;
    }
    next(err);
  }
});
