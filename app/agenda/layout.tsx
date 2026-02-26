'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function AgendaLayout({ children }: { children: React.ReactNode }) {
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

  if (!isAuthenticated) return null;

  return (
    <div className="bg-zinc-50 min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
