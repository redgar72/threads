import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;
      const isPublic =
        pathname === "/login" ||
        pathname === "/register" ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/gitlab/oauth/callback");

      if (isPublic) {
        if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
          return Response.redirect(new URL("/", request.nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) return false;
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.name = token.name ?? session.user.name;
        session.user.email = token.email ?? session.user.email;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
