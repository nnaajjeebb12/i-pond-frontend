import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";
import { authConfig } from "./auth.config";

type OwnerRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "owner" | "viewer";
  password_hash: string;
  expires_at: Date | null;
};

class SubscriptionExpiredError extends CredentialsSignin {
  code = "SUBSCRIPTION_EXPIRED";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember Me", type: "text" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        const rememberMe = String(credentials?.rememberMe ?? "") === "true";
        if (!email || !password) return null;

        const { rows } = await pool.query<OwnerRow>(
          `SELECT id, name, email, role, password_hash, expires_at
             FROM owners
            WHERE LOWER(email) = $1
            LIMIT 1`,
          [email]
        );

        const user = rows[0];
        if (!user || !user.password_hash) return null;

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return null;

        if (user.expires_at !== null) {
          const now = new Date();
          if (new Date(user.expires_at).getTime() < now.getTime()) {
            throw new SubscriptionExpiredError();
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          rememberMe,
        };
      },
    }),
  ],
});
