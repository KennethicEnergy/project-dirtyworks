"use client";

import { useEffect } from "react";
import { useSession, type Toast } from "@/state/sessionStore";

const LIFETIME_MS = 4500;

function ToastItem({ toast }: { toast: Toast }) {
  const drop = useSession((s) => s.dropToast);
  useEffect(() => {
    const t = setTimeout(() => drop(toast.id), LIFETIME_MS);
    return () => clearTimeout(t);
  }, [toast.id, drop]);
  const tone =
    toast.kind === "error" || toast.kind === "kick" || toast.kind === "ban"
      ? "bg-brick-500 text-cream-50"
      : "bg-hud/85 text-cream-50";
  return <li className={`rounded-full px-4 py-1.5 text-sm shadow-card ${tone}`}>{toast.text}</li>;
}

/** Join/leave/host notices and errors, top center, auto-dismissing. */
export function Toasts() {
  const toasts = useSession((s) => s.toasts);
  return (
    <ul aria-live="polite" className="pointer-events-none flex flex-col items-center gap-1">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </ul>
  );
}
