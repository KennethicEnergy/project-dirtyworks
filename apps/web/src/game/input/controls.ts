/**
 * Every binding in one place so it can be remapped later. Keys are KeyboardEvent.code values
 * (layout-independent positions).
 */
import type { ToolAxis, VehicleSpec } from "@dirtyworks/shared";

export const ACTIONS = [
  "forward",
  "back",
  "left",
  "right",
  "handbrake",
  "horn",
  "garage",
  "chat",
  "playerList",
  "camera",
  "photo",
  "perf",
  "tool0Neg",
  "tool0Pos",
  "tool1Neg",
  "tool1Pos",
  "tool2Neg",
  "tool2Pos",
  "tool3Neg",
  "tool3Pos",
  "emote1",
  "emote2",
  "emote3",
  "emote4",
  "emote5",
  "specPrev",
  "specNext",
] as const;
export type Action = (typeof ACTIONS)[number];

export const BINDINGS: Record<Action, string[]> = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  handbrake: ["Space"],
  horn: ["KeyH"],
  garage: ["KeyG"],
  chat: ["Enter"],
  playerList: ["Tab"],
  camera: ["KeyV"],
  photo: ["KeyP"],
  perf: ["F3"],
  tool0Neg: ["KeyQ"],
  tool0Pos: ["KeyE"],
  tool1Neg: ["KeyF"],
  tool1Pos: ["KeyR"],
  tool2Neg: ["KeyK"],
  tool2Pos: ["KeyI"],
  tool3Neg: ["KeyJ"],
  tool3Pos: ["KeyL"],
  emote1: ["Digit1"],
  emote2: ["Digit2"],
  emote3: ["Digit3"],
  emote4: ["Digit4"],
  emote5: ["Digit5"],
  // Spectators have no vehicle, so the arrow keys cycle between drivers instead.
  specPrev: ["ArrowLeft"],
  specNext: ["ArrowRight"],
};

export const SPECTATOR_ACTIONS: readonly Action[] = ["specPrev", "specNext"];

export const TOOL_AXIS_ACTIONS: Record<ToolAxis, [neg: Action, pos: Action]> = {
  0: ["tool0Neg", "tool0Pos"],
  1: ["tool1Neg", "tool1Pos"],
  2: ["tool2Neg", "tool2Pos"],
  3: ["tool3Neg", "tool3Pos"],
};

/** Standard-mapping gamepad: buttons and axes (https://w3c.github.io/gamepad/#remapping). */
export const GAMEPAD = {
  axes: { steer: 0, throttle: 1, toolX: 2, toolY: 3 },
  buttons: {
    handbrake: 0,
    horn: 3,
    toolBumperNeg: 4,
    toolBumperPos: 5,
    toolTriggerNeg: 6,
    toolTriggerPos: 7,
    playerList: 8,
    garage: 9,
    camera: 11,
    dpadUp: 12,
    dpadDown: 13,
    dpadLeft: 14,
    dpadRight: 15,
  },
  deadzone: 0.15,
} as const;

const NAMED: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  F3: "F3",
};

export function keyLabel(code: string): string {
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

export function actionLabel(action: Action): string {
  return keyLabel(BINDINGS[action][0]!);
}

export interface ToolHintRow {
  axis: ToolAxis;
  negKey: string;
  posKey: string;
  negLabel: string;
  posLabel: string;
}

/** Per-vehicle tool hints for the bottom HUD, in joint order. */
export function toolHintRows(spec: VehicleSpec): ToolHintRow[] {
  return spec.joints.map((j) => {
    const [neg, pos] = TOOL_AXIS_ACTIONS[j.input];
    return {
      axis: j.input,
      negKey: actionLabel(neg),
      posKey: actionLabel(pos),
      negLabel: j.hints[0],
      posLabel: j.hints[1],
    };
  });
}
