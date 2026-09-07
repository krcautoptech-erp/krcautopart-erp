import localFont from "next/font/local";
import type { Metadata } from "next";
import { AppProvider } from "@/components/app-context";
import { ToastProvider } from "@/components/toast";
import { PwaServiceWorkerRegistrar } from "@/components/pwa-service-worker-registrar";
import "./globals.css";

const inter = localFont({
  src: [
    {
      path: "../../public/fonts/static/Inter_18pt-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/static/Inter_18pt-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/static/Inter_18pt-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/static/Inter_18pt-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
  fallback: ["sans-serif"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "KRC ERP - ระบบจัดการทรัพยากร",
  description: "ระบบ ERP ส่วนกลางของบริษัท เค.อาร์.ซี. ออโต้พาร์ท จำกัด",
  applicationName: "KRC ERP",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KRC ERP",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`light ${inter.variable}`}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&amp;display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-on-surface antialiased">
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
