'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MagnifyingGlassIcon, PlusIcon, FunnelIcon } from '@heroicons/react/24/outline';
import { clientsApi, Client, ApiError } from '@/lib/api/clientsApi';
import ClientCard from '@/components/clients/ClientCard';

const PAGE_SIZE = 18;

type SortOption = 'name_asc' | 'recent' | 'most_policies';
type StatusFilter = '' | 'active' | 'archived';
type CreatedFromFilter = '' | 'manual' | 'policy_extraction';

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="h-9 w-9 flex-shrink-0 rounded-full bg-zinc-200" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-3/4 rounded bg-zinc-200" />
          <div className="h-3 w-1/2 rounded bg-zinc-200" />
        </div>
        <div className="h-5 w-14 rounded-full bg-zinc-200" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-3 w-2/3 rounded bg-zinc-200" />
        <div className="h-3 w-1/2 rounded bg-zinc-200" />
      </div>
      <div className="mt-3 flex justify-between">
        <div className="h-3 w-20 rounded bg-zinc-200" />
        <div className="h-3 w-16 rounded bg-zinc-200" />
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [createdFromFilter, setCreatedFromFilter] = useState<CreatedFromFilter>('');
  const [sort, setSort] = useState<SortOption>('name_asc');
  const [showFilters, setShowFilters] = useState(false);
  // Cursor-based pagination tokens
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [tokenHistory, setTokenHistory] = useState<string[]>([]); // stack of previous page tokens
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

  // Reset pagination when filters change
  const resetPagination = useCallback(() => {
    setNextToken(undefined);
    setTokenHistory([]);
    setCurrentPageIndex(0);
  }, []);

  const fetchClients = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    // For first page, no token; for subsequent pages, use the current token from history
    const token = currentPageIndex === 0 ? undefined : tokenHistory[currentPageIndex - 1];

    clientsApi
      .listClients({
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        createdFrom: createdFromFilter || undefined,
        sort,
        limit: PAGE_SIZE,
        nextToken: token,
      })
      .then((data) => {
        if (!cancelled) {
          setClients(data.clients);
          setTotalCount(data.count);
          setNextToken(data.nextToken);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setLoadError(err.message);
          } else {
            setLoadError('Error al cargar los clientes');
          }
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [debouncedSearch, statusFilter, createdFromFilter, sort, currentPageIndex, tokenHistory]);

  useEffect(() => {
    const cancel = fetchClients();
    return cancel;
  }, [fetchClients]);

  // Reset pagination when filters change
  useEffect(() => {
    resetPagination();
  }, [statusFilter, createdFromFilter, sort, resetPagination]);

  const handleCardClick = (clientId: string) => {
    router.push(`/clients/${clientId}`);
  };

  const hasPreviousPage = currentPageIndex > 0;
  const hasNextPage = !!nextToken;
  const hasActiveFilters = statusFilter !== '' || createdFromFilter !== '';

  return (
    <div>
      {/* Search + filter row */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email, RFC, teléfono..."
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
              {[statusFilter, createdFromFilter].filter(Boolean).length}
            </span>
          )}
        </button>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="rounded-lg border border-zinc-300 bg-white py-2.5 pl-3 pr-8 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="name_asc">Nombre A-Z</option>
          <option value="recent">Más recientes</option>
          <option value="most_policies">Más pólizas</option>
        </select>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-4 flex flex-wrap gap-4 rounded-lg border border-zinc-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Estado</label>
            <div className="flex gap-2">
              {([['', 'Todos'], ['active', 'Activos'], ['archived', 'Archivados']] as [StatusFilter, string][]).map(
                ([val, label]) => (
                  <button
                    key={val}
                    onClick={() => { setStatusFilter(val); resetPagination(); }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      statusFilter === val
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    {label}
                  </button>
                )
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Origen</label>
            <div className="flex gap-2">
              {(
                [
                  ['', 'Todos'],
                  ['manual', 'Manual'],
                  ['policy_extraction', 'Póliza'],
                ] as [CreatedFromFilter, string][]
              ).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => { setCreatedFromFilter(val); resetPagination(); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    createdFromFilter === val
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex items-end">
              <button
                onClick={() => {
                  setStatusFilter('');
                  setCreatedFromFilter('');
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
      {!isLoading && !loadError && clients.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 py-16 text-center">
          {debouncedSearch || hasActiveFilters ? (
            <>
              <p className="mb-2 text-sm font-medium text-zinc-700">No se encontraron clientes</p>
              <p className="mb-4 text-xs text-zinc-500">
                Intenta con otros filtros o términos de búsqueda
              </p>
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                  setCreatedFromFilter('');
                  resetPagination();
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                Limpiar búsqueda
              </button>
            </>
          ) : (
            <>
              <p className="mb-2 text-sm font-medium text-zinc-700">No tienes clientes aún</p>
              <p className="mb-6 text-xs text-zinc-500">
                Agrega tu primer cliente manualmente o vincula uno desde una póliza
              </p>
              <Link
                href="/clients/nuevo"
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                <PlusIcon className="h-4 w-4" />
                Nuevo cliente
              </Link>
            </>
          )}
        </div>
      )}

      {/* Card grid */}
      {!isLoading && !loadError && clients.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((client) => (
              <ClientCard key={client.clientId} client={client} onClick={handleCardClick} />
            ))}
          </div>

          {/* Pagination */}
          {(hasPreviousPage || hasNextPage) && (
            <div className="mt-8 flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                Página {currentPageIndex + 1} · {clients.length} clientes en esta página
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
