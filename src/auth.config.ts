import type { NextAuthConfig } from "next-auth";

const THIRTY_DAYS = 30 * 24 * 60 * 60;

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: THIRTY_DAYS },
  jwt: { maxAge: THIRTY_DAYS },
  // Default to session-only cookie; /api/auth/remember promotes to persistent on opt-in.
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = nextUrl.pathname.startsWith("/login");

      if (isLoginPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return true;
      }

      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = (user as { id?: string }).id ?? token.sub ?? "";
        token.role =
          (user as { role?: "admin" | "owner" | "viewer" }).role ?? "owner";
        token.rememberMe =
          (user as { rememberMe?: boolean }).rememberMe === true;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.role =
          (token.role as "admin" | "owner" | "viewer") ?? "owner";
        session.user.rememberMe = token.rememberMe === true;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
