'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Bell, X } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const params = useParams();
  const tenant = (params?.tenant as string) || '';
  const lang = (params?.lang as string) || 'en';
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, fetchNotifications, markAsRead, dismiss } = useNotifications();

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-2 hover:bg-gray-100 text-gray-500 relative"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-semibold leading-none rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 bg-white border border-gray-300 shadow-lg z-50 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {unreadCount > 0 && <span className="text-xs text-gray-500">{unreadCount} unread</span>}
          </div>
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">No notifications</div>
            )}
            {notifications.map((n) => {
              const body = (
                <div
                  className={`px-4 py-3 border-b border-gray-100 hover:bg-gray-50 flex items-start gap-2 ${
                    !n.isRead ? 'bg-brand-soft/40' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0" onClick={() => !n.isRead && markAsRead(n._id)}>
                    <div className="text-sm font-medium text-gray-900 truncate">{n.title}</div>
                    <div className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.message}</div>
                    <div className="text-[11px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dismiss(n._id);
                    }}
                    className="p-1 text-gray-400 hover:text-gray-700 flex-shrink-0"
                    aria-label="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );

              return n.link ? (
                <Link
                  key={n._id}
                  href={n.link.startsWith('/') && tenant ? `/${tenant}/${lang}${n.link}` : n.link}
                  onClick={() => {
                    if (!n.isRead) markAsRead(n._id);
                    setOpen(false);
                  }}
                >
                  {body}
                </Link>
              ) : (
                <div key={n._id}>{body}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
