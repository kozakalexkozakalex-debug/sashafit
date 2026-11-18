import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ThemeInit from "@/components/ThemeInit";

// Один нейтральний гротеск на весь застосунок — як у референсі.
const body = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "RUNA Fitness",
  description: "Платформа для онлайн-тренера та клієнтів",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RUNA Fitness",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#15171B",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" className={body.variable} suppressHydrationWarning>
      <head>
        {/* Ставимо тему до першого малювання, щоб екран не блимав іншими кольорами. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('sf_theme3');if(t!=='lime'&&t!=='violet'&&t!=='mono'&&t!=='orange')t='lime';var m=localStorage.getItem('sf_mode3');if(m!=='dark'&&m!=='light'&&m!=='auto')m='dark';if(m==='auto'){var w=window.Telegram&&window.Telegram.WebApp;m=w&&w.colorScheme?w.colorScheme:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark')}var d=document.documentElement;d.setAttribute('data-theme',t);d.setAttribute('data-mode',m)}catch(e){}})()",
          }}
        />
      </head>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        {/* Офіційний скрипт Telegram Mini App: дає застосунку знати, хто його відкрив. */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <ThemeInit />
        {children}
      </body>
    </html>
  );
}
