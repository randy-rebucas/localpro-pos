import { type ElementType } from 'react';

interface AdminPageHeaderProps {
  icon?: ElementType;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  iconColor?: string;
}

export default function AdminPageHeader({ icon: Icon, title, description, actions, iconColor = 'text-brand' }: AdminPageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && <Icon className={`w-7 h-7 flex-shrink-0 ${iconColor}`} />}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{title}</h1>
          {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}
