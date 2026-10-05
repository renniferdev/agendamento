import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { sendPasswordResetEmail } from "../lib/email";
import { generateResetToken, hashResetToken, RESET_TOKEN_TTL_MS } from "../lib/passwordReset";
import { FRONTEND_URL } from "../lib/auth";
import { authLimiter } from "../middleware/rateLimit";

/**
 * "Esqueci minha senha" do admin/staff (User). Montado em /auth, ao lado de
 * registerRouter — precisa vir ANTES do handler do Auth.js em /auth/*.
 */
export const passwordResetRouter = Router();

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
});

const GENERIC_MESSAGE = { message: "Se existir uma conta com este e-mail, enviamos um link de redefinição." };

/** POST /auth/forgot-password — nunca revela se o e-mail existe. */
passwordResetRouter.post("/forgot-password", authLimiter, async (req, res, next) => {
  try {
    const { email } = forgotSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) {
      const { token, tokenHash } = generateResetToken();
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
      });
      const resetUrl = `${FRONTEND_URL}/redefinir-senha?token=${token}`;
      sendPasswordResetEmail(email, resetUrl).catch((err) =>
        console.error("[email] falha ao enviar reset de senha:", err)
      );
    }

    res.json(GENERIC_MESSAGE);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Dados inválidos.", details: err.issues });
      return;
    }
    next(err);
  }
});

const resetSchema = z.object({
  token: z.string().min(1, "Token é obrigatório"),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(72),
});

/** POST /auth/reset-password — troca a senha a partir de um token válido e não usado. */
passwordResetRouter.post("/reset-password", authLimiter, async (req, res, next) => {
  try {
    const { token, password } = resetSchema.parse(req.body);
    const tokenHash = hashResetToken(token);

    const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      res.status(400).json({ error: "Link inválido ou expirado. Solicite um novo." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
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
