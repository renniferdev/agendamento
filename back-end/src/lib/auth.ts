import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "@auth/express/providers/credentials";
import Google from "@auth/express/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

/**
 * Configuração do Auth.js (@auth/express).
 *
 * NOTA: @auth/express ainda é um pacote em desenvolvimento ativo (v0.x) e a
 * forma de importar providers (`@auth/express/providers/<nome>`) segue o
 * padrão do next-auth/@auth/core, mas pode mudar entre versões — se o build
 * quebrar após um `npm update`, confira o changelog do pacote.
 *
 * session strategy = "jwt": obrigatório porque o Credentials provider (login
 * por e-mail/senha) não é compatível com sessão em banco no Auth.js — ao
 * usar Credentials, TODA a aplicação passa a usar sessão via JWT, mesmo para
 * o login com Google.
 */
/** Origem do front-end, usada no CORS e nos redirects pós-login do Auth.js. */
export const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

export const authConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" as const },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * O callback padrão só permite redirecionar para a própria origem do
     * backend. Como o front roda em outra origem, liberamos também
     * FRONTEND_URL — sem isso, o retorno do login com Google cairia em
     * http://localhost:3333 em vez de voltar para a tela do painel.
     */
    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      const origin = new URL(url).origin;
      if (origin === baseUrl || origin === FRONTEND_URL) return url;
      return FRONTEND_URL;
    },
    async jwt({ token, user }: any) {
      // Só o id vai para o token. role/establishmentId são lidos do banco a
      // cada requisição pelo middleware requireAuth — se ficassem aqui,
      // ficariam desatualizados após o onboarding até o próximo login.
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) session.user.id = token.id;
      return session;
    },
  },
};
