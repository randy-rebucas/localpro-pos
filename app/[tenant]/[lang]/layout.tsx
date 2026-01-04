import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../../globals.css";
import LangSetter from "@/components/LangSetter";
import { getTenantBySlug } from "@/lib/tenant";
import ProtectedLayout from "./layout-protected";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { headers as _headers } from "next/headers";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _geistMono = Geist_Mono({
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

export const dynamic = 'force-dynamic';
export const dynamicParams = true;

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ tenant: string; lang: string }>;
}>) {
  const { tenant: tenantSlug, lang } = await params;
  
  // If lang is "forbidden", it means Next.js incorrectly matched /tenant/forbidden to this route
  // We need to prevent this layout from rendering and let Next.js match the forbidden.tsx route
  // Use notFound() which will cause Next.js to try the next route match (forbidden.tsx)
  // This prevents infinite redirect loops
  if (lang === 'forbidden') {
    const { notFound } = await import('next/navigation');
    notFound();
  }
  
  // Validate lang is a valid locale - if not, redirect to English
  if (lang !== 'en' && lang !== 'es') {
    const { redirect } = await import('next/navigation');
    redirect(`/${tenantSlug}/en`);
  }
  
  // Get tenant info for settings
  const tenant = await getTenantBySlug(tenantSlug);
  const tenantLang = tenant?.settings.language || lang;
  
  // Ensure lang is always valid
  const validLang = (tenantLang === 'en' || tenantLang === 'es') ? tenantLang : 'en';
  
  // Use a client component to set the lang attribute to avoid hydration mismatch
  return (
    <>
      <LangSetter lang={validLang} />
      <ProtectedLayout>
        {children}
      </ProtectedLayout>
    </>
  );
}

