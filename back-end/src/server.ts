import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { ExpressAuth } from "@auth/express";
import { authConfig } from "./lib/auth";
import { availabilityRouter } from "./routes/availability";
import { servicesRouter } from "./routes/services";
import { onboardingRouter } from "./routes/onboarding";
import { registerRouter } from "./routes/register";
import { passwordResetRouter } from "./routes/passwordReset";
import { businessHoursRouter } from "./routes/businessHours";
import { blockedSlotsRouter } from "./routes/blockedSlots";
import { publicEstablishmentsRouter } from "./routes/publicEstablishments";
import { customerAuthRouter } from "./routes/customerAuth";
import { appointmentsRouter } from "./routes/appointments";
import { authLimiter } from "./middleware/rateLimit";
import { FRONTEND_URL } from "./lib/auth";

const app = express();

// Necessário para o Auth.js detectar corretamente protocolo/host atrás de
// proxies (Vercel, etc.) ao gerar callback URLs. Também faz o
// express-rate-limit usar o IP real do cliente (X-Forwarded-For) em vez do
// IP do proxy.
app.set("trust proxy", true);

// Cabeçalhos de segurança padrão (X-Content-Type-Options, HSTS, etc.). API
// pura (sem HTML próprio), então o CSP default do helmet não afeta nada aqui.
app.use(helmet());

// `credentials: true` + origem explícita: o front (outra porta/domínio) envia
// o cookie de sessão do Auth.js (e o `customer_session`) em cada fetch com
// `credentials: "include"`.
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
// Necessário para o middleware requireCustomer ler o cookie `customer_session`
// (o Auth.js lê os próprios cookies direto do header, sem depender disso).
app.use(cookieParser());

// Cadastro por e-mail/senha e reset de senha — precisam vir ANTES do Auth.js,
// que captura /auth/*.
app.use("/auth", registerRouter);
app.use("/auth", passwordResetRouter);

// Login por credenciais (Auth.js) também é alvo de força bruta.
app.use("/auth/callback/credentials", authLimiter);

// Auth.js — expõe /auth/signin, /auth/callback/:provider, /auth/session, etc.
app.use("/auth/*", ExpressAuth(authConfig));

// Rotas públicas consumidas pela página de agendamento do cliente final.
app.use("/establishments", availabilityRouter);
app.use("/establishments", customerAuthRouter);
app.use("/establishments", publicEstablishmentsRouter);

// Onboarding: exige login, mas NÃO exige estabelecimento (é aqui que ele é criado).
app.use("/onboarding", onboardingRouter);

// Rotas do painel administrativo (protegidas por requireAdmin no router).
app.use("/admin/services", servicesRouter);
app.use("/admin/business-hours", businessHoursRouter);
app.use("/admin/blocked-slots", blockedSlotsRouter);
app.use("/admin/appointments", appointmentsRouter);

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
