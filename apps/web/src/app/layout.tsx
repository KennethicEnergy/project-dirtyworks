import type { Metadata, Viewport } from "next";
import { Fredoka, Saira_Stencil } from "next/font/google";
import "./globals.css";

const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-fredoka", display: "swap" });
const stencil = Saira_Stencil({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-saira-stencil",
  adjustFontFallback: false,
  fallback: ["Impact", "Arial Black", "sans-serif"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "project-dirtyworks",
  description: "A cozy RC hobby cafe: drive tiny construction vehicles on shared sandbox tables.",
};

export const viewport: Viewport = {
  themeColor: "#26190f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${stencil.variable}`}>
      <body>{children}</body>
    </html>
  );
}
