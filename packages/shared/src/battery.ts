/** RC battery: drains with use, never stops the vehicle, recharges at the charging station. */
export const BATTERY = {
  idleDrainPerSec: 1 / 7200,
  driveDrainPerSec: 1 / 650,
  toolDrainPerSec: 1 / 1200,
  chargePerSec: 1 / 25,
  lowThreshold: 0.2,
  lowSpeedFactor: 0.45,
  /** Distance (m) from the charging station prop within which a vehicle charges. */
  stationRadius: 7,
} as const;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** `throttle` and `tool` are 0..1 activity levels for this step. */
export function drainBattery(level: number, throttle: number, tool: number, dt: number): number {
  const rate =
    BATTERY.idleDrainPerSec +
    clamp01(Math.abs(throttle)) * BATTERY.driveDrainPerSec +
    clamp01(Math.abs(tool)) * BATTERY.toolDrainPerSec;
  return clamp01(level - rate * dt);
}

export function chargeBattery(level: number, dt: number): number {
  return clamp01(level + BATTERY.chargePerSec * dt);
}

/** Multiplier on top speed: full above the low threshold, ramping down to 45% at empty. */
export function batterySpeedFactor(level: number): number {
  const l = clamp01(level);
  if (l >= BATTERY.lowThreshold) return 1;
  return BATTERY.lowSpeedFactor + (1 - BATTERY.lowSpeedFactor) * (l / BATTERY.lowThreshold);
}
