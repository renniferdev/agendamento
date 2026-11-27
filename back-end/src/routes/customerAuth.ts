import { Router } from "express";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { CANCEL_NOTICE_HOURS, cancellationDeadline, customerCanCancel } from "../lib/cancellation";
import { phoneSchema } from "../lib/phone";
import { prisma } from "../lib/prisma";
import {
  CUSTOMER_SESSION_COOKIE,
  customerSessionCookieOptions,
  signCustomerJwt,
} from "../lib/customerAuth";
import { InvalidGoogleCredentialError, verifyGoogleCredential } from "../lib/googleIdentity";
import { requireCustomer } from "../middleware/requireCustomer";
import { authLimiter } from "../middleware/rateLimit";
import { sendCustomerCancelledEmail, sendPasswordResetEmail } from "../lib/email";
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
    phone: phoneSchema,
    email: z.string().trim().toLowerCase().email("E-mail inválido"),
    password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(72),
    confirmPassword: z.string().min(1, "Confirme a senha"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

const SESSION_FIELDS = { id: true, name: true, email: true, phone: true } as const;

async function findEstablishmentBySlug(slug: string) {
  return prisma.establishment.findUnique({ where: { slug }, select: { id: true } });
}

/**
 * Cadastro feito pelo dono (agendamento por telefone/balcão): ainda sem senha
 * nem Google. Quando a pessoa cria a conta com o mesmo telefone, ela assume
 * esse cadastro. Se o dono registrou um e-mail, ele também precisa conferir.
 */
async function findClaimableCustomer(establishmentId: string, phone: string, email: string) {
  const customer = await prisma.customer.findUnique({
    where: { establishmentId_phone: { establishmentId, phone } },
    select: { id: true, email: true, passwordHash: true, googleSub: true },
  });
  if (!customer || customer.passwordHash || customer.googleSub) return null;
  if (customer.email && customer.email !== email) return null;
  return customer;
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

    const account = {
      name: data.name,
      email: data.email,
      passwordHash: await bcrypt.hash(data.password, 10),
    };
    const walkIn = await findClaimableCustomer(establishment.id, data.phone, data.email);
    const customer = walkIn
      ? await prisma.customer.update({
          where: { id: walkIn.id },
          // Telefone não é verificado: o histórico anterior não é exposto (claimedAt).
          data: { ...account, claimedAt: new Date() },
          select: SESSION_FIELDS,
        })
      : await prisma.customer.create({
          data: { ...account, establishmentId: establishment.id, phone: data.phone },
          select: SESSION_FIELDS,
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
    // Conta criada só com Google não tem senha: responde como credencial inválida.
    const valid = customer?.passwordHash && (await bcrypt.compare(password, customer.passwordHash));
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

const googleSchema = z.object({
  credential: z.string().min(1, "Credencial do Google ausente"),
  phone: phoneSchema.optional(),
});

/**
 * POST /establishments/:slug/customers/google
 *
 * Entrar ou criar conta com o Google. O front envia o ID token do botão do
 * Google. Como o Google não informa telefone, uma conta nova sem `phone`
 * recebe `{ needsPhone: true }` e o front reenvia com o número.
 */
customerAuthRouter.post("/:slug/customers/google", authLimiter, async (req, res, next) => {
  try {
    const { credential, phone } = googleSchema.parse(req.body);

    const establishment = await findEstablishmentBySlug(req.params.slug);
    if (!establishment) {
      res.status(404).json({ error: "Estabelecimento não encontrado." });
      return;
    }
    const establishmentId = establishment.id;

    const identity = await verifyGoogleCredential(credential);

    let customer = await prisma.customer.findUnique({
      where: { establishmentId_googleSub: { establishmentId, googleSub: identity.sub } },
      select: SESSION_FIELDS,
    });
    let created = false;

    if (!customer) {
      const sameEmail = await prisma.customer.findUnique({
        where: { establishmentId_email: { establishmentId, email: identity.email } },
        select: { id: true },
      });

      if (sameEmail) {
        // Só vincula quando o Google é a autoridade sobre o endereço.
        if (!identity.emailIsAuthoritative) {
          res.status(409).json({
            error: "Já existe uma conta com este e-mail. Entre com sua senha.",
            code: "ACCOUNT_TAKEN",
          });
          return;
        }
        // O cadastro por senha não confirma o e-mail: outra pessoa pode ter criado
        // a conta com ele. Ao vincular o Google, a senha antiga deixa de valer.
        customer = await prisma.customer.update({
          where: { id: sameEmail.id },
          data: { googleSub: identity.sub, passwordHash: null },
          select: SESSION_FIELDS,
        });
      } else if (!phone) {
        res.json({ needsPhone: true, name: identity.name, email: identity.email });
        return;
      } else {
        const walkIn = await findClaimableCustomer(establishmentId, phone, identity.email);
        const account = { name: identity.name, email: identity.email, googleSub: identity.sub };
        customer = walkIn
          ? await prisma.customer.update({
              where: { id: walkIn.id },
              data: { ...account, claimedAt: new Date() },
              select: SESSION_FIELDS,
            })
          : await prisma.customer.create({
              data: { ...account, establishmentId, phone },
              select: SESSION_FIELDS,
            });
        created = true;
      }
    }

    const token = signCustomerJwt({ customerId: customer.id, establishmentId });
    res.cookie(CUSTOMER_SESSION_COOKIE, token, customerSessionCookieOptions());
    res.status(created ? 201 : 200).json(customer);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Dados inválidos.", details: err.issues });
      return;
    }
    if (err instanceof InvalidGoogleCredentialError) {
      res.status(401).json({ error: err.message });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "Já existe uma conta com este e-mail ou telefone.", code: "ACCOUNT_TAKEN" });
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

/** Agendamentos que esta conta pode ver e alterar. */
async function visibleAppointments(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { claimedAt: true },
  });
  // Conta que assumiu um cadastro do dono só alcança o que veio depois disso.
  return { customerId, ...(customer?.claimedAt ? { createdAt: { gte: customer.claimedAt } } : {}) };
}

/** GET /establishments/:slug/customers/me/appointments — histórico do cliente logado. */
customerAuthRouter.get("/:slug/customers/me/appointments", requireCustomer, async (req, res, next) => {
  try {
    const appointments = await prisma.appointment.findMany({
      where: await visibleAppointments(req.customer!.customerId),
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        service: { select: { name: true, durationMinutes: true, priceCents: true } },
      },
    });
    // A regra fica no servidor; a tela só obedece a `canCancel`.
    res.json(appointments.map((a) => ({ ...a, canCancel: customerCanCancel(a) })));
  } catch (err) {
    next(err);
  }
});

/** PATCH /establishments/:slug/customers/me/appointments/:id/cancel — o cliente desmarca. */
customerAuthRouter.patch(
  "/:slug/customers/me/appointments/:id/cancel",
  requireCustomer,
  async (req, res, next) => {
    try {
      const visible = await visibleAppointments(req.customer!.customerId);
      const appointment = await prisma.appointment.findFirst({
        where: { ...visible, id: req.params.id },
        include: {
          customer: { select: { name: true, phone: true } },
          service: { select: { name: true } },
        },
      });
      if (!appointment) {
        res.status(404).json({ error: "Agendamento não encontrado." });
        return;
      }

      // Condição no próprio UPDATE: duas requisições juntas não cancelam duas vezes.
      const { count } = await prisma.appointment.updateMany({
        where: {
          id: appointment.id,
          status: { in: ["PENDING", "CONFIRMED"] },
          startsAt: { gt: cancellationDeadline() },
        },
        data: { status: "CANCELLED" },
      });
      if (count === 0) {
        res.status(409).json({
          error: `O cancelamento pelo site é permitido até ${CANCEL_NOTICE_HOURS} horas antes. Fale com o estabelecimento.`,
          code: "NOT_CANCELLABLE",
        });
        return;
      }
      res.status(204).send();

      // Depois da resposta: o aviso ao dono nunca atrasa nem derruba o cancelamento.
      prisma.user
        .findFirst({
          where: { establishmentId: appointment.establishmentId, role: "ADMIN" },
          select: { email: true },
        })
        .then((owner) =>
          owner
            ? sendCustomerCancelledEmail({
                to: owner.email,
                customerName: appointment.customer.name,
                customerPhone: appointment.customer.phone,
                serviceName: appointment.service.name,
                startsAt: appointment.startsAt,
              })
            : undefined
        )
        .catch((err) => console.error("[email] falha ao avisar cancelamento do cliente:", err));
    } catch (err) {
      next(err);
    }
  }
);
