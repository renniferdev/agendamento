import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAdmin";

export const onboardingRouter = Router();

// Só exige estar logado — o usuário ainda NÃO tem establishmentId aqui.
onboardingRouter.use(requireAuth);

// Slugs reservados para rotas do próprio sistema, para não colidirem com a
// URL pública /:slug no front-end.
const RESERVED_SLUGS = new Set([
  "admin", "auth", "api", "onboarding", "login", "logout", "signup",
  "health", "establishments", "static", "assets",
]);

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const establishmentInputSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(120),
  slug: z
    .string()
    .trim()
    .min(3, "Slug deve ter ao menos 3 caracteres")
    .max(60)
    .regex(
      SLUG_REGEX,
      "Slug deve conter apenas letras minúsculas, números e hífens (sem começar/terminar com hífen)"
    )
    .refine((slug) => !RESERVED_SLUGS.has(slug), "Este slug é reservado pelo sistema"),
  phone: z.string().trim().min(8).max(20).optional(),
});

/**
 * POST /onboarding/establishment
 *
 * Cria o estabelecimento do usuário logado e o vincula como ADMIN.
 * No MVP cada usuário pertence a exatamente um estabelecimento, então a
 * rota recusa (409) quem já tem vínculo.
 */
onboardingRouter.post("/establishment", async (req, res, next) => {
  try {
    const user = req.authUser!;

    if (user.establishmentId) {
      res.status(409).json({
        error: "Você já possui um estabelecimento cadastrado. No momento cada conta administra apenas um.",
        code: "ALREADY_ONBOARDED",
      });
      return;
    }

    const data = establishmentInputSchema.parse(req.body);

    const slugTaken = await prisma.establishment.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (slugTaken) {
      res.status(409).json({ error: "Este slug já está em uso.", code: "SLUG_TAKEN" });
      return;
    }

    const establishment = await prisma.$transaction(async (tx) => {
      const created = await tx.establishment.create({ data });

      // `updateMany` com filtro `establishmentId: null` fecha a corrida de
      // duas requisições simultâneas do mesmo usuário: só uma consegue
      // gravar o vínculo; a outra não afeta linha nenhuma e a transação
      // é revertida (o estabelecimento órfão não fica no banco).
      const linked = await tx.user.updateMany({
        where: { id: user.id, establishmentId: null },
        data: { establishmentId: created.id, role: "ADMIN" },
      });
      if (linked.count !== 1) {
        throw new AlreadyOnboardedError();
      }

      return created;
    });

    res.status(201).json(establishment);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Dados inválidos.", details: err.issues });
      return;
    }
    if (err instanceof AlreadyOnboardedError) {
      res.status(409).json({ error: err.message, code: "ALREADY_ONBOARDED" });
      return;
    }
    // Duas requisições com o mesmo slug passaram pela checagem acima ao
    // mesmo tempo: a constraint UNIQUE do banco pega a segunda.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "Este slug já está em uso.", code: "SLUG_TAKEN" });
      return;
    }
    next(err);
  }
});

/**
 * GET /onboarding/status — o front usa para decidir se mostra o formulário e,
 * depois do onboarding, para montar o link público (/:slug) no painel.
 */
onboardingRouter.get("/status", async (req, res, next) => {
  try {
    const user = req.authUser!;
    const establishment = user.establishmentId
      ? await prisma.establishment.findUnique({
          where: { id: user.establishmentId },
          select: { name: true, slug: true },
        })
      : null;
    res.json({
      onboarded: user.establishmentId !== null,
      establishmentId: user.establishmentId,
      role: user.role,
      establishment,
    });
  } catch (err) {
    next(err);
  }
});

class AlreadyOnboardedError extends Error {
  constructor() {
    super("Você já possui um estabelecimento cadastrado.");
  }
}
