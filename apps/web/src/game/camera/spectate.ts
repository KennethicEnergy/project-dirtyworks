/** Which driver a spectator watches: ←/→ cycle through the drivers in roster order. */

export function cycleSpectate(
  drivers: readonly string[],
  current: string | null,
  dir: 1 | -1,
): string | null {
  if (drivers.length === 0) return null;
  const i = current === null ? -1 : drivers.indexOf(current);
  if (i < 0) return drivers[0]!;
  return drivers[(i + dir + drivers.length) % drivers.length]!;
}

/** Keeps the current target while it is still driving; otherwise the first driver (or none). */
export function keepSpectate(drivers: readonly string[], current: string | null): string | null {
  if (current !== null && drivers.includes(current)) return current;
  return drivers[0] ?? null;
}
