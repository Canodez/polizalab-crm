'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MagnifyingGlassIcon, PlusIcon, FunnelIcon } from '@heroicons/react/24/outline';
import {
  leadsApi,
  Lead,
  LeadStatus,
  ProductInterest,
  LeadSource,
} from '@/lib/api/leadsApi';
import { ApiError } from '@/lib/api-client';
import LeadCard from '@/components/leads/LeadCard';
import { showError, showInfo } from '@/lib/toast';

const PAGE_SIZE = 18;

type SortOption = 'recent' | 'next_action' | 'name_asc';
type StatusFilter = '' | LeadStatus;
type ProductFilter = '' | ProductInterest;
type SourceFilter = '' | LeadSource;

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="h-9 w-9 flex-shrink-0 rounded-full bg-zinc-200" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-3/4 rounded bg-zinc-200" />
          <div className="h-3 w-1/2 rounded bg-zinc-200" />
        </div>
        <div className="flex flex-col gap-1 items-end">
          <div className="h-5 w-14 rounded-full bg-zinc-200" />
          <div className="h-4 w-10 rounded-full bg-zinc-200" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-3 w-2/3 rounded bg-zinc-200" />
        <div className="h-3 w-1/3 rounded bg-zinc-200" />
      </div>
    </div>
  );
}

const statusPills: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'NEW', label: 'Nuevo' },
  { value: 'CONTACTED', label: 'Contactado' },
  { value: 'QUOTING', label: 'Cotizando' },
  { value: 'WON', label: 'Ganado' },
  { value: 'LOST', label: 'Perdido' },
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

const sourceOptions: { value: SourceFilter; label: string }[] = [
  { value: '', label: 'Todas las fuentes' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'REFERIDO', label: 'Referido' },
  { value: 'WEB', label: 'Web' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'EVENTO', label: 'Evento' },
  { value: 'OTRO', label: 'Otro' },
];

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [productFilter, setProductFilter] = useState<ProductFilter>('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('');
  const [sort, setSort] = useState<SortOption>('recent');
  const [showFilters, setShowFilters] = useState(false);
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

  const fetchLeads = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    const token = currentPageIndex === 0 ? undefined : tokenHistory[currentPageIndex - 1];

    leadsApi
      .listLeads({
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        productInterest: productFilter || undefined,
        source: sourceFilter || undefined,
        sort,
        limit: PAGE_SIZE,
        nextToken: token,
      })
      .then((data) => {
        if (!cancelled) {
          setLeads(data.leads);
          setNextToken(data.nextToken);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setLoadError(err.message);
          } else {
            setLoadError('Error al cargar los leads');
          }
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [debouncedSearch, statusFilter, productFilter, sourceFilter, sort, currentPageIndex, tokenHistory]);

  useEffect(() => {
    const cancel = fetchLeads();
    return cancel;
  }, [fetchLeads]);

  useEffect(() => {
    resetPagination();
  }, [statusFilter, productFilter, sourceFilter, sort, resetPagination]);

  const handleCardClick = (leadId: string) => {
    router.push(`/leads/${leadId}`);
  };

  const handleConvert = async (leadId: string) => {
    router.push(`/leads/${leadId}`);
  };

  const hasPreviousPage = currentPageIndex > 0;
  const hasNextPage = !!nextToken;
  const hasActiveFilters = productFilter !== '' || sourceFilter !== '';

  return (
    <div>
      {/* Search + filter + sort row */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, telefono, email..."
            className="w-full rounded-lg border border-zinc-300 bg-white py-2.5 pl-9 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
            showFilters || hasActiveFilters
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          <FunnelIcon className="h-4 w-4" />
          Filtros
          {hasActiveFilters && (
            <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              {[productFilter, sourceFilter].filter(Boolean).length}
            </span>
          )}
        </button>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="rounded-lg border border-zinc-300 bg-white py-2.5 pl-3 pr-8 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="recent">Mas recientes</option>
          <option value="next_action">Proxima accion</option>
          <option value="name_asc">Nombre A-Z</option>
        </select>
      </div>

      {/* Status pill filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {statusPills.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => { setStatusFilter(value); resetPagination(); }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === value
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Additional filter panel */}
      {showFilters && (
        <div className="mb-4 flex flex-wrap gap-4 rounded-lg border border-zinc-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Producto</label>
            <select
              value={productFilter}
              onChange={(e) => { setProductFilter(e.target.value as ProductFilter); resetPagination(); }}
              className="rounded-lg border border-zinc-300 bg-white py-2 pl-3 pr-8 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {productOptions.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Fuente</label>
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value as SourceFilter); resetPagination(); }}
              className="rounded-lg border border-zinc-300 bg-white py-2 pl-3 pr-8 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {sourceOptions.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <div className="flex items-end">
              <button
                onClick={() => {
                  setProductFilter('');
                  setSourceFilter('');
                  resetPagination();
                }}
                className="text-xs text-red-600 hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {loadError && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{loadError}</div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !loadError && leads.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 py-16 text-center">
          {debouncedSearch || statusFilter || hasActiveFilters ? (
            <>
              <p className="mb-2 text-sm font-medium text-zinc-700">No se encontraron leads</p>
              <p className="mb-4 text-xs text-zinc-500">
                Intenta con otros filtros o terminos de busqueda
              </p>
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                  setProductFilter('');
                  setSourceFilter('');
                  resetPagination();
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                Limpiar busqueda
              </button>
            </>
          ) : (
            <>
              <p className="mb-2 text-sm font-medium text-zinc-700">No tienes leads aun</p>
              <p className="mb-6 text-xs text-zinc-500">
                Registra tu primer prospecto para comenzar a hacer seguimiento
              </p>
              <Link
                href="/leads/nuevo"
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                <PlusIcon className="h-4 w-4" />
                Nuevo lead
              </Link>
            </>
          )}
        </div>
      )}

      {/* Card grid */}
      {!isLoading && !loadError && leads.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {leads.map((lead) => (
              <LeadCard
                key={lead.leadId}
                lead={lead}
                onClick={handleCardClick}
                onConvert={handleConvert}
              />
            ))}
          </div>

          {/* Pagination */}
          {(hasPreviousPage || hasNextPage) && (
            <div className="mt-8 flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                Pagina {currentPageIndex + 1} · {leads.length} leads en esta pagina
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
