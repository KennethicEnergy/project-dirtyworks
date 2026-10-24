"use client";

import {
  MAP_IDS,
  MAPS,
  MATERIAL_IDS,
  MATERIALS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TABLE_RULE_LABELS,
  TABLE_RULES,
  tableSettingsSchema,
  VIBE_LABELS,
  VIBES,
  type MapId,
  type TableSettingsInput,
} from "@dirtyworks/shared";
import { useState, type FormEvent } from "react";
import { Button } from "@/ui/common/Button";
import { Dialog } from "@/ui/common/Dialog";
import { ErrorNote, Field, Select, TextInput } from "@/ui/common/Field";

export function CreateTableDialog({
  open,
  onClose,
  defaultName,
  busy,
  error,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  defaultName: string;
  busy: boolean;
  error: string;
  onCreate: (settings: TableSettingsInput) => void;
}) {
  const [mapId, setMapId] = useState<MapId>("mini-quarry");
  const [localError, setLocalError] = useState("");

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "").trim();
    const candidate: TableSettingsInput = {
      name: String(form.get("name") ?? ""),
      mapId,
      vibe: form.get("vibe") as TableSettingsInput["vibe"],
      rule: form.get("rule") as TableSettingsInput["rule"],
      maxPlayers: Number(form.get("maxPlayers")),
      visibility: form.get("visibility") === "private" ? "private" : "public",
      password: password || undefined,
      materialId: form.get("materialId") as TableSettingsInput["materialId"],
      terrainPersistence: form.get("persistence") === "none" ? "none" : "session",
      keepForLater: form.get("keepForLater") === "on",
    };
    const parsed = tableSettingsSchema.safeParse(candidate);
    if (!parsed.success) {
      setLocalError("Check the name (2–32 characters) and password (4+ characters).");
      return;
    }
    setLocalError("");
    onCreate(candidate);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Open a table" wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Table name">
            <TextInput name="name" defaultValue={defaultName} maxLength={32} required />
          </Field>
        </div>
        <Field label="Diorama" hint={MAPS[mapId].tagline}>
          <Select name="mapId" value={mapId} onChange={(e) => setMapId(e.target.value as MapId)}>
            {MAP_IDS.map((id) => (
              <option key={id} value={id}>
                {MAPS[id].displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Material">
          <Select name="materialId" key={mapId} defaultValue={MAPS[mapId].defaultMaterial}>
            {MATERIAL_IDS.map((id) => (
              <option key={id} value={id}>
                {MATERIALS[id].displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vibe">
          <Select name="vibe" defaultValue="chill">
            {VIBES.map((v) => (
              <option key={v} value={v}>
                {VIBE_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Table rule">
          <Select name="rule" defaultValue="free-play">
            {TABLE_RULES.map((r) => (
              <option key={r} value={r}>
                {TABLE_RULE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Drivers">
          <Select name="maxPlayers" defaultValue="4">
            {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map(
              (n) => (
                <option key={n} value={n}>
                  {n} drivers
                </option>
              ),
            )}
          </Select>
        </Field>
        <Field label="Who can find it">
          <Select name="visibility" defaultValue="public">
            <option value="public">Listed on the chalkboard</option>
            <option value="private">Invite code only</option>
          </Select>
        </Field>
        <Field label="Password (optional)" hint="4–32 characters. Leave empty for an open table.">
          <TextInput name="password" type="password" maxLength={32} autoComplete="off" />
        </Field>
        <Field label="Terrain">
          <Select name="persistence" defaultValue="session">
            <option value="session">Keep digs while the table is open</option>
            <option value="none">Reset when all drivers leave</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold text-coffee-700 sm:col-span-2">
          <input type="checkbox" name="keepForLater" className="size-4 accent-brick-500" />
          Keep this table for later (saved for 7 days so friends can come back)
        </label>
        <div className="sm:col-span-2">
          <ErrorNote>{localError || error}</ErrorNote>
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="ghost" className="!text-coffee-700" onClick={onClose}>
            Never mind
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Setting up…" : "Open the table"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
