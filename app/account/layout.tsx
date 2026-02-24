'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import AccountTabs from '@/components/account/AccountTabs';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-zinc-50">
        <div className="text-lg text-zinc-600">Cargando...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="bg-zinc-50">
      {/* Page header */}
      <div className="bg-white border-b border-zinc-200">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <h1 className="text-2xl font-bold text-zinc-900">Cuenta</h1>
        </div>
      </div>

      {/* Tab navigation */}
      <AccountTabs />

      {/* Page content */}
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
