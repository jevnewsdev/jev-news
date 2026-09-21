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

const title = "Jev for Tokenized Markets";
const description =
  "Autonomous buy / risk signals on Robinhood tokenized stocks. Jev reads the wire every 15 minutes, judges every headline, then issues signals with a time horizon.";

export const metadata: Metadata = {
  metadataBase: new URL("https://jevnews.dev"),
  title,
  description,
  keywords: ["tokenized stocks", "Robinhood", "trading signals", "news agent", "Jev", "TypeSafe System One"],
  openGraph: {
    title,
    description,
    url: "https://jevnews.dev",
    siteName: "jevnews",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Jev for Tokenized Markets dashboard" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@JevNewsMarket",
    title,
    description,
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${grotesk.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="min-h-full starfield">{children}</body>
    </html>
  );
}
