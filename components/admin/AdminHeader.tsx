'use client';

import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';

interface AdminHeaderProps {
  onMenuToggle?: () => void;
}

export default function AdminHeader({ onMenuToggle }: AdminHeaderProps) {
  const params = useParams();
  const pathname = usePathname();
  const tenant = params.tenant as string;
  const lang = params.lang as string;

  // Generate breadcrumbs from pathname
  const generateBreadcrumbs = () => {
    const segments = pathname.split('/').filter((s) => s && s !== tenant && s !== lang);
    const breadcrumbs = [];

    breadcrumbs.push({ label: 'Admin', href: `/${tenant}/${lang}/admin` });

    segments.forEach((segment, index) => {
      const href = `/${tenant}/${lang}/${segments.slice(0, index + 1).join('/')}`;
      const label = segment
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      breadcrumbs.push({ label, href });
    });

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  return (
    <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm min-w-0">
        {breadcrumbs.map((crumb, index) => (
          <div key={index} className="flex items-center gap-2 min-w-0">
            {index > 0 && <span className="text-gray-400">/</span>}
            <Link
              href={crumb.href}
              className={`truncate transition-colors ${
                index === breadcrumbs.length - 1
                  ? 'text-gray-900 font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {crumb.label}
            </Link>
          </div>
        ))}
      </nav>
    </div>
  );
}
