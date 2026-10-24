/**
 * Mutable touch state written by the on-screen RC transmitter and read by the InputSystem each
 * frame. Plain module state (no React) so the hot path never allocates or re-renders.
 */
export const touchInput = {
  active: false,
  /** Left stick: x = steer (right +), y = throttle (forward +). */
  left: { x: 0, y: 0 },
  /** Right stick: x = tool axis 3, y = tool axis 1. */
  right: { x: 0, y: 0 },
  /** Rocker switches for tool axes 0 and 2 (−1, 0, +1). */
  rocker0: 0,
  rocker2: 0,
  handbrake: false,
  horn: false,
};

export function resetTouch(): void {
  touchInput.left.x = touchInput.left.y = 0;
  touchInput.right.x = touchInput.right.y = 0;
  touchInput.rocker0 = touchInput.rocker2 = 0;
  touchInput.handbrake = touchInput.horn = false;
}
