'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { PlusIcon } from '@heroicons/react/24/outline';

export default function PoliciesLayout({ children }: { children: React.ReactNode }) {
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
        <div className="mx-auto max-w-4xl px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Pólizas</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Gestiona y supervisa tu cartera</p>
          </div>
          <Link
            href="/policies/nueva"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-4 w-4" />
            Nueva póliza
          </Link>
        </div>
      </div>

      {/* Page content */}
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
