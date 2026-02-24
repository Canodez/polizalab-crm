'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { profileApi } from '@/lib/api-client';
import { useSidebarState } from '@/lib/hooks/useSidebarState';
import Sidebar from './Sidebar';
import Avatar from './Avatar';
import { Toaster } from 'react-hot-toast';
import { Bars3Icon } from '@heroicons/react/24/outline';

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const { isCollapsed, toggleCollapsed, isMobileOpen, openMobile, closeMobile } = useSidebarState();
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  const userEmail = user?.email;
  useEffect(() => {
    if (!userEmail) return;
    profileApi.getProfile()
      .then((p) => setProfileImageUrl(p.profileImageUrl || null))
      .catch(() => {});
  }, [userEmail]);

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            duration: 5000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />

      {isAuthenticated && (
        <>
          <Sidebar
            isCollapsed={isCollapsed}
            toggleCollapsed={toggleCollapsed}
            isMobileOpen={isMobileOpen}
            closeMobile={closeMobile}
          />

          {/* Mobile top bar */}
          <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 lg:hidden">
            <div className="flex items-center gap-x-4">
              <button
                type="button"
                onClick={openMobile}
                className="-m-2.5 p-2.5 text-zinc-600 hover:text-zinc-900"
                aria-label="Abrir menú"
                aria-expanded={isMobileOpen}
              >
                <Bars3Icon className="h-6 w-6" />
              </button>
              <span className="text-lg font-semibold text-zinc-900 tracking-tight">PolizaLab</span>
            </div>
            <Link href="/account/profile" aria-label="Mi cuenta">
              <Avatar email={userEmail || ''} imageUrl={profileImageUrl} size="sm" />
            </Link>
          </div>
        </>
      )}

      <main className={isAuthenticated ? `min-h-screen ${isCollapsed ? 'lg:ml-16' : 'lg:ml-64'} transition-[margin] duration-200` : ''}>
        {children}
      </main>
    </>
  );
}
