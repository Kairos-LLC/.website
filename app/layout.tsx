import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Kairos",
  description: "Know when they're free.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="gradient-mesh" aria-hidden="true">
          <span />
        </div>
        {children}
      </body>
    </html>
  );
}
