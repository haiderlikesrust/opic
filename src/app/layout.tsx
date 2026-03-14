import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import WalletProvider from "@/components/WalletProvider";
import SessionProvider from "@/components/SessionProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Opic — Tokenized Agent Platform",
  description:
    "Create tokenized agents code-free. First agent is free (1 per user), then additional agents are $10 with GLM-5 and Twitter/Telegram infrastructure.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen font-sans`}
      >
        <SessionProvider>
          <WalletProvider>{children}</WalletProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
