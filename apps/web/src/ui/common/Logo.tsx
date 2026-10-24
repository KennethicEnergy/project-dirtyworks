/** Wordmark with a small excavator drawn from primitives. Original artwork. */
export function ExcavatorIcon({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Excavator"
    >
      {/* tracks */}
      <rect x="6" y="46" width="34" height="11" rx="5.5" fill="#2b2622" />
      <circle cx="12" cy="51.5" r="3" fill="#6b625a" />
      <circle cx="23" cy="51.5" r="3" fill="#6b625a" />
      <circle cx="34" cy="51.5" r="3" fill="#6b625a" />
      {/* body and cab */}
      <rect x="9" y="34" width="28" height="12" rx="2.5" fill="#f5c518" />
      <rect x="11" y="22" width="15" height="13" rx="2" fill="#f5c518" />
      <rect x="14" y="25" width="9" height="7" rx="1" fill="#9bc7d6" />
      {/* boom, stick, bucket */}
      <path d="M33 36 L44 18 L48 20 L38 38 Z" fill="#e0ad10" />
      <path d="M44 18 L56 30 L53 33 L42 22 Z" fill="#e0ad10" />
      <path d="M52 31 L60 34 L58 43 L49 40 Z" fill="#2b2622" />
      <circle cx="44.5" cy="19.5" r="2.2" fill="#2b2622" />
      {/* antenna */}
      <line x1="13" y1="22" x2="10" y2="12" stroke="#2b2622" strokeWidth="1.5" />
      <circle cx="10" cy="11" r="1.6" fill="#b5452f" />
    </svg>
  );
}

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const icon = size === "lg" ? 64 : size === "md" ? 44 : 32;
  const text = size === "lg" ? "text-4xl sm:text-5xl" : size === "md" ? "text-2xl" : "text-lg";
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <ExcavatorIcon size={icon} />
      <span className={`font-stencil tracking-wide text-cream-50 ${text}`}>
        project-<span className="text-safety">dirtyworks</span>
      </span>
    </span>
  );
}
