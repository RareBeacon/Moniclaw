import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth configuration (no Prisma adapter, no Node-only deps).
 * Middleware imports this; the full Node config lives in `auth.ts`.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const { nextUrl } = request;
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      const isDashboard = pathname.startsWith("/dashboard");
      const isAuthPage =
        pathname.startsWith("/login") || pathname.startsWith("/signup");

      if (isDashboard && !isLoggedIn) {
        const loginUrl = new URL("/login", nextUrl);
        loginUrl.searchParams.set("next", pathname);
        return Response.redirect(loginUrl);
      }

      if (isAuthPage && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
  providers: [], // configured in auth.ts (needs Node runtime)
} satisfies NextAuthConfig;
