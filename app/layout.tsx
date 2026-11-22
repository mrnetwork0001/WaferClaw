import type { Metadata } from "next";
import { Archivo, Barlow_Condensed, Martian_Mono } from "next/font/google";
import "./globals.css";

const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const sans = Archivo({ subsets: ["latin"], variable: "--font-sans" });
const mono = Martian_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "WaferClaw — OpenClaw on Kimi K3.1 Pro × Cerebras",
  description: "Live OpenClaw agent runs on Kimi K3.1 Pro (Cerebras) with real server-side decode telemetry.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
