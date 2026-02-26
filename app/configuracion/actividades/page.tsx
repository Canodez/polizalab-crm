'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { activityTypesApi, ActivityType } from '@/lib/api/activityTypesApi';
import { ApiError } from '@/lib/api-client';
import { showSuccess, showError } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Toggle switch — reuses exact same pattern as preferences page
// ---------------------------------------------------------------------------
interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}

function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        style={{ minHeight: '28px' }}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-blue-600' : 'bg-zinc-200'
        }`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------
function SkeletonRow() {
  return (
    <div className="animate-pulse flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-1">
        <div className="h-4 w-4 rounded bg-zinc-200" />
        <div className="h-4 w-4 rounded bg-zinc-200" />
      </div>
      <div className="flex-1">
        <div className="h-3.5 w-40 rounded bg-zinc-200" />
      </div>
      <div className="flex gap-6">
        <div className="flex flex-col items-center gap-1">
          <div className="h-3 w-10 rounded bg-zinc-200" />
          <div className="h-6 w-11 rounded-full bg-zinc-200" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="h-3 w-12 rounded bg-zinc-200" />
          <div className="h-6 w-11 rounded-full bg-zinc-200" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ActividadesConfigPage() {
  const [items, setItems] = useState<ActivityType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Track which item codes are currently mid-request to disable controls
  const [pendingCodes, setPendingCodes] = useState<Set<string>>(new Set());

  // -------------------------------------------------------------------------
  // Load
  // -------------------------------------------------------------------------
  const fetchItems = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    activityTypesApi
      .list()
      .then((data) => {
        if (!cancelled) {
          // Sort by sortOrder ascending on initial load
          const sorted = [...data.activityTypes].sort((a, b) => a.sortOrder - b.sortOrder);
          setItems(sorted);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setLoadError(err.message);
          } else {
            setLoadError('Error al cargar los tipos de actividad');
          }
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const cancel = fetchItems();
    return cancel;
  }, [fetchItems]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function addPending(code: string) {
    setPendingCodes((prev) => new Set(prev).add(code));
  }

  function removePending(code: string) {
    setPendingCodes((prev) => {
      const next = new Set(prev);
      next.delete(code);
      return next;
    });
  }

  // -------------------------------------------------------------------------
  // Toggle active / favorite
  // -------------------------------------------------------------------------
  const handleToggle = async (
    code: string,
    field: 'isActive' | 'isFavorite',
    currentValue: boolean,
  ) => {
    const newValue = !currentValue;

    // Optimistic update
    setItems((prev) =>
      prev.map((item) => (item.code === code ? { ...item, [field]: newValue } : item)),
    );

    addPending(code);
    try {
      await activityTypesApi.update(code, { [field]: newValue });
      showSuccess(
        field === 'isActive'
          ? newValue
            ? 'Tipo de actividad activado'
            : 'Tipo de actividad desactivado'
          : newValue
          ? 'Marcado como favorito'
          : 'Quitado de favoritos',
      );
    } catch (err) {
      // Roll back optimistic update
      setItems((prev) =>
        prev.map((item) => (item.code === code ? { ...item, [field]: currentValue } : item)),
      );
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al actualizar el tipo de actividad');
      }
    } finally {
      removePending(code);
    }
  };

  // -------------------------------------------------------------------------
  // Reorder (move up / move down)
  // -------------------------------------------------------------------------
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= items.length) return;

    // Optimistic reorder
    const reordered = [...items];
    const temp = reordered[index];
    reordered[index] = reordered[swapIndex];
    reordered[swapIndex] = temp;

    // Reassign contiguous sortOrder values based on new positions
    const withNewOrder = reordered.map((item, i) => ({ ...item, sortOrder: i + 1 }));
    setItems(withNewOrder);

    // Build payload for API
    const reorderPayload = withNewOrder.map(({ code, sortOrder }) => ({ code, sortOrder }));

    // Mark both swapped codes as pending
    const codeA = items[index].code;
    const codeB = items[swapIndex].code;
    addPending(codeA);
    addPending(codeB);

    try {
      await activityTypesApi.reorder(reorderPayload);
    } catch (err) {
      // Roll back to original order
      setItems(items);
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al reordenar los tipos de actividad');
      }
    } finally {
      removePending(codeA);
      removePending(codeB);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div>
      {/* Legend */}
      <div className="mb-4 flex items-center gap-4 text-xs text-zinc-500">
        <span>
          Usa las flechas para cambiar el orden en que aparecen los tipos de actividad al registrar
          un contacto.
        </span>
      </div>

      {/* Error state */}
      {loadError && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">
          {loadError}
          <button
            onClick={fetchItems}
            className="ml-3 font-medium underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !loadError && items.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 py-16 text-center">
          <p className="mb-2 text-sm font-medium text-zinc-700">
            No hay tipos de actividad configurados
          </p>
          <p className="text-xs text-zinc-500">
            Los tipos de actividad se generan automaticamente al configurar la cuenta
          </p>
        </div>
      )}

      {/* Activity type list */}
      {!isLoading && !loadError && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => {
            const isPending = pendingCodes.has(item.code);
            const isFirst = index === 0;
            const isLast = index === items.length - 1;

            return (
              <div
                key={item.code}
                className={`flex items-center gap-3 rounded-xl border bg-white px-4 shadow-sm transition-opacity ${
                  isPending ? 'opacity-60' : 'opacity-100'
                } ${
                  item.isActive ? 'border-zinc-200' : 'border-zinc-100'
                }`}
                style={{ minHeight: '60px' }}
              >
                {/* Reorder arrows */}
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    aria-label="Mover arriba"
                    disabled={isFirst || isPending}
                    onClick={() => handleMove(index, 'up')}
                    style={{ minHeight: '28px', minWidth: '28px' }}
                    className="flex items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
                  >
                    <ChevronUpIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Mover abajo"
                    disabled={isLast || isPending}
                    onClick={() => handleMove(index, 'down')}
                    style={{ minHeight: '28px', minWidth: '28px' }}
                    className="flex items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
                  >
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Label + system badge */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`truncate text-sm font-medium ${
                        item.isActive ? 'text-zinc-900' : 'text-zinc-400'
                      }`}
                    >
                      {item.label}
                    </span>
                    {item.isSystem && (
                      <span className="flex-shrink-0 inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                        Sistema
                      </span>
                    )}
                    {item.isFavorite && item.isActive && (
                      <span className="flex-shrink-0 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Favorito
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">#{item.code}</p>
                </div>

                {/* Toggles */}
                <div className="flex items-center gap-5 flex-shrink-0">
                  <Toggle
                    checked={item.isActive}
                    onChange={() => handleToggle(item.code, 'isActive', item.isActive)}
                    label="Activo"
                    disabled={isPending}
                  />
                  <Toggle
                    checked={item.isFavorite}
                    onChange={() => handleToggle(item.code, 'isFavorite', item.isFavorite)}
                    label="Favorito"
                    disabled={isPending || !item.isActive}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer hint */}
      {!isLoading && !loadError && items.length > 0 && (
        <p className="mt-6 text-xs text-zinc-400 text-center">
          Los favoritos aparecen primero al registrar una actividad en un lead o cliente.
        </p>
      )}
    </div>
  );
}
