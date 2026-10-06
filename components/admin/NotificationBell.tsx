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
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center bg-win8-danger text-white text-[10px] font-semibold leading-none tabular-nums">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 bg-white border border-gray-300 z-50 flex flex-col">
          <div className="px-4 py-3 bg-brand-navy text-white flex items-center justify-between">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && <span className="text-xs text-white/70 tabular-nums">{unreadCount} unread</span>}
          </div>
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No notifications</div>
            )}
            {notifications.map((n) => {
              const body = (
                <div
                  className={`px-4 py-3 border-b border-gray-200 hover:bg-gray-100 flex items-start gap-2 ${
                    !n.isRead ? 'bg-brand-soft' : ''
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
                    className="inline-flex items-center justify-center p-2.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 flex-shrink-0"
                    aria-label="Dismiss"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
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
