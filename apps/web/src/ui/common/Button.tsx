import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "safety";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brick-500 text-cream-50 hover:bg-brick-400 active:bg-brick-600 shadow-[0_3px_0_var(--color-brick-700)]",
  secondary:
    "bg-cream-100 text-coffee-900 hover:bg-cream-50 active:bg-cream-200 shadow-[0_3px_0_var(--color-cream-300)]",
  ghost: "bg-transparent text-cream-100 hover:bg-cream-100/10",
  safety:
    "bg-safety text-hud hover:brightness-105 active:brightness-95 shadow-[0_3px_0_var(--color-safety-dark)]",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm rounded-xl",
  md: "px-4 py-2 text-base rounded-2xl",
  lg: "px-6 py-3 text-lg rounded-2xl",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = ""): string {
  return `inline-flex items-center justify-center gap-2 font-semibold transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}
