import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../../globals.css";
import LangSetter from "@/components/LangSetter";
import { getTenantBySlug } from "@/lib/tenant";
import { getSystemSettings } from "@/lib/system-settings";
import ProtectedLayout from "./layout-protected";
import { headers } from "next/headers"; // eslint-disable-line @typescript-eslint/no-unused-vars

const geistSans = Geist({ // eslint-disable-line @typescript-eslint/no-unused-vars
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({ // eslint-disable-line @typescript-eslint/no-unused-vars
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "1pos - Point of Sale",
  description: '1pos: Enterprise-grade POS with 23 capability modules and seven core automations for modern businesses',
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
  
  // Platform-wide maintenance mode blocks all tenant-facing traffic
  const systemSettings = await getSystemSettings();
  if (systemSettings.maintenanceMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Under Maintenance</h1>
          <p className="text-sm text-gray-500">
            {systemSettings.maintenanceMessage || "We're performing scheduled maintenance. Please check back shortly."}
          </p>
        </div>
      </div>
    );
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

