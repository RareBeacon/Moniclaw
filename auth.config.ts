import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth configuration (no Prisma adapter, no Node-only deps).
 * Middleware imports this; the full Node config lives in `auth.ts`.
 *
 * Session expiry is enforced per-token (`exp` claim set in auth.ts based on
 * Remember Me); Auth.js rejects expired tokens during decode, so middleware
 * automatically bounces expired sessions to /login.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // Absolute ceiling; Remember Me toggles per-token expiry below this.
    maxAge: 30 * 24 * 60 * 60,
  },
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
  },
  providers: [], // configured in auth.ts (needs Node runtime)
} satisfies NextAuthConfig;
