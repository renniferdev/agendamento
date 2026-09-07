// Utilitário de desenvolvimento: cria (ou reseta) um usuário com senha para
// testar o login por e-mail/senha enquanto não existe rota de cadastro.
//
//   npx tsx scripts/create-dev-user.ts [email] [senha]
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const email = process.argv[2] ?? "onboarding-test@example.com";
const password = process.argv[3] ?? "senha123";

async function main() {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, establishmentId: null },
    create: { email, name: "Usuário Dev", passwordHash },
  });
  console.log(`usuário ${user.email} pronto (id ${user.id}, establishmentId ${user.establishmentId})`);
  console.log(`senha: ${password}`);
}

main().finally(() => prisma.$disconnect());
