import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

// Uses the edge-safe config (JWT only) — the adapter/DB stay in Node runtime.
export default NextAuth(authConfig).auth;

export const config = {
  // Run on app routes; skip static assets and the auth API itself.
  matcher: ["/((?!api|_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
