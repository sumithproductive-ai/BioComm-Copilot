import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Logo } from "@/components/logo";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BioComm Copilot",
  description: "UC-focused commercialization intelligence system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/">
              <Logo />
            </Link>
            <div className="flex items-center gap-5">
              <Link
                href="/batch"
                className="text-sm font-medium text-muted-foreground hover:text-brand-navy"
              >
                Batch
              </Link>
              <Link
                href="/assessments"
                className="text-sm font-medium text-muted-foreground hover:text-brand-navy"
              >
                Assessments
              </Link>
            </div>
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
