"use client";

import type {
  ChatEntry,
  DayNight,
  MapId,
  MaterialId,
  NoticeEvent,
  Role,
  SpawnedEvent,
} from "@dirtyworks/shared";
import { create } from "zustand";

export type SessionStatus = "connecting" | "joined" | "reconnecting" | "closed" | "error";

export interface PlayerSummary {
  sessionId: string;
  userId: string;
  name: string;
  avatar: string;
  role: Role;
  vehicle: string;
  connected: boolean;
  ping: number;
  isHost: boolean;
  isMe: boolean;
}

export interface Toast {
  id: number;
  text: string;
  kind: NoticeEvent["kind"] | "error";
}

/** What the table UI renders. Written by the table session at low rates, never per frame. */
interface SessionState {
  status: SessionStatus;
  error: string;
  closedReason: string;
  roomId: string;
  sessionId: string;
  role: Role;
  tableName: string;
  inviteCode: string;
  mapId: MapId | null;
  materialId: MaterialId | null;
  hostId: string;
  dayNight: DayNight;
  keepForLater: boolean;
  players: PlayerSummary[];
  chat: ChatEntry[];
  toasts: Toast[];
  spawn: SpawnedEvent | null;
  set: (patch: Partial<Omit<SessionState, "set" | "pushToast" | "dropToast">>) => void;
  pushToast: (text: string, kind: Toast["kind"]) => void;
  dropToast: (id: number) => void;
}

let toastSeq = 0;

export const initialSession = {
  status: "connecting" as SessionStatus,
  error: "",
  closedReason: "",
  roomId: "",
  sessionId: "",
  role: "driver" as Role,
  tableName: "",
  inviteCode: "",
  mapId: null,
  materialId: null,
  hostId: "",
  dayNight: "day" as DayNight,
  keepForLater: false,
  players: [] as PlayerSummary[],
  chat: [] as ChatEntry[],
  toasts: [] as Toast[],
  spawn: null,
};

export const useSession = create<SessionState>((set) => ({
  ...initialSession,
  set: (patch) => set(patch),
  pushToast: (text, kind) =>
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id: ++toastSeq, text, kind }] })),
  dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
