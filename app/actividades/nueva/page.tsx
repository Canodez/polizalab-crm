'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { activitiesApi, EntityType } from '@/lib/api/activitiesApi';
import { activityTypesApi, ActivityType } from '@/lib/api/activityTypesApi';
import { ApiError } from '@/lib/api-client';
import { showSuccess, showError } from '@/lib/toast';
import { useDirtyFormGuard } from '@/lib/hooks/useDirtyFormGuard';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface FormErrors {
  tipoCodigo?: string;
  dueDate?: string;
}

function validate(fields: { tipoCodigo: string; dueDate: string }): FormErrors {
  const errors: FormErrors = {};
  if (!fields.tipoCodigo) errors.tipoCodigo = 'Selecciona el tipo de actividad';
  if (!fields.dueDate) errors.dueDate = 'La fecha es requerida';
  return errors;
}

// ── Field component ───────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  id: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, id, error, required, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const selectClass =
  'w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white';

// ── Entity search ─────────────────────────────────────────────────────────────

type EntityTypeOption = EntityType | '';

const entityTypeOptions: Array<{ value: EntityTypeOption; label: string }> = [
  { value: '', label: 'Sin vincular' },
  { value: 'LEAD', label: 'Lead' },
  { value: 'CLIENT', label: 'Cliente' },
  { value: 'OPPORTUNITY', label: 'Oportunidad' },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function NuevaActividadPage() {
  const router = useRouter();
  const { markDirty, markClean, guardedNavigate } = useDirtyFormGuard();

  // Activity types
  const [allTypes, setAllTypes] = useState<ActivityType[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [showAllTypes, setShowAllTypes] = useState(false);

  // Form fields
  const [tipoCodigo, setTipoCodigo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [entityTypeSelect, setEntityTypeSelect] = useState<EntityTypeOption>('');
  const [entitySearch, setEntitySearch] = useState('');
  const [notes, setNotes] = useState('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Load activity types on mount
  useEffect(() => {
    let cancelled = false;
    activityTypesApi
      .list()
      .then((res) => {
        if (cancelled) return;
        // Sort: favorites first, then by sortOrder
        const sorted = [...res.activityTypes].sort((a, b) => {
          if (a.isFavorite && !b.isFavorite) return -1;
          if (!a.isFavorite && b.isFavorite) return 1;
          return a.sortOrder - b.sortOrder;
        });
        setAllTypes(sorted.filter((t) => t.isActive));
      })
      .catch(() => {
        // Non-critical — user can still see empty grid
      })
      .finally(() => {
        if (!cancelled) setTypesLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const favoriteTypes = allTypes.filter((t) => t.isFavorite);
  const nonFavoriteTypes = allTypes.filter((t) => !t.isFavorite);

  const displayedTypes = showAllTypes ? allTypes : favoriteTypes;

  const handleTypeSelect = useCallback(
    (code: string) => {
      setTipoCodigo(code);
      markDirty();
      if (errors.tipoCodigo) {
        setErrors((prev) => ({ ...prev, tipoCodigo: undefined }));
      }
    },
    [markDirty, errors.tipoCodigo]
  );

  const handleSubmit = async () => {
    const validationErrors = validate({ tipoCodigo, dueDate });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitError('');
    setIsSubmitting(true);

    try {
      // Build scheduledAt from date + time if time provided
      let scheduledAt: string | undefined;
      if (dueDate && dueTime) {
        scheduledAt = `${dueDate}T${dueTime}:00`;
      }

      const payload = {
        tipoCodigo,
        dueDate,
        scheduledAt,
        notes: notes.trim() || undefined,
        entityType: entityTypeSelect || undefined,
        entityId: entitySearch.trim() || undefined,
      };

      await activitiesApi.create(payload);
      markClean();
      showSuccess('Actividad creada exitosamente');
      router.push('/empezar-mi-dia');
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
        showError(err.message);
      } else {
        setSubmitError('Error al crear la actividad. Intenta nuevamente.');
        showError('Error al crear la actividad');
      }
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Back link */}
      <div className="mb-6">
        <button
          onClick={() => guardedNavigate('/empezar-mi-dia', router)}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Mis actividades
        </button>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-xl font-semibold text-zinc-900">Nueva actividad</h2>
        <p className="mb-6 text-sm text-zinc-500">
          Registra una actividad para dar seguimiento a tus clientes y prospectos.
        </p>

        {submitError && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600">{submitError}</div>
        )}

        <div className="space-y-6">
          {/* Activity type chip grid */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Tipo de actividad <span className="text-red-500">*</span>
            </h3>

            {typesLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="h-11 animate-pulse rounded-lg bg-zinc-100"
                  />
                ))}
              </div>
            ) : allTypes.length === 0 ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500 text-center">
                No hay tipos de actividad configurados.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {displayedTypes.map((type) => (
                    <button
                      key={type.code}
                      onClick={() => handleTypeSelect(type.code)}
                      className={`rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${
                        tipoCodigo === type.code
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                      }`}
                      style={{ minHeight: '44px' }}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>

                {nonFavoriteTypes.length > 0 && (
                  <button
                    onClick={() => setShowAllTypes((v) => !v)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    {showAllTypes ? (
                      <>
                        <ChevronUpIcon className="h-3.5 w-3.5" />
                        Ver menos
                      </>
                    ) : (
                      <>
                        <ChevronDownIcon className="h-3.5 w-3.5" />
                        Ver todos ({allTypes.length})
                      </>
                    )}
                  </button>
                )}
              </>
            )}

            {errors.tipoCodigo && (
              <p className="mt-2 text-xs text-red-600">{errors.tipoCodigo}</p>
            )}
          </div>

          {/* Date and time */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Fecha y hora
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Fecha" id="dueDate" error={errors.dueDate} required>
                <input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    markDirty();
                    if (errors.dueDate) setErrors((prev) => ({ ...prev, dueDate: undefined }));
                  }}
                  className={errors.dueDate
                    ? 'w-full rounded-lg border border-red-400 px-4 py-3 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500'
                    : inputClass}
                  style={{ minHeight: '44px' }}
                />
              </Field>

              <Field label="Hora (opcional)" id="dueTime">
                <input
                  id="dueTime"
                  type="time"
                  value={dueTime}
                  onChange={(e) => { setDueTime(e.target.value); markDirty(); }}
                  className={inputClass}
                  style={{ minHeight: '44px' }}
                />
              </Field>
            </div>
          </div>

          {/* Entity link */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Vincular a (opcional)
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tipo de entidad" id="entityType">
                <select
                  id="entityType"
                  value={entityTypeSelect}
                  onChange={(e) => {
                    setEntityTypeSelect(e.target.value as EntityTypeOption);
                    setEntitySearch('');
                    markDirty();
                  }}
                  className={selectClass}
                  style={{ minHeight: '44px' }}
                >
                  {entityTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>

              {entityTypeSelect && (
                <Field label={`ID o nombre del ${entityTypeSelect === 'LEAD' ? 'lead' : entityTypeSelect === 'CLIENT' ? 'cliente' : 'oportunidad'}`} id="entitySearch">
                  <input
                    id="entitySearch"
                    type="text"
                    value={entitySearch}
                    onChange={(e) => { setEntitySearch(e.target.value); markDirty(); }}
                    placeholder="Escribe el ID o nombre..."
                    className={inputClass}
                    style={{ minHeight: '44px' }}
                  />
                </Field>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Notas
            </h3>
            <div>
              <label htmlFor="notes" className="mb-1 block text-sm font-medium text-zinc-700">
                Notas internas (opcional)
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => { setNotes(e.target.value); markDirty(); }}
                placeholder="Contexto o informacion adicional sobre esta actividad..."
                rows={3}
                className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
            style={{ minHeight: '44px' }}
          >
            {isSubmitting ? 'Creando actividad...' : 'Crear actividad'}
          </button>
          <button
            onClick={() => guardedNavigate('/empezar-mi-dia', router)}
            className="flex-1 rounded-lg border border-zinc-300 px-6 py-3 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            style={{ minHeight: '44px' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
