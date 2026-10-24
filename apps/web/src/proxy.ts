/** Optimistic route guard: signed-out visitors go back to the landing page. */
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  if (!req.auth?.user?.id) {
    const url = new URL("/", req.nextUrl);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: ["/cafe/:path*", "/table/:path*"],
};
