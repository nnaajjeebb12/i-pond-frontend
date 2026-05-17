import type { DefaultSession } from "next-auth";

export type Role = "admin" | "owner" | "viewer";

declare module "next-auth" {
  interface User {
    id: string;
    role: Role;
    rememberMe?: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      rememberMe?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    rememberMe?: boolean;
  }
}
