import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";

// Self-hosted by Next at build time: no request to Google from a coach's phone.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

/**
 * The site's own address, for link previews: apps like Slack and LinkedIn
 * need the preview image's full URL. On Vercel the production domain comes
 * for free; NEXT_PUBLIC_SITE_URL is only for a custom domain.
 */
function siteUrl(): URL {
  if (process.env.NEXT_PUBLIC_SITE_URL) return new URL(process.env.NEXT_PUBLIC_SITE_URL);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
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
