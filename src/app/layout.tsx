import type { Metadata, Viewport } from "next";
import { Fraunces, Source_Serif_4 } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const mono = Source_Serif_4({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gerador Reels",
  description: "Dúvidas do WhatsApp viram roteiros de Reels",
  appleWebApp: {
    capable: true,
    title: "Gerador Reels",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f0e8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${mono.variable} h-full`}>
      <body className="min-h-full antialiased">
        <Nav />
        <main className="mx-auto w-full max-w-5xl px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-16">
          {children}
        </main>
      </body>
    </html>
  );
}
