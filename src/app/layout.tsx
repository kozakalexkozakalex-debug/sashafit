import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SashaFit",
  description: "Платформа для онлайн-тренера та клієнтів",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body className="min-h-screen bg-paper text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
