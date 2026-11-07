import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../../globals.css";
import LangSetter from "@/components/LangSetter";
import { getTenantBySlug } from "@/lib/tenant";
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

  // Seed the client TenantSettingsProvider with the settings we already have
  // (same cached lookup GET /api/tenants/[slug]/settings serves), so it doesn't
  // refetch them on mount. JSON round-trip strips ObjectIds/Dates so the value
  // can cross the server/client boundary — matching what the API would return.
  const initialSettings = tenant?.settings
    ? JSON.parse(JSON.stringify(tenant.settings))
    : null;
  
  // Use a client component to set the lang attribute to avoid hydration mismatch
  return (
    <>
      <LangSetter lang={validLang} />
      <ProtectedLayout initialSettings={initialSettings}>
        {children}
      </ProtectedLayout>
    </>
  );
}

