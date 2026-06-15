import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Service Builder",
  description: "Worship service prep for streaming.",
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
