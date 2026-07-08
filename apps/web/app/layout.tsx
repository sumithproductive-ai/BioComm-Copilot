import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BioComm Copilot",
  description: "UC-focused commercialization intelligence for biotech BD teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
