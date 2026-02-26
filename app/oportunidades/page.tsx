'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import {
  opportunitiesApi,
  Opportunity,
  OpportunityStage,
  OpportunityProduct,
} from '@/lib/api/opportunitiesApi';
import { ApiError } from '@/lib/api-client';
import OpportunityCard from '@/components/opportunities/OpportunityCard';

const PAGE_SIZE = 18;

type StageFilter = '' | OpportunityStage;
type ProductFilter = '' | OpportunityProduct;

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="h-9 w-9 flex-shrink-0 rounded-full bg-zinc-200" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-3/4 rounded bg-zinc-200" />
          <div className="h-3 w-1/2 rounded bg-zinc-200" />
        </div>
        <div className="h-5 w-20 rounded-full bg-zinc-200" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-3 w-2/3 rounded bg-zinc-200" />
        <div className="h-3 w-1/3 rounded bg-zinc-200" />
      </div>
    </div>
  );
}

const stageChips: { value: StageFilter; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'CALIFICAR', label: 'Calificar' },
  { value: 'DATOS_MINIMOS', label: 'Datos mínimos' },
  { value: 'COTIZANDO', label: 'Cotizando' },
  { value: 'PROPUESTA_ENVIADA', label: 'Propuesta enviada' },
  { value: 'NEGOCIACION', label: 'Negociación' },
  { value: 'GANADA', label: 'Ganada' },
  { value: 'PERDIDA', label: 'Perdida' },
];

const productOptions: { value: ProductFilter; label: string }[] = [
  { value: '', label: 'Todos los productos' },
  { value: 'AUTO', label: 'Auto' },
  { value: 'VIDA', label: 'Vida' },
  { value: 'GMM', label: 'GMM' },
  { value: 'HOGAR', label: 'Hogar' },
  { value: 'PYME', label: 'PyME' },
  { value: 'OTRO', label: 'Otro' },
];

export default function OportunidadesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('');
  const [productFilter, setProductFilter] = useState<ProductFilter>('');

  // Cursor-based pagination
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [tokenHistory, setTokenHistory] = useState<string[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      resetPagination();
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search]);

  const resetPagination = useCallback(() => {
    setNextToken(undefined);
    setTokenHistory([]);
    setCurrentPageIndex(0);
  }, []);

  const fetchOpportunities = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    const token = currentPageIndex === 0 ? undefined : tokenHistory[currentPageIndex - 1];

    opportunitiesApi
      .list({
        search: debouncedSearch || undefined,
        stage: stageFilter || undefined,
        product: productFilter || undefined,
        limit: PAGE_SIZE,
        nextToken: token,
      })
      .then((data) => {
        if (!cancelled) {
          setOpportunities(data.opportunities);
          setNextToken(data.nextToken);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setLoadError(err.message);
          } else {
            setLoadError('Error al cargar las oportunidades');
          }
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [debouncedSearch, stageFilter, productFilter, currentPageIndex, tokenHistory]);

  useEffect(() => {
    const cancel = fetchOpportunities();
    return cancel;
  }, [fetchOpportunities]);

  useEffect(() => {
    resetPagination();
  }, [stageFilter, productFilter, resetPagination]);

  const hasPreviousPage = currentPageIndex > 0;
  const hasNextPage = !!nextToken;
  const hasActiveProductFilter = productFilter !== '';

  return (
    <div>
      {/* Search + product filter row */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, producto..."
            className="w-full rounded-lg border border-zinc-300 bg-white py-2.5 pl-9 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <select
          value={productFilter}
          onChange={(e) => {
            setProductFilter(e.target.value as ProductFilter);
            resetPagination();
          }}
          className="rounded-lg border border-zinc-300 bg-white py-2.5 pl-3 pr-8 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {productOptions.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Stage filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide mb-6">
        {stageChips.map((s) => (
          <button
            key={s.value}
            onClick={() => { setStageFilter(s.value); resetPagination(); }}
            className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              stageFilter === s.value
                ? 'bg-zinc-900 text-white'
                : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
            }`}
            style={{ minHeight: '32px' }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Error state */}
      {loadError && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{loadError}</div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !loadError && opportunities.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 py-16 text-center">
          {debouncedSearch || stageFilter || hasActiveProductFilter ? (
            <>
              <p className="mb-2 text-sm font-medium text-zinc-700">
                No se encontraron oportunidades
              </p>
              <p className="mb-4 text-xs text-zinc-500">
                Intenta con otros filtros o terminos de busqueda
              </p>
              <button
                onClick={() => {
                  setSearch('');
                  setStageFilter('');
                  setProductFilter('');
                  resetPagination();
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                Limpiar busqueda
              </button>
            </>
          ) : (
            <>
              <p className="mb-2 text-sm font-medium text-zinc-700">
                No hay oportunidades aun
              </p>
              <p className="mb-6 text-xs text-zinc-500">
                Registra tu primera oportunidad para comenzar a gestionar tu pipeline
              </p>
              <Link
                href="/oportunidades/nueva"
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                <PlusIcon className="h-4 w-4" />
                Nueva oportunidad
              </Link>
            </>
          )}
        </div>
      )}

      {/* Card grid */}
      {!isLoading && !loadError && opportunities.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {opportunities.map((opp) => (
              <OpportunityCard key={opp.opportunityId} opportunity={opp} />
            ))}
          </div>

          {/* Pagination */}
          {(hasPreviousPage || hasNextPage) && (
            <div className="mt-8 flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                Pagina {currentPageIndex + 1} · {opportunities.length} oportunidades en esta pagina
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPageIndex((i) => Math.max(0, i - 1))}
                  disabled={!hasPreviousPage}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  onClick={() => {
                    if (nextToken) {
                      setTokenHistory((prev) => {
                        const updated = [...prev];
                        updated[currentPageIndex] = nextToken;
                        return updated;
                      });
                      setCurrentPageIndex((i) => i + 1);
                    }
                  }}
                  disabled={!hasNextPage}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
