import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Mona_Sans, Noto_Sans, Roboto } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import Providers from "./providers";
import { VividWidgetDock } from "@/components/voice/vivid-widget-dock";
import "./globals.css";

// Body and normal text. Geist is a variable font, so every weight (we default
// to medium in globals.css) ships in one file, no per-weight requests.
const geist = Geist({
  variable: "--font-body",
  subsets: ["latin"],
});

// Headers. Mona Sans, used at bold by the ws-display utility.
const monaSans = Mona_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

// Chess round uses the same type families Lichess does: Noto Sans for the
// surrounding table text and Roboto light for clocks. Kept as local variables
// so only chess opts into them.
const chessSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-chess-body",
});

const chessClock = Roboto({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-chess-clock",
});

// No `icons` here: app/icon.svg is picked up by file convention and emits the
// link tag itself. Declaring both would point the tab at the wide wordmark,
// which is what made the old icon unreadable.
export const metadata: Metadata = {
  title: "Ark",
  description:
    "The onchain superapp for global markets. Own stocks, gold, crypto and real-world assets from one self-custody account, funded in Naira.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Locale comes from the NEXT_LOCALE cookie (or Accept-Language on a first
  // visit) via i18n/request.ts. Reading it here makes rendering dynamic, which
  // the app already is everywhere that matters.
  const locale = await getLocale();
  const messages = await getMessages();

  // Public Vivid widget config (a publishable key), read on the server with the
  // deployed values as a fallback. Injected as a plain inline script so it runs
  // before widget.js and sets the global the widget reads.
  const vividConfig = {
    key: process.env.VIVID_API_KEY ?? "pk_live_xARDqkZFFwSnUPE4rN_cNU5d",
    api: process.env.VIVID_API_URL ?? "https://platformvivid.worldstreetgold.com",
  };

  return (
    <html
      lang={locale}
      className={`${geist.variable} ${monaSans.variable} ${chessSans.variable} ${chessClock.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        {/*
          The Vivid widget reads its key from document.currentScript, which is
          null for scripts next/script injects dynamically. Configure it via the
          window global it also supports so the key survives that injection.

          Both scripts use afterInteractive so next/script injects them
          imperatively (document.createElement in an effect) rather than rendering
          a real <script> element. A rendered inline <script> is what React 19
          warns about ("scripts inside React components are never executed on the
          client"), which beforeInteractive would produce. The config script sits
          first, so its effect runs and sets the global before widget.js, which
          still has to download, executes.
        */}
        <Script
          id="vivid-config"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.__VIVID_CONFIG = ${JSON.stringify(vividConfig)};`,
          }}
        />
        <Script
          src="https://platformvivid.worldstreetgold.com/widget.js"
          strategy="afterInteractive"
        />
        {/* Makes the widget's floating orb draggable. Sits next to the script it
            acts on; it renders nothing and does nothing until that widget has
            mounted. */}
        <VividWidgetDock />
      </body>
    </html>
  );
}
