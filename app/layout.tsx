import type { Metadata } from "next";
import Script from "next/script";
import { Geist } from "next/font/google";
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

// Headers. Clash Display (Fontshare/ITF, self-hosted variable font, license
// alongside the file), used at bold by the ws-display utility.
const clashDisplay = localFont({
  src: "./fonts/ClashDisplay-Variable.woff2",
  weight: "200 700",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Ark",
  description:
    "The onchain superapp for global markets. Own stocks, gold, crypto and real-world assets from one self-custody account, funded in Naira.",
  icons: { icon: "/ark-logo.svg" },
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
    <html lang={locale} className={`${geist.variable} ${clashDisplay.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        {/*
          The Vivid widget reads its key from document.currentScript, which is
          null for scripts next/script injects dynamically. Configure it via the
          window global it also supports so the key survives that injection.
        */}
        <Script id="vivid-config" strategy="beforeInteractive">
          {`window.__VIVID_CONFIG = { key: "pk_live_xARDqkZFFwSnUPE4rN_cNU5d", api: "https://platformvivid.worldstreetgold.com" };`}
        </Script>
        <Script
          src="https://platformvivid.worldstreetgold.com/widget.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
