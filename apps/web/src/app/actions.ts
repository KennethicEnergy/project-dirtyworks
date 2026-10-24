"use server";

import { signIn, signOut } from "@/auth";
import { devLoginEnabled } from "@/lib/env";

/** Only same-site paths are allowed as post-login destinations. */
function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/cafe";
}

export async function signInWithGoogle(formData: FormData) {
  await signIn("google", { redirectTo: safeNext(formData.get("next")) });
}

export async function signInAsGuest(formData: FormData) {
  if (!devLoginEnabled()) throw new Error("Guest login is disabled");
  await signIn("guest", {
    name: String(formData.get("name") ?? ""),
    redirectTo: safeNext(formData.get("next")),
  });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
