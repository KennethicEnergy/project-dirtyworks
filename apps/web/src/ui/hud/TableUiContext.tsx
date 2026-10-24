"use client";

import type { GameUser } from "@dirtyworks/shared";
import { createContext, useContext } from "react";
import type { GameRuntime } from "@/game/runtime";
import type { TableSession } from "@/net/tableSession";

export interface TableUi {
  runtime: GameRuntime;
  session: TableSession | null;
  user: GameUser;
}

export const TableUiContext = createContext<TableUi | null>(null);

export function useTableUi(): TableUi {
  const ui = useContext(TableUiContext);
  if (!ui) throw new Error("useTableUi() outside <TableUiContext>");
  return ui;
}
