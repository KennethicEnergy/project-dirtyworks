/** Per-player wrapper around `validateMovement`: last valid pose, server-side dt, strike counter. */
import {
  copyPose,
  identityPose,
  validateMovement,
  type Bounds,
  type MovementReason,
  type Pose,
  type VehicleSpec,
} from "@dirtyworks/shared";

/** Consecutive rejected updates before the client is told to snap back. */
export const STRIKES_BEFORE_CORRECTION = 3;

export type GuardResult =
  { ok: true } | { ok: false; reason: MovementReason; correction: Pose | null };

export class MovementGuard {
  readonly lastValid: Pose = identityPose();
  private lastAt = 0;
  private strikes = 0;

  constructor(
    private spec: VehicleSpec,
    private readonly bounds: Bounds,
  ) {}

  /** Spawning (or a correction) is the only allowed teleport. */
  reset(pose: Pose, nowMs: number, spec: VehicleSpec = this.spec): void {
    this.spec = spec;
    copyPose(pose, this.lastValid);
    this.lastAt = nowMs;
    this.strikes = 0;
  }

  accept(next: Pose, nowMs: number): GuardResult {
    const dt = (nowMs - this.lastAt) / 1000;
    const check = validateMovement(this.lastValid, next, this.spec, this.bounds, dt);
    if (check.ok) {
      copyPose(next, this.lastValid);
      this.lastAt = nowMs;
      this.strikes = 0;
      return check;
    }
    this.strikes++;
    if (this.strikes >= STRIKES_BEFORE_CORRECTION) {
      this.strikes = 0;
      this.lastAt = nowMs;
      return {
        ok: false,
        reason: check.reason,
        correction: copyPose(this.lastValid, identityPose()),
      };
    }
    return { ok: false, reason: check.reason, correction: null };
  }
}
