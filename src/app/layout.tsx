import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import "./globals.css";

// Inter — SF-Pro-alike, the de-facto web typeface for Apple-feel UI.
// Variable font: we load the full weight range so the hero can pull
// 800 for display sizes while body stays at 400/500.
const interSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

// JetBrains Mono — tighter than Geist Mono, reads cleaner for tickers
// and tabular numbers in the trading UI.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "AI Edge",
  description: "Brooks Price Action trading command center",
  // PWA bits — manifest is served from app/manifest.ts; the SVG
  // icons live at app/icon.svg + app/apple-icon.svg and Next.js
  // wires up the appropriate <link rel> tags automatically.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "AI Edge",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#141414",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let userEmail: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  }

  return (
    <html
      lang="en"
      className={`dark ${interSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-[100dvh] bg-bg text-text flex flex-col">
        <SiteNav userEmail={userEmail} />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
