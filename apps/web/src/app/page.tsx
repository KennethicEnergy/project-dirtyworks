import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { devLoginEnabled, googleConfigured } from "@/lib/env";
import { CafeScene } from "@/ui/cafe/CafeScene";
import { buttonClass } from "@/ui/common/Button";
import { Logo } from "@/ui/common/Logo";
import { signInAsGuest, signInWithGoogle } from "./actions";

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

export default async function Landing({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const session = await auth();
  if (session?.user?.id) {
    redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/cafe");
  }
  const guest = devLoginEnabled();
  const google = googleConfigured();

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-10">
      <CafeScene className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />
      <div className="fixed inset-0 -z-10 bg-coffee-950/45" />

      <main className="w-full max-w-md rounded-card bg-cream-100 p-6 text-coffee-900 shadow-card sm:p-8">
        <div className="-mx-6 -mt-6 mb-6 rounded-t-card bg-coffee-800 px-6 py-6 sm:-mx-8 sm:-mt-8 sm:px-8">
          <Logo size="md" />
        </div>
        <h1 className="text-2xl font-bold">A cozy RC hobby cafe for grown-up kids.</h1>
        <p className="mt-2 text-coffee-600">
          Pull up a chair at a miniature sandbox, grab a remote, and dig, haul and push dirt with
          friends. No scores, no stress. Just a perfectly good pile.
        </p>

        <form action={signInWithGoogle} className="mt-6">
          <input type="hidden" name="next" value={next ?? ""} />
          <button
            type="submit"
            disabled={!google}
            className={buttonClass("secondary", "lg", "w-full !bg-white ring-1 ring-coffee-400/40")}
          >
            <GoogleMark />
            Sign in with Google
          </button>
          {!google && (
            <p className="mt-2 text-xs text-brick-600">
              Google sign-in isn&apos;t configured yet: set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.
            </p>
          )}
        </form>

        {guest && (
          <form
            action={signInAsGuest}
            className="mt-6 rounded-2xl border-2 border-dashed border-coffee-400/50 p-4"
          >
            <input type="hidden" name="next" value={next ?? ""} />
            <p className="mb-2 text-xs font-bold tracking-widest text-coffee-500 uppercase">
              Dev only · guest login
            </p>
            <div className="flex gap-2">
              <input
                name="name"
                required
                minLength={2}
                maxLength={24}
                placeholder="Your name"
                aria-label="Guest name"
                className="min-w-0 flex-1 rounded-xl border-2 border-coffee-400/40 bg-cream-50 px-3 py-2"
              />
              <button type="submit" className={buttonClass("primary", "md")}>
                Enter
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-xs text-coffee-500">
          We use your Google name and photo so friends know who&apos;s driving. Your email never
          leaves our sign-in service.
        </p>
      </main>
    </div>
  );
}
