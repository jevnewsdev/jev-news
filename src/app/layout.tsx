import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jev · Tokenized Markets",
  description:
    "Jev reads the wire for Robinhood tokenized stocks, judges every headline, then issues buy/risk signals.",
  icons: { icon: "/jevnews-logo.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${grotesk.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="min-h-full starfield">{children}</body>
    </html>
  );
}
