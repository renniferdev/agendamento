import "dotenv/config";
import { app } from "./app";

// Sem estas variáveis o servidor até sobe, mas só quebra (500) quando alguém
// tenta usar. Melhor falhar na inicialização, onde o deploy mostra o motivo.
const REQUIRED_ENV = ["DATABASE_URL", "NEXTAUTH_SECRET", "CUSTOMER_JWT_SECRET"];
const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Variáveis de ambiente obrigatórias ausentes: ${missing.join(", ")}`);
  process.exit(1);
}

const port = process.env.PORT ? Number(process.env.PORT) : 3333;

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
