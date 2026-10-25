/**
 * Merges keyboard, gamepad and touch into one InputState per frame (the `inputs` phase).
 * Edge-triggered actions (camera toggle, horn…) are available via `pressed(action)` for one frame.
 */
import { ACTIONS, BINDINGS, GAMEPAD, type Action } from "./controls";
import { touchInput } from "./touchInput";

export interface InputState {
  /** x: steer, right +1. y: throttle, forward +1. */
  drive: { x: number; y: number };
  handbrake: boolean;
  horn: boolean;
  /** Tool axes 0..3, each −1..1. */
  tool: [number, number, number, number];
  /** Which device last produced input (for the transmitter overlay). */
  device: "keyboard" | "gamepad" | "touch";
}

const codeToActions = new Map<string, Action[]>();
for (const action of ACTIONS) {
  for (const code of BINDINGS[action]) {
    const list = codeToActions.get(code) ?? [];
    list.push(action);
    codeToActions.set(code, list);
  }
}

/** Keys the browser would otherwise use for scrolling while you drive. */
const PREVENT = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

const dead = (v: number) => (Math.abs(v) < GAMEPAD.deadzone ? 0 : v);
const clamp1 = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

export class InputSystem {
  readonly state: InputState = {
    drive: { x: 0, y: 0 },
    handbrake: false,
    horn: false,
    tool: [0, 0, 0, 0],
    device: "keyboard",
  };
  /** When false (chat open, garage, dialogs) driving input is zeroed. */
  enabled = true;

  private readonly held = new Set<Action>();
  private readonly pendingEdges = new Set<Action>();
  private readonly frameEdges = new Set<Action>();
  private readonly prevPad = new Map<number, boolean>();

  attach(target: Window): () => void {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const actions = codeToActions.get(e.code);
      if (!actions) return;
      if (PREVENT.has(e.code)) e.preventDefault();
      for (const a of actions) {
        if (!e.repeat) this.pendingEdges.add(a);
        this.held.add(a);
      }
      this.state.device = "keyboard";
    };
    const up = (e: KeyboardEvent) => {
      const actions = codeToActions.get(e.code);
      if (actions) for (const a of actions) this.held.delete(a);
    };
    const blur = () => this.held.clear();
    target.addEventListener("keydown", down);
    target.addEventListener("keyup", up);
    target.addEventListener("blur", blur);
    return () => {
      target.removeEventListener("keydown", down);
      target.removeEventListener("keyup", up);
      target.removeEventListener("blur", blur);
      this.held.clear();
    };
  }

  /** Fires an edge-triggered action from an on-screen button (touch transmitter). */
  trigger(action: Action): void {
    this.pendingEdges.add(action);
  }

  /** True during the one frame after the action's key/button went down. */
  pressed(action: Action): boolean {
    return this.frameEdges.has(action);
  }

  isHeld(action: Action): boolean {
    return this.held.has(action);
  }

  update(): void {
    this.frameEdges.clear();
    for (const a of this.pendingEdges) this.frameEdges.add(a);
    this.pendingEdges.clear();

    const s = this.state;
    const h = this.held;
    const key = (neg: Action, pos: Action) => (h.has(pos) ? 1 : 0) - (h.has(neg) ? 1 : 0);
    let dx = key("left", "right");
    let dy = key("back", "forward");
    const tool = s.tool;
    tool[0] = key("tool0Neg", "tool0Pos");
    tool[1] = key("tool1Neg", "tool1Pos");
    tool[2] = key("tool2Neg", "tool2Pos");
    tool[3] = key("tool3Neg", "tool3Pos");
    let handbrake = h.has("handbrake");
    let horn = h.has("horn");

    this.readGamepad((pad) => {
      const ax = pad.axes;
      const b = (i: number) => pad.buttons[i]?.pressed ?? false;
      const v = (i: number) => pad.buttons[i]?.value ?? 0;
      const steer = dead(ax[GAMEPAD.axes.steer] ?? 0);
      const throttle = -dead(ax[GAMEPAD.axes.throttle] ?? 0);
      const toolX = dead(ax[GAMEPAD.axes.toolX] ?? 0);
      const toolY = -dead(ax[GAMEPAD.axes.toolY] ?? 0);
      const trig = v(GAMEPAD.buttons.toolTriggerPos) - v(GAMEPAD.buttons.toolTriggerNeg);
      const bump =
        (b(GAMEPAD.buttons.toolBumperPos) ? 1 : 0) - (b(GAMEPAD.buttons.toolBumperNeg) ? 1 : 0);
      if (steer || throttle || toolX || toolY || trig || bump) s.device = "gamepad";
      if (steer) dx = steer;
      if (throttle) dy = throttle;
      if (trig) tool[0] = trig;
      if (toolY) tool[1] = toolY;
      if (bump) tool[2] = bump;
      if (toolX) tool[3] = toolX;
      handbrake ||= b(GAMEPAD.buttons.handbrake);
      horn ||= b(GAMEPAD.buttons.horn);
      this.padEdge(pad, GAMEPAD.buttons.camera, "camera");
      this.padEdge(pad, GAMEPAD.buttons.garage, "garage");
      this.padEdge(pad, GAMEPAD.buttons.playerList, "playerList");
      this.padEdge(pad, GAMEPAD.buttons.horn, "horn");
      this.padEdge(pad, GAMEPAD.buttons.dpadUp, "emote1");
      this.padEdge(pad, GAMEPAD.buttons.dpadRight, "emote2");
      this.padEdge(pad, GAMEPAD.buttons.dpadDown, "emote3");
      this.padEdge(pad, GAMEPAD.buttons.dpadLeft, "emote4");
      this.padEdge(pad, GAMEPAD.buttons.toolBumperNeg, "specPrev");
      this.padEdge(pad, GAMEPAD.buttons.toolBumperPos, "specNext");
    });

    if (touchInput.active) {
      const t = touchInput;
      if (t.left.x || t.left.y || t.right.x || t.right.y || t.rocker0 || t.rocker2) {
        s.device = "touch";
      }
      if (t.left.x) dx = t.left.x;
      if (t.left.y) dy = t.left.y;
      if (t.rocker0) tool[0] = t.rocker0;
      if (t.right.y) tool[1] = t.right.y;
      if (t.rocker2) tool[2] = t.rocker2;
      if (t.right.x) tool[3] = t.right.x;
      handbrake ||= t.handbrake;
      if (t.horn && !horn) {
        horn = true;
      }
    }

    if (!this.enabled) {
      dx = dy = 0;
      tool[0] = tool[1] = tool[2] = tool[3] = 0;
      handbrake = horn = false;
    }
    s.drive.x = clamp1(dx);
    s.drive.y = clamp1(dy);
    for (let i = 0; i < 4; i++) tool[i] = clamp1(tool[i]!);
    s.handbrake = handbrake;
    s.horn = horn;
  }

  private readGamepad(fn: (pad: Gamepad) => void): void {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return;
    for (const pad of navigator.getGamepads()) {
      if (pad && pad.connected && pad.mapping === "standard") {
        fn(pad);
        return;
      }
    }
  }

  private padEdge(pad: Gamepad, button: number, action: Action): void {
    const now = pad.buttons[button]?.pressed ?? false;
    const was = this.prevPad.get(button) ?? false;
    if (now && !was) this.frameEdges.add(action);
    this.prevPad.set(button, now);
  }
}
