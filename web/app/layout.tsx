import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";

// Self-hosted by Next at build time: no request to Google from a coach's phone.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  // Link previews need absolute URLs. Set NEXT_PUBLIC_SITE_URL to the live
  // address once it is deployed; locally this falls back to the dev server.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Matchup Prep",
  description:
    "Pick an opposing starter and see which of his pitches each Blue Jays hitter handles, and which he doesn't.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#134a8e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <header className="site-head">
          <div className="site-head-inner">
            <Link href="/" className="site-name">
              <span className="site-mark" aria-hidden="true">
                MP
              </span>
              Matchup Prep
            </Link>
            <Link href="/how-it-works" className="site-nav">
              How it works
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
