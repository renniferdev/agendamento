import { Router } from "express";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  CUSTOMER_SESSION_COOKIE,
  customerSessionCookieOptions,
  signCustomerJwt,
} from "../lib/customerAuth";
import { requireCustomer } from "../middleware/requireCustomer";
import { authLimiter } from "../middleware/rateLimit";
import { sendPasswordResetEmail } from "../lib/email";
import { generateResetToken, hashResetToken, RESET_TOKEN_TTL_MS } from "../lib/passwordReset";
import { FRONTEND_URL } from "../lib/auth";

/**
 * Login/cadastro do cliente final, escopado por estabelecimento (`:slug`).
 * Montado em /establishments, ao lado das demais rotas públicas.
 */
export const customerAuthRouter = Router();

const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome").max(120),
    phone: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v.length === 10 || v.length === 11, "Telefone deve ter DDD + número (10 ou 11 dígitos)"),
    email: z.string().trim().toLowerCase().email("E-mail inválido"),
    password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(72),
    confirmPassword: z.string().min(1, "Confirme a senha"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

async function findEstablishmentBySlug(slug: string) {
  return prisma.establishment.findUnique({ where: { slug }, select: { id: true } });
}

/** POST /establishments/:slug/customers/register */
customerAuthRouter.post("/:slug/customers/register", authLimiter, async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);

    const establishment = await findEstablishmentBySlug(req.params.slug);
    if (!establishment) {
      res.status(404).json({ error: "Estabelecimento não encontrado." });
      return;
    }

    const customer = await prisma.customer.create({
      data: {
        establishmentId: establishment.id,
        name: data.name,
        phone: data.phone,
        email: data.email,
        passwordHash: await bcrypt.hash(data.password, 10),
      },
      select: { id: true, name: true, email: true, phone: true },
    });

    const token = signCustomerJwt({ customerId: customer.id, establishmentId: establishment.id });
    res.cookie(CUSTOMER_SESSION_COOKIE, token, customerSessionCookieOptions());
    res.status(201).json(customer);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Dados inválidos.", details: err.issues });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Não revela qual campo colidiu (e-mail ou telefone) — evita enumeração de cadastro.
      res.status(409).json({ error: "Já existe uma conta com este e-mail ou telefone.", code: "ACCOUNT_TAKEN" });
      return;
    }
    next(err);
  }
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

/** POST /establishments/:slug/customers/login */
customerAuthRouter.post("/:slug/customers/login", authLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const establishment = await findEstablishmentBySlug(req.params.slug);
    if (!establishment) {
      res.status(404).json({ error: "Estabelecimento não encontrado." });
      return;
    }

    const customer = await prisma.customer.findUnique({
      where: { establishmentId_email: { establishmentId: establishment.id, email } },
    });
    const valid = customer && (await bcrypt.compare(password, customer.passwordHash));
    if (!customer || !valid) {
      res.status(401).json({ error: "E-mail ou senha inválidos." });
      return;
    }

    const token = signCustomerJwt({ customerId: customer.id, establishmentId: establishment.id });
    res.cookie(CUSTOMER_SESSION_COOKIE, token, customerSessionCookieOptions());
    res.json({ id: customer.id, name: customer.name, email: customer.email, phone: customer.phone });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Dados inválidos.", details: err.issues });
      return;
    }
    next(err);
  }
});

/** POST /establishments/:slug/customers/logout */
customerAuthRouter.post("/:slug/customers/logout", (_req, res) => {
  res.clearCookie(CUSTOMER_SESSION_COOKIE, { path: "/" });
  res.status(204).send();
});

const customerForgotSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
});

const CUSTOMER_GENERIC_MESSAGE = {
  message: "Se existir uma conta com este e-mail, enviamos um link de redefinição.",
};

/** POST /establishments/:slug/customers/forgot-password — nunca revela se o e-mail existe. */
customerAuthRouter.post("/:slug/customers/forgot-password", authLimiter, async (req, res, next) => {
  try {
    const { email } = customerForgotSchema.parse(req.body);

    const establishment = await findEstablishmentBySlug(req.params.slug);
    if (!establishment) {
      res.status(404).json({ error: "Estabelecimento não encontrado." });
      return;
    }

    const customer = await prisma.customer.findUnique({
      where: { establishmentId_email: { establishmentId: establishment.id, email } },
      select: { id: true },
    });
    if (customer) {
      const { token, tokenHash } = generateResetToken();
      await prisma.customerPasswordResetToken.create({
        data: { customerId: customer.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
      });
      const resetUrl = `${FRONTEND_URL}/${req.params.slug}?resetToken=${token}`;
      sendPasswordResetEmail(email, resetUrl).catch((err) =>
        console.error("[email] falha ao enviar reset de senha do cliente:", err)
      );
    }

    res.json(CUSTOMER_GENERIC_MESSAGE);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Dados inválidos.", details: err.issues });
      return;
    }
    next(err);
  }
});

const customerResetSchema = z
  .object({
    token: z.string().min(1, "Token é obrigatório"),
    password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(72),
    confirmPassword: z.string().min(1, "Confirme a senha"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

/**
 * POST /establishments/:slug/customers/reset-password
 *
 * O token já identifica a conta; o `:slug` é usado só para confirmar que o
 * token pertence a um cliente deste mesmo estabelecimento (defesa extra).
 */
customerAuthRouter.post("/:slug/customers/reset-password", authLimiter, async (req, res, next) => {
  try {
    const { token, password } = customerResetSchema.parse(req.body);
    const tokenHash = hashResetToken(token);

    const establishment = await findEstablishmentBySlug(req.params.slug);
    if (!establishment) {
      res.status(404).json({ error: "Estabelecimento não encontrado." });
      return;
    }

    const resetToken = await prisma.customerPasswordResetToken.findUnique({ where: { tokenHash } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      res.status(400).json({ error: "Link inválido ou expirado. Solicite um novo." });
      return;
    }

    const customer = await prisma.customer.findUnique({ where: { id: resetToken.customerId } });
    if (!customer || customer.establishmentId !== establishment.id) {
      res.status(400).json({ error: "Link inválido ou expirado. Solicite um novo." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction([
      prisma.customer.update({ where: { id: customer.id }, data: { passwordHash } }),
      prisma.customerPasswordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    ]);

    res.json({ message: "Senha redefinida com sucesso." });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Dados inválidos.", details: err.issues });
      return;
    }
    next(err);
  }
});

/** GET /establishments/:slug/customers/me */
customerAuthRouter.get("/:slug/customers/me", requireCustomer, async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.customer!.customerId },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!customer) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }
    res.json(customer);
  } catch (err) {
    next(err);
  }
});

/** GET /establishments/:slug/customers/me/appointments — histórico do cliente logado. */
customerAuthRouter.get("/:slug/customers/me/appointments", requireCustomer, async (req, res, next) => {
  try {
    const appointments = await prisma.appointment.findMany({
      where: { customerId: req.customer!.customerId },
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        service: { select: { name: true, durationMinutes: true, priceCents: true } },
      },
    });
    res.json(appointments);
  } catch (err) {
    next(err);
  }
});
