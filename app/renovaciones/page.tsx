'use client';

import { useState, useEffect, useCallback } from 'react';
import { policiesApi, Policy } from '@/lib/api/policiesApi';
import { ApiError } from '@/lib/api-client';
import RenewalCard from '@/components/renovaciones/RenewalCard';

type WindowFilter = 'overdue' | '30' | '60' | '90';

interface Tab {
  value: WindowFilter;
  label: string;
}

const TABS: Tab[] = [
  { value: 'overdue', label: 'Vencidas' },
  { value: '30', label: '30 dias' },
  { value: '60', label: '60 dias' },
  { value: '90', label: '90 dias' },
];

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/3 rounded bg-zinc-200" />
          <div className="h-3 w-1/2 rounded bg-zinc-200" />
          <div className="h-3 w-2/3 rounded bg-zinc-200" />
        </div>
        <div className="h-6 w-16 rounded-full bg-zinc-200" />
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-8 w-28 rounded-lg bg-zinc-200" />
        <div className="h-8 w-28 rounded-lg bg-zinc-200" />
        <div className="h-8 w-28 rounded-lg bg-zinc-200" />
      </div>
    </div>
  );
}

export default function RenovacionesPage() {
  const [activeWindow, setActiveWindow] = useState<WindowFilter>('overdue');
  const [allPolicies, setAllPolicies] = useState<Policy[]>([]);
  const [counts, setCounts] = useState<Record<WindowFilter, number>>({
    overdue: 0,
    '30': 0,
    '60': 0,
    '90': 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Fetch all renewals once (no window filter) to compute tab counts,
  // then re-fetch when tab changes for accurate filtered display.
  const fetchRenewals = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    policiesApi
      .getRenewals(activeWindow)
      .then((data) => {
        if (!cancelled) {
          setAllPolicies(data.policies);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setLoadError(err.message);
          } else {
            setLoadError('Error al cargar las renovaciones');
          }
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [activeWindow]);

  // Compute tab counts from the current set; backend returns cumulative sets,
  // so we always fetch per-window. Pre-compute counts by fetching all windows.
  const fetchAllCounts = useCallback(() => {
    const windows: WindowFilter[] = ['overdue', '30', '60', '90'];
    Promise.all(windows.map((w) => policiesApi.getRenewals(w))).then((results) => {
      const newCounts = {} as Record<WindowFilter, number>;
      windows.forEach((w, i) => {
        newCounts[w] = results[i].count;
      });
      setCounts(newCounts);
    }).catch(() => {
      // Counts are non-critical; silently ignore errors
    });
  }, []);

  useEffect(() => {
    const cancel = fetchRenewals();
    return cancel;
  }, [fetchRenewals]);

  // Fetch counts on mount and after any update
  useEffect(() => {
    fetchAllCounts();
  }, [fetchAllCounts]);

  const handleUpdate = useCallback(() => {
    fetchRenewals();
    fetchAllCounts();
  }, [fetchRenewals, fetchAllCounts]);

  const displayedPolicies = allPolicies;

  return (
    <div>
      {/* Tab filter row */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        {TABS.map((tab) => {
          const isActive = activeWindow === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveWindow(tab.value)}
              className={`inline-flex items-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {tab.label}
              {counts[tab.value] > 0 && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {counts[tab.value]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Error state */}
      {loadError && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{loadError}</div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !loadError && displayedPolicies.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
            <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-700">
            {activeWindow === 'overdue'
              ? 'Sin polizas vencidas'
              : `Sin polizas que venzan en ${activeWindow} dias`}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Todas las renovaciones en este rango estan al dia</p>
        </div>
      )}

      {/* Policy list */}
      {!isLoading && !loadError && displayedPolicies.length > 0 && (
        <div className="space-y-4">
          {displayedPolicies.map((policy) => (
            <RenewalCard
              key={policy.policyId}
              policy={policy}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
