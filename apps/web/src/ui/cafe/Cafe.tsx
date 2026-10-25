"use client";

import type { GameUser, Role, TableSettingsInput } from "@dirtyworks/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorCodeOf, friendlyError } from "@/net/errors";
import { createTable, joinTable, lookupInviteCode, stashRoom } from "@/net/tables";
import { useLobby, type TableRow } from "@/net/useLobby";
import { Avatar } from "@/ui/common/Avatar";
import { Button } from "@/ui/common/Button";
import { Logo } from "@/ui/common/Logo";
import { CafeScene } from "./CafeScene";
import { ChallengeBanner } from "./ChallengeBanner";
import { Chalkboard } from "./Chalkboard";
import { CreateTableDialog } from "./CreateTableDialog";
import { ProfileDialog } from "./ProfileDialog";
import { Radio } from "./Radio";
import { TableFullDialog } from "@/ui/hud/TableFullDialog";
import { JoinByCodeDialog, PasswordDialog } from "./SmallDialogs";

interface Target {
  roomId: string;
  name: string;
}

const GREETINGS = ["Another round of dirt?", "Pull up a chair.", "The sandbox is warm."];

export function Cafe({ user, signOut }: { user: GameUser; signOut: () => Promise<void> }) {
  const router = useRouter();
  const lobby = useLobby();
  const [greeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [locked, setLocked] = useState<Target | null>(null);
  const [passwordError, setPasswordError] = useState("");
  const [full, setFull] = useState<(Target & { password?: string }) | null>(null);
  const [waiting, setWaiting] = useState(false);

  const firstName = user.name.split(" ")[0] || user.name;
  const fullRow = full ? lobby.tables.find((t) => t.roomId === full.roomId) : undefined;
  const seatOpen = waiting && !!fullRow && fullRow.drivers < fullRow.maxPlayers;

  async function enter(target: Target, role: Role, password?: string) {
    setBusy(true);
    setBanner("");
    try {
      const room = await joinTable(target.roomId, { role, password });
      stashRoom(room);
      router.push(`/table/${room.roomId}${role === "spectator" ? "?as=spectator" : ""}`);
    } catch (err) {
      const code = errorCodeOf(err);
      if (code === "BAD_PASSWORD") {
        setLocked(target);
        setPasswordError(friendlyError(err));
      } else if (code === "TABLE_FULL") {
        setLocked(null);
        setFull({ ...target, password });
      } else {
        setLocked(null);
        setBanner(friendlyError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function pick(row: TableRow) {
    const target = { roomId: row.roomId, name: row.name };
    if (row.locked) {
      setPasswordError("");
      setLocked(target);
    } else if (row.drivers >= row.maxPlayers) {
      setWaiting(false);
      setFull(target);
    } else {
      void enter(target, "driver");
    }
  }

  async function create(settings: TableSettingsInput) {
    setBusy(true);
    setCreateError("");
    try {
      const room = await createTable(settings);
      stashRoom(room);
      router.push(`/table/${room.roomId}`);
    } catch (err) {
      setCreateError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function byCode(code: string) {
    setBusy(true);
    setCodeError("");
    try {
      const found = await lookupInviteCode(code.trim());
      if (!found) {
        setCodeError("No table answers to that code. Double-check the letters?");
        return;
      }
      setCodeOpen(false);
      const target = { roomId: found.roomId, name: "Private table" };
      if (found.locked) {
        setPasswordError("");
        setLocked(target);
      } else {
        await enter(target, "driver");
      }
    } catch (err) {
      setCodeError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <CafeScene className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-coffee-950/30 via-transparent to-coffee-950/70" />

      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Logo size="sm" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="flex items-center gap-2 rounded-full bg-coffee-900/70 py-1 pr-3 pl-1 text-sm font-semibold hover:bg-coffee-800"
          >
            <Avatar name={user.name} src={user.avatar} size={30} />
            <span className="max-w-[10rem] truncate">{user.name}</span>
          </button>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 pb-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="lg:col-span-2">
          <h1 className="text-3xl font-bold text-cream-50 drop-shadow sm:text-4xl">
            Hey {firstName}. {greeting}
          </h1>
          <p className="text-cream-200">Pick a table, grab a controller, and make a mess.</p>
          {banner && (
            <p role="alert" className="mt-3 rounded-xl bg-brick-500 px-4 py-2 text-cream-50">
              {banner}
            </p>
          )}
        </div>

        <Chalkboard
          tables={lobby.tables}
          status={lobby.status}
          error={lobby.error}
          ping={lobby.ping}
          onPick={pick}
          onCreate={() => setCreateOpen(true)}
        />

        <aside className="grid content-start gap-4">
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" onClick={() => setCreateOpen(true)} disabled={busy}>
              Open a table
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setCodeOpen(true)} disabled={busy}>
              Join by code
            </Button>
          </div>
          <ChallengeBanner />
          <Radio />
        </aside>
      </main>

      <CreateTableDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultName={`${firstName}'s table`.slice(0, 32)}
        busy={busy}
        error={createError}
        onCreate={create}
      />
      <JoinByCodeDialog
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        busy={busy}
        error={codeError}
        onSubmit={byCode}
      />
      <PasswordDialog
        open={locked !== null}
        tableName={locked?.name ?? ""}
        onClose={() => setLocked(null)}
        busy={busy}
        error={passwordError}
        onSubmit={(pw) => locked && enter(locked, "driver", pw)}
      />
      <TableFullDialog
        open={full !== null}
        tableName={full?.name ?? ""}
        waiting={waiting}
        seatOpen={seatOpen}
        onClose={() => {
          setFull(null);
          setWaiting(false);
        }}
        onWait={() => setWaiting(true)}
        onSpectate={() => full && enter(full, "spectator", full.password)}
        onJoin={() => full && enter(full, "driver", full.password)}
      />
      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} user={user} />
    </div>
  );
}
