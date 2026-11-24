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

// Em produção a requisição passa por 2 proxies (rewrite da Vercel -> balanceador
// do Render). Confiar em exatamente 2 saltos faz `req.ip` (rate limit) ser o IP
// real do cliente. `true` seria inseguro (qualquer um forja X-Forwarded-For) e o
// express-rate-limit recusa esse valor.
app.set("trust proxy", process.env.NODE_ENV === "production" ? 2 : false);

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

// Todas as rotas ficam num router montado em `/api` (usado em produção: a Vercel
// repassa /api/* para cá, deixando front e API na mesma origem e os cookies de
// sessão de primeira parte) e também na raiz (dev local, VITE_API_URL sem /api).
const api = express.Router();

// Cadastro por e-mail/senha e reset de senha — precisam vir ANTES do Auth.js,
// que captura /auth/*.
api.use("/auth", registerRouter);
api.use("/auth", passwordResetRouter);

// Login por credenciais (Auth.js) também é alvo de força bruta.
api.use("/auth/callback/credentials", authLimiter);

// Auth.js — expõe /auth/signin, /auth/callback/:provider, /auth/session, etc.
// O @auth/express monta a URL pública (callback do Google, cookies) a partir do
// cabeçalho Host. Atrás do rewrite da Vercel o Host chega como o do Render, então
// em produção forçamos o host público de NEXTAUTH_URL (o domínio do front).
const publicHost =
  process.env.NODE_ENV === "production" && process.env.NEXTAUTH_URL
    ? new URL(process.env.NEXTAUTH_URL).host
    : null;
api.use(
  "/auth/*",
  (req, _res, next) => {
    if (publicHost) req.headers.host = publicHost;
    next();
  },
  ExpressAuth(authConfig),
);

// Rotas públicas consumidas pela página de agendamento do cliente final.
api.use("/establishments", availabilityRouter);
api.use("/establishments", customerAuthRouter);
api.use("/establishments", publicEstablishmentsRouter);

// Onboarding: exige login, mas NÃO exige estabelecimento (é aqui que ele é criado).
api.use("/onboarding", onboardingRouter);

// Rotas do painel administrativo (protegidas por requireAdmin no router).
api.use("/admin/services", servicesRouter);
api.use("/admin/business-hours", businessHoursRouter);
api.use("/admin/blocked-slots", blockedSlotsRouter);
api.use("/admin/appointments", appointmentsRouter);

app.use("/api", api);
app.use("/", api);

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
