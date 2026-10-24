import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sessionToGameUser } from "@/lib/gameToken";
import { TableClient } from "./TableClient";

export const metadata: Metadata = { title: "At the table · project-dirtyworks" };

export default async function TablePage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const { roomId } = await params;
  const { as } = await searchParams;
  const user = sessionToGameUser(await auth());
  if (!user) redirect(`/?next=/table/${encodeURIComponent(roomId)}`);
  return <TableClient roomId={roomId} user={user} spectator={as === "spectator"} />;
}
