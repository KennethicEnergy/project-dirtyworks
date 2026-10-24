"use client";

import type { FormEvent } from "react";
import { Button } from "@/ui/common/Button";
import { Dialog } from "@/ui/common/Dialog";
import { ErrorNote, Field, TextInput } from "@/ui/common/Field";

export function JoinByCodeDialog({
  open,
  onClose,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  error: string;
  onSubmit: (code: string) => void;
}) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(String(new FormData(e.currentTarget).get("code") ?? ""));
  }
  return (
    <Dialog open={open} onClose={onClose} title="Join with an invite code">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Invite code" hint="Six letters and numbers, like K7Q2MX.">
          <TextInput
            name="code"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={8}
            className="font-mono text-xl tracking-[0.3em] uppercase"
            required
          />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? "Looking…" : "Find the table"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function PasswordDialog({
  open,
  tableName,
  onClose,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  tableName: string;
  onClose: () => void;
  busy: boolean;
  error: string;
  onSubmit: (password: string) => void;
}) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(String(new FormData(e.currentTarget).get("password") ?? ""));
  }
  return (
    <Dialog open={open} onClose={onClose} title={`“${tableName}” is locked`}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Table password">
          <TextInput name="password" type="password" autoFocus maxLength={32} required />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? "Knocking…" : "Sit down"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Friendly turn-taking prompt when every driver seat is taken. */
export function TableFullDialog({
  open,
  tableName,
  waiting,
  seatOpen,
  onClose,
  onSpectate,
  onWait,
  onJoin,
}: {
  open: boolean;
  tableName: string;
  waiting: boolean;
  seatOpen: boolean;
  onClose: () => void;
  onSpectate: () => void;
  onWait: () => void;
  onJoin: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Table is full">
      <p className="mb-4 text-coffee-700">
        Every driver seat at <strong>{tableName}</strong> is taken. Grab a coffee and watch, or wait
        for a seat to open up.
      </p>
      {seatOpen ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sage/25 p-3">
          <span className="font-semibold text-coffee-800">A seat just opened up!</span>
          <Button onClick={onJoin}>Take the seat</Button>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onWait} disabled={waiting}>
            {waiting ? "Waiting for a seat…" : "Wait for a seat"}
          </Button>
          <Button onClick={onSpectate}>Spectate</Button>
        </div>
      )}
    </Dialog>
  );
}
