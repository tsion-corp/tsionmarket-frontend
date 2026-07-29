import type { Metadata } from "next";
import { Geist, Space_Grotesk } from "next/font/google";
import Providers from "./providers";
import "./globals.css";

// Body and normal text. Geist is a variable font, so every weight (we default
// to medium in globals.css) ships in one file, no per-weight requests.
const geist = Geist({
  variable: "--font-body",
  subsets: ["latin"],
});

// Headers. Space Grotesk, also a variable font, used at medium weight by the
// ws-serif utility.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "World Street",
  description:
    "The onchain superapp for global markets. Own stocks, gold, crypto and real-world assets from one self-custody account, funded in Naira.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${spaceGrotesk.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
