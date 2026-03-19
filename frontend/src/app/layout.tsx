import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Easy Share - Instant 1-to-1 Text Sharing",
  description: "Share text instantly between devices with Easy Share. Minimal, secure, and fast.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-blue-100 selection:text-blue-900">{children}</body>
    </html>
  );
}
