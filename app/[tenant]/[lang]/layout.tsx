import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../../globals.css";
import LangSetter from "@/components/LangSetter";
import { getTenantBySlug } from "@/lib/tenant";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "POS System - Point of Sale",
  description: "Complete POS system with product management and sales tracking",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export async function generateStaticParams() {
  return [
    { tenant: 'default', lang: 'en' },
    { tenant: 'default', lang: 'es' },
  ];
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ tenant: string; lang: 'en' | 'es' }>;
}>) {
  const { tenant: tenantSlug, lang } = await params;
  
  // Get tenant info for settings
  const tenant = await getTenantBySlug(tenantSlug);
  const tenantLang = tenant?.settings.language || lang;
  
  // Ensure lang is always valid
  const validLang = (tenantLang === 'en' || tenantLang === 'es') ? tenantLang : 'en';
  
  // Use a client component to set the lang attribute to avoid hydration mismatch
  return (
    <>
      <LangSetter lang={validLang} />
      {children}
    </>
  );
}

