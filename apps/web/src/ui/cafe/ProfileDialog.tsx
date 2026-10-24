"use client";

import type { GameUser } from "@dirtyworks/shared";
import { useProfile } from "@/state/profileStore";
import { Avatar } from "@/ui/common/Avatar";
import { Dialog } from "@/ui/common/Dialog";
import { LiveryPicker } from "@/ui/common/LiveryPicker";

export function ProfileDialog({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: GameUser;
}) {
  const livery = useProfile((s) => s.livery);
  const setLivery = useProfile((s) => s.setLivery);
  return (
    <Dialog open={open} onClose={onClose} title="Your operator card">
      <div className="mb-5 flex items-center gap-3 rounded-2xl bg-cream-200 p-3">
        <Avatar name={user.name} src={user.avatar} size={48} />
        <div>
          <p className="text-lg font-bold">{user.name}</p>
          <p className="text-xs text-coffee-500">
            Your name and photo come from Google. We never show your email.
          </p>
        </div>
      </div>
      <h3 className="mb-2 font-bold">Default livery</h3>
      <LiveryPicker value={livery} onChange={setLivery} />
      <p className="mt-4 text-xs text-coffee-500">
        Saved on this device and shown to everyone at your table.
      </p>
    </Dialog>
  );
}
