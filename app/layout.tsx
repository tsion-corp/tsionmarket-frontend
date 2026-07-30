import type { Metadata } from "next";
import { Geist, Space_Grotesk } from "next/font/google";
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

// Headers. Space Grotesk, also a variable font, used at medium weight by the
// ws-display utility.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TSION",
  description:
    "The onchain superapp for global markets. Own stocks, gold, crypto and real-world assets from one self-custody account, funded in Naira.",
  icons: { icon: "/tsion-logo.svg" },
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
    <html lang={locale} className={`${geist.variable} ${spaceGrotesk.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
