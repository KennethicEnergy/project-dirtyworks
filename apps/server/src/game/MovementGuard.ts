/**
 * Per-player wrapper around `validateMovement`: last valid pose, server-side dt, strike counter,
 * and the displacement-slack budget that keeps sustained speed near the vehicle's top speed.
 */
import {
  copyPose,
  excessDisplacement,
  identityPose,
  MOVEMENT_TOLERANCE,
  validateMovement,
  type Bounds,
  type MovementCheck,
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
  /** Displacement slack left (m): spent by moves beyond top speed, refilled with time. */
  private slack: number = MOVEMENT_TOLERANCE.slackBudget;

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
    this.slack = MOVEMENT_TOLERANCE.slackBudget;
  }

  accept(next: Pose, nowMs: number): GuardResult {
    const T = MOVEMENT_TOLERANCE;
    const dt = (nowMs - this.lastAt) / 1000;
    let check: MovementCheck = validateMovement(this.lastValid, next, this.spec, this.bounds, dt);
    let slack = this.slack;
    let excess = 0;
    if (check.ok) {
      slack = Math.min(T.slackBudget, slack + Math.max(0, dt) * T.slackRefill);
      excess = excessDisplacement(this.lastValid, next, this.spec, dt);
      if (excess > slack) check = { ok: false, reason: "overspeed" };
    }
    if (check.ok) {
      copyPose(next, this.lastValid);
      this.lastAt = nowMs;
      this.strikes = 0;
      this.slack = slack - excess;
      return check;
    }
    this.strikes++;
    if (this.strikes >= STRIKES_BEFORE_CORRECTION) {
      this.strikes = 0;
      this.lastAt = nowMs;
      // The client stops dead when it snaps back; judging its next update against the old
      // velocity would reject it (sharp Δv) again and again.
      this.lastValid.vx = this.lastValid.vy = this.lastValid.vz = 0;
      return {
        ok: false,
        reason: check.reason,
        correction: copyPose(this.lastValid, identityPose()),
      };
    }
    return { ok: false, reason: check.reason, correction: null };
  }
}
