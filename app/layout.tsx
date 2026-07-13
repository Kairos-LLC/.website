import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import Link from "next/link";

import "./globals.css";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Kairos — Know when they're free.",
  description:
    "Kairos is a private-by-design schedule-sharing app for shift workers, coming to iPhone. No accounts, no passwords — your schedule is protected by a recovery key only you hold.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={instrumentSerif.variable}>
      <body>
        <header className="site-header">
          <Link href="/" className="kicker wordmark">
            Kairos
          </Link>
          <span className="kicker">Coming soon to iPhone</span>
        </header>
        {children}
      </body>
    </html>
  );
}
