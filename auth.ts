import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { credentialsSchema } from "@/lib/validations/auth";

const DAY_SECONDS = 24 * 60 * 60;

// OAuth providers are only registered when their credentials are configured,
// so local development without provider apps still boots cleanly.
const oauthProviders = [
  ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? [Google] : []),
  ...(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET ? [GitHub] : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  ...authConfig,
  providers: [
    ...oauthProviders,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        remember: { label: "Remember me" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const remember = String(credentials?.remember ?? "false") === "true";

        const user = await db.user.findUnique({
          where: { email },
        });

        const invalid =
          !user ||
          user.deletedAt !== null ||
          !user.passwordHash ||
          !(await bcrypt.compare(password, user.passwordHash));

        if (invalid) {
          await recordLogin(email, "credentials", false, user?.id);
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          sessionVersion: user.sessionVersion,
          remember,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.sessionVersion = user.sessionVersion ?? 0;
        // Remember Me: 30-day token vs 24-hour token. Middleware enforces
        // the exp claim on every request, so expiry applies everywhere.
        const ttl = user.remember === false ? DAY_SECONDS : 30 * DAY_SECONDS;
        token.exp = Math.floor(Date.now() / 1000) + ttl;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
        session.user.sessionVersion = token.sessionVersion as number | undefined;
      }
      return session;
    },
  },
  events: {
    // Successful sign-ins (every provider) land here exactly once.
    async signIn({ user, account }) {
      const provider = account?.provider ?? "credentials";
      await recordLogin(user.email ?? "", provider, true, user.id);
    },
  },
});

async function recordLogin(
  email: string,
  provider: string,
  success: boolean,
  userId?: string | null
) {
  try {
    if (!email) return;
    await db.loginEvent.create({
      data: { email, provider, success, userId: userId ?? null },
    });
  } catch (error) {
    console.error("[login-event] failed to record", error);
  }
}
