import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/app-context";
import { ToastProvider } from "@/components/toast";
import { PwaServiceWorkerRegistrar } from "@/components/pwa-service-worker-registrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "KRC ERP - ระบบจัดการทรัพยากร",
  description: "ระบบ ERP ส่วนกลางของบริษัท เค.อาร์.ซี. ออโต้พาร์ท จำกัด",
  applicationName: "KRC ERP",
  icons: {
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180" }],
    icon: [
      { url: "/pwa/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KRC ERP",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#be0f1a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="light">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-on-surface">
        <AppProvider>
          <ToastProvider>
            <PwaServiceWorkerRegistrar />
            {children}
          </ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}
