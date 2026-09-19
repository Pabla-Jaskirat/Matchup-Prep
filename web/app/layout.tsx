import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Matchup Prep",
  description: "Which pitches in tonight's starter's arsenal each hitter handles well.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
