import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Andaaz: family recipes in their own voice",
  description:
    "A living family cookbook. Andaaz learns recipes from a grandparent speaking naturally, then teaches them step by step in their own voice. Built on Sarvam AI.",
};

export const viewport: Viewport = {
  themeColor: "#b8430f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            Andaaz<span>अंदाज़</span>
          </Link>
          <nav>
            <Link href="/">Cookbook</Link>
            <Link href="/capture">Record</Link>
            <Link href="/cookbook">Print</Link>
            <Link href="/settings">Settings</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
        <footer className="site-footer">
          Built on Sarvam AI: Saaras v3 · Sarvam-105B · Sarvam Translate · Bulbul v3 · Sarvam Vision
        </footer>
      </body>
    </html>
  );
}
