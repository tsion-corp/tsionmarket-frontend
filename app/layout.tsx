import type { Metadata } from "next";
import { Geist, Inter, Noto_Sans, Roboto } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import Providers from "./providers";
import "./globals.css";

// Body and normal text. Geist is a variable font, so every weight (we default
// to medium in globals.css) ships in one file, no per-weight requests.
const geist = Geist({
  variable: "--font-body",
  subsets: ["latin"],
});

const sportsbookInter = Inter({
  variable: "--font-sportsbook",
  subsets: ["latin"],
});

// Headers. Mona Sans, used at bold by the ws-display utility.
const monaSans = localFont({
  src: "./fonts/mona-sans-latin.woff2",
  weight: "500 700",
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
  // Proves ownership of the domain to Google Search Console. Next renders this
  // as <meta name="google-site-verification">, so it goes through the metadata
  // API rather than a hand-written tag in the markup. The token is public by
  // design: it only identifies the property, and Google reads it from the page.
  verification: { google: "qvpvsWHk9DpJjouUjo4pNbVgCiaCwF_JeAHH7sCADFM" },
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

  return (
    <html
      lang={locale}
      className={`${geist.variable} ${sportsbookInter.variable} ${monaSans.variable} ${chessSans.variable} ${chessClock.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
