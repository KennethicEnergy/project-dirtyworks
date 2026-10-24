/**
 * Auth.js: Google is the only production provider. A "guest" credentials provider exists only
 * when AUTH_DEV_LOGIN=true outside production, for local multi-window testing.
 */
import { cleanDisplayName } from "@dirtyworks/shared";
import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { devLoginEnabled } from "@/lib/env";

const guestSchema = z.object({ name: z.string().trim().min(2).max(24) });

const providers: Provider[] = [Google];

if (devLoginEnabled()) {
  providers.push(
    Credentials({
      id: "guest",
      name: "Guest (dev only)",
      credentials: { name: { label: "Name", type: "text" } },
      authorize(credentials) {
        const parsed = guestSchema.safeParse(credentials);
        if (!parsed.success) return null;
        return {
          id: `guest:${crypto.randomUUID()}`,
          name: cleanDisplayName(parsed.data.name),
          image: null,
        };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  trustHost: true,
  callbacks: {
    jwt({ token, user, account }) {
      if (account && user) {
        // Stable per-provider id: "google:<sub>" or "guest:<uuid>". Never the email.
        token.uid = account.provider === "google" ? `google:${account.providerAccountId}` : user.id;
        token.name = user.name;
        token.picture = user.image ?? null;
      }
      delete token.email;
      return token;
    },
    session({ session, token }) {
      session.user = {
        ...session.user,
        id: typeof token.uid === "string" ? token.uid : "",
        name: token.name ?? "",
        image: typeof token.picture === "string" ? token.picture : null,
        email: "",
      };
      return session;
    },
  },
});
