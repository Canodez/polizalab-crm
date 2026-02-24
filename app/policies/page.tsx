'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PlusIcon } from '@heroicons/react/24/outline';
import { policiesApi, Policy, ApiError } from '@/lib/api/policiesApi';
import PolicyCard from '@/components/policies/PolicyCard';

type Tab = 'todas' | 'renovaciones';

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="h-9 w-9 flex-shrink-0 rounded-full bg-zinc-200" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-3/4 rounded bg-zinc-200" />
          <div className="h-3 w-1/2 rounded bg-zinc-200" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-4 w-2/3 rounded bg-zinc-200" />
        <div className="h-3 w-1/2 rounded bg-zinc-200" />
        <div className="h-3 w-1/3 rounded bg-zinc-200" />
      </div>
    </div>
  );
}

export default function PoliciesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('todas');
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [renewals, setRenewals] = useState<Policy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const renewalsLoaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    policiesApi.listPolicies()
      .then((data) => {
        if (!cancelled) {
          setPolicies(data.policies);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setLoadError(err.message);
          } else {
            setLoadError('Error al cargar las pólizas');
          }
          setIsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const handleTabChange = async (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'renovaciones' && !renewalsLoaded.current) {
      renewalsLoaded.current = true;
      try {
        const data = await policiesApi.getRenewals();
        setRenewals(data.policies);
      } catch {
        // Keep empty — list page shows whatever is available
      }
    }
  };

  const handleCardClick = (policyId: string) => {
    router.push(`/policies/${policyId}`);
  };

  const displayedPolicies = activeTab === 'todas' ? policies : renewals;

  return (
    <div>
      {/* Header row */}
      <div className="mb-4 flex items-center justify-between">
        <div />
        <Link
          href="/policies/nueva"
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          <PlusIcon className="h-4 w-4" />
          Nueva póliza
        </Link>
      </div>

      {/* Tab bar */}
      <div className="mb-6 border-b border-zinc-200">
        <nav className="flex gap-6">
          {(['todas', 'renovaciones'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`pb-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              {tab === 'todas' ? 'Todas' : 'Próximas a vencer'}
            </button>
          ))}
        </nav>
      </div>

      {/* Error state */}
      {loadError && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{loadError}</div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !loadError && displayedPolicies.length === 0 && (
        activeTab === 'todas' ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 py-16 text-center">
            <p className="mb-2 text-sm font-medium text-zinc-700">No tienes pólizas aún</p>
            <p className="mb-6 text-xs text-zinc-500">Sube tu primera póliza en PDF para comenzar</p>
            <Link
              href="/policies/nueva"
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              <PlusIcon className="h-4 w-4" />
              Subir póliza
            </Link>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-zinc-500">No hay pólizas próximas a vencer</p>
          </div>
        )
      )}

      {/* Card grid */}
      {!isLoading && !loadError && displayedPolicies.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedPolicies.map((policy) => (
            <PolicyCard key={policy.policyId} policy={policy} onClick={handleCardClick} />
          ))}
        </div>
      )}
    </div>
  );
}
