"use client";

import { initialsOf, isAllowedAvatarUrl } from "@dirtyworks/shared";
import { useState } from "react";

/** Google photo when allowed and loadable, otherwise initials on a warm chip. */
export function Avatar({
  name,
  src,
  size = 32,
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const usable = src && !failed && isAllowedAvatarUrl(src);
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.4) };
  if (usable) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ring-2 ring-cream-200/60 ${className}`}
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brick-500 font-semibold text-cream-50 ring-2 ring-cream-200/60 ${className}`}
      style={style}
    >
      {initialsOf(name)}
    </span>
  );
}
