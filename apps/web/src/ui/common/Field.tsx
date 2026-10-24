import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const INPUT =
  "w-full rounded-xl border-2 border-coffee-400/40 bg-cream-50 px-3 py-2 text-coffee-900 placeholder:text-coffee-400 focus:border-brick-500 focus:outline-none";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-coffee-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-coffee-500">{hint}</span>}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${INPUT} ${props.className ?? ""}`} />;
}

export function ErrorNote({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-brick-500/15 px-3 py-2 text-sm text-brick-700">
      {children}
    </p>
  );
}
