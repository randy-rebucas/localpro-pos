import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import ToastProvider from "@/components/ToastProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "1POS - Point of Sale",
  description: "Complete POS system with product management and sales tracking",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Don't set lang here - let the nested [lang] layout handle it
  // Using suppressHydrationWarning to prevent mismatch during client navigation
          return (
            <html suppressHydrationWarning>
              <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
                suppressHydrationWarning
              >
                <AuthProvider>
                  <ToastProvider />
                  {children}
                </AuthProvider>
              </body>
            </html>
          );
}
