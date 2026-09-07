import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { ExpressAuth } from "@auth/express";
import { authConfig } from "./lib/auth";
import { availabilityRouter } from "./routes/availability";
import { servicesRouter } from "./routes/services";
import { onboardingRouter } from "./routes/onboarding";
import { registerRouter } from "./routes/register";
import { businessHoursRouter } from "./routes/businessHours";
import { blockedSlotsRouter } from "./routes/blockedSlots";
import { FRONTEND_URL } from "./lib/auth";

const app = express();

// Necessário para o Auth.js detectar corretamente protocolo/host atrás de
// proxies (Vercel, etc.) ao gerar callback URLs.
app.set("trust proxy", true);

// `credentials: true` + origem explícita: o front (outra porta/domínio) envia
// o cookie de sessão do Auth.js em cada fetch com `credentials: "include"`.
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());

// Cadastro por e-mail/senha — precisa vir ANTES do Auth.js, que captura /auth/*.
app.use("/auth", registerRouter);

// Auth.js — expõe /auth/signin, /auth/callback/:provider, /auth/session, etc.
app.use("/auth/*", ExpressAuth(authConfig));

// Rotas públicas consumidas pela página de agendamento do cliente final.
app.use("/establishments", availabilityRouter);

// Onboarding: exige login, mas NÃO exige estabelecimento (é aqui que ele é criado).
app.use("/onboarding", onboardingRouter);

// Rotas do painel administrativo (protegidas por requireAdmin no router).
app.use("/admin/services", servicesRouter);
app.use("/admin/business-hours", businessHoursRouter);
app.use("/admin/blocked-slots", blockedSlotsRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Handler de erro genérico — precisa ser o último `app.use`.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3333;

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
