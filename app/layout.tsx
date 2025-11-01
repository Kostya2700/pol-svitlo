import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Графік відключень електроенергії - Полтавська область",
  description: "Актуальний графік відключень електроенергії для Полтавської області. Автоматичне оновлення кожні 10 хвилин.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Графік ПОЕ",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#3b82f6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <head>
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
<script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(
                  function(registration) {
                    console.log('ServiceWorker registration successful with scope:', registration.scope);

                    // Додаємо обробник оновлень
                    registration.addEventListener('updatefound', () => {
                      console.log('Service Worker update found!');
                    });
                  },
                  function(err) {
                    console.error('ServiceWorker registration failed:', err);
                  }
                );

                // Перевіряємо готовність Service Worker
                navigator.serviceWorker.ready.then(function(registration) {
                  console.log('Service Worker is ready:', registration);
                });
              });
            }
          `
        }} />
      </body>
    </html>
  );
}
