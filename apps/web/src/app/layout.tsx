import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "project-dirtyworks",
  description: "A cozy RC hobby cafe for grown-up kids.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
