import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sessionToGameUser } from "@/lib/gameToken";
import { Cafe } from "@/ui/cafe/Cafe";
import { signOutAction } from "../actions";

export const metadata: Metadata = { title: "The cafe · project-dirtyworks" };

export default async function CafePage() {
  const user = sessionToGameUser(await auth());
  if (!user) redirect("/?next=/cafe");
  return <Cafe user={user} signOut={signOutAction} />;
}
