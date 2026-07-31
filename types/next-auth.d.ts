import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    sessionVersion?: number;
    /** Whether the user asked for a 30-day session at sign-in. */
    remember?: boolean;
  }

  interface Session {
    user: {
      id: string;
      sessionVersion?: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sessionVersion?: number;
  }
}

export {};
