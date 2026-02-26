'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import {
  activitiesApi,
  Activity,
  ActivityStatus,
  ApiError,
} from '@/lib/api/activitiesApi';
import { useDirtyFormGuard } from '@/lib/hooks/useDirtyFormGuard';
import { showSuccess, showError } from '@/lib/toast';
import AccountCard from '@/components/account/AccountCard';
import ActivityStatusBadge from '@/components/activities/ActivityStatusBadge';

// ── Display helpers ──────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), "d 'de' MMMM yyyy", { locale: es });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), "d 'de' MMMM yyyy, HH:mm", { locale: es });
  } catch {
    return dateStr;
  }
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-zinc-900">{value || '—'}</p>
    </div>
  );
}

function entityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    LEAD: 'Lead',
    CLIENT: 'Cliente',
    OPPORTUNITY: 'Oportunidad',
  };
  return labels[type] ?? type;
}

function entityPath(type: string, id: string): string {
  const paths: Record<string, string> = {
    LEAD: `/leads/${id}`,
    CLIENT: `/clients/${id}`,
    OPPORTUNITY: `/opportunities/${id}`,
  };
  return paths[type] ?? '#';
}

// ── Reschedule options ────────────────────────────────────────────────────────

type RescheduleMode = '+2h' | 'tomorrow_10am' | 'custom';

// ── Main component ────────────────────────────────────────────────────────────

export default function ActivityDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();

  // Static export: extract real ID from pathname
  const activityId = pathname.split('/').filter(Boolean)[1] || params?.id || '';

  const [activity, setActivity] = useState<Activity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notFound, setNotFound] = useState(false);

  // Action states
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reschedule
  const [showRescheduleMenu, setShowRescheduleMenu] = useState(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Complete with outcomes
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [outcomeNote, setOutcomeNote] = useState('');

  const { markClean, guardedNavigate } = useDirtyFormGuard();

  const load = useCallback(async () => {
    if (!activityId) return;
    setIsLoading(true);
    setLoadError('');

    try {
      const data = await activitiesApi.get(activityId);
      setActivity(data);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        setNotFound(true);
      } else if (err instanceof ApiError) {
        setLoadError(err.message);
      } else {
        setLoadError('Error al cargar la actividad');
      }
    } finally {
      setIsLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      const outcomes =
        outcomeNote.trim() ? [outcomeNote.trim()] : undefined;
      const updated = await activitiesApi.complete(activityId, { outcomes });
      setActivity(updated);
      setShowCompleteForm(false);
      setOutcomeNote('');
      showSuccess('Actividad marcada como hecha');
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al completar la actividad');
      }
    } finally {
      setIsCompleting(false);
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      const updated = await activitiesApi.cancel(activityId);
      setActivity(updated);
      setShowCancelConfirm(false);
      showSuccess('Actividad cancelada');
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al cancelar la actividad');
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const handleReschedule = async (mode: RescheduleMode) => {
    if (mode === 'custom') {
      setShowRescheduleMenu(false);
      setShowCustomDatePicker(true);
      return;
    }
    setIsRescheduling(true);
    setShowRescheduleMenu(false);
    try {
      const updated = await activitiesApi.reschedule(activityId, { mode });
      setActivity(updated);
      showSuccess('Actividad reprogramada');
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al reprogramar la actividad');
      }
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleCustomReschedule = async () => {
    if (!customDate) return;
    setIsRescheduling(true);
    try {
      const updated = await activitiesApi.reschedule(activityId, {
        mode: 'custom',
        customDate,
        customTime: customTime || undefined,
      });
      setActivity(updated);
      setShowCustomDatePicker(false);
      setCustomDate('');
      setCustomTime('');
      showSuccess('Actividad reprogramada');
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al reprogramar la actividad');
      }
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await activitiesApi.delete(activityId);
      markClean();
      showSuccess('Actividad eliminada');
      router.push('/empezar-mi-dia');
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al eliminar la actividad');
      }
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-lg text-zinc-600">Cargando...</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="mb-2 text-lg font-semibold text-zinc-900">Actividad no encontrada</p>
        <p className="mb-6 text-sm text-zinc-500">
          La actividad que buscas no existe o fue eliminada.
        </p>
        <button
          onClick={() => router.push('/empezar-mi-dia')}
          className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{loadError}</div>
    );
  }

  if (!activity) return null;

  const isPendiente = activity.status === 'PENDIENTE';
  const isHecha = activity.status === 'HECHA';
  const isCancelada = activity.status === 'CANCELADA';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Back button */}
      <div className="mb-6">
        <button
          onClick={() => guardedNavigate('/empezar-mi-dia', router)}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← Mis actividades
        </button>
      </div>

      {/* Header card */}
      <div className="mb-6 rounded-xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ActivityStatusBadge status={activity.status} size="md" />
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                {activity.tipoLabel ?? activity.tipoCodigo}
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold text-zinc-900">
              {activity.tipoLabel ?? activity.tipoCodigo}
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              Vence el{' '}
              <span className="font-medium text-zinc-700">{formatDate(activity.dueDate)}</span>
            </p>
          </div>
        </div>

        {/* Entity link */}
        {activity.entityType && activity.entityId && (
          <div className="mt-4 border-t border-zinc-100 pt-4">
            <p className="mb-1 text-xs text-zinc-500">
              Vinculado a {entityTypeLabel(activity.entityType)}
            </p>
            <Link
              href={entityPath(activity.entityType, activity.entityId)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              {activity.entityName ?? activity.entityId}
            </Link>
          </div>
        )}
      </div>

      {/* ── PENDIENTE ACTIONS ────────────────────────────────────────────── */}
      {isPendiente && (
        <div className="mb-6 space-y-3">
          {/* Complete */}
          {!showCompleteForm ? (
            <button
              onClick={() => setShowCompleteForm(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 transition-colors"
              style={{ minHeight: '44px' }}
            >
              <CheckCircleIcon className="h-5 w-5" />
              Marcar como hecha
            </button>
          ) : (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <h4 className="mb-3 text-sm font-semibold text-green-900">
                Completar actividad
              </h4>
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-green-800">
                  Resultado (opcional)
                </label>
                <textarea
                  value={outcomeNote}
                  onChange={(e) => setOutcomeNote(e.target.value)}
                  placeholder="Describe el resultado de la actividad..."
                  rows={2}
                  className="w-full rounded-lg border border-green-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleComplete}
                  disabled={isCompleting}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:bg-green-300"
                  style={{ minHeight: '40px' }}
                >
                  {isCompleting ? 'Guardando...' : 'Confirmar'}
                </button>
                <button
                  onClick={() => { setShowCompleteForm(false); setOutcomeNote(''); }}
                  disabled={isCompleting}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  style={{ minHeight: '40px' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Reschedule */}
          <div className="relative">
            <button
              onClick={() => setShowRescheduleMenu((v) => !v)}
              disabled={isRescheduling}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50"
              style={{ minHeight: '44px' }}
            >
              <ClockIcon className="h-5 w-5" />
              {isRescheduling ? 'Reprogramando...' : 'Reprogramar'}
              <ChevronDownIcon className="h-4 w-4 ml-auto" />
            </button>
            {showRescheduleMenu && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                <button
                  onClick={() => handleReschedule('+2h')}
                  className="block w-full px-4 py-3 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                  style={{ minHeight: '44px' }}
                >
                  + 2 horas
                </button>
                <button
                  onClick={() => handleReschedule('tomorrow_10am')}
                  className="block w-full px-4 py-3 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                  style={{ minHeight: '44px' }}
                >
                  Manana a las 10am
                </button>
                <button
                  onClick={() => handleReschedule('custom')}
                  className="block w-full px-4 py-3 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                  style={{ minHeight: '44px' }}
                >
                  Elegir fecha...
                </button>
              </div>
            )}
          </div>

          {/* Custom date picker */}
          {showCustomDatePicker && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <h4 className="mb-3 text-sm font-semibold text-blue-900">
                Elegir nueva fecha
              </h4>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-blue-800">Fecha *</label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    style={{ minHeight: '40px' }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-blue-800">Hora (opcional)</label>
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    style={{ minHeight: '40px' }}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCustomReschedule}
                  disabled={!customDate || isRescheduling}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
                  style={{ minHeight: '40px' }}
                >
                  {isRescheduling ? 'Guardando...' : 'Reprogramar'}
                </button>
                <button
                  onClick={() => { setShowCustomDatePicker(false); setCustomDate(''); setCustomTime(''); }}
                  disabled={isRescheduling}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  style={{ minHeight: '40px' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Cancel */}
          {!showCancelConfirm ? (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
              style={{ minHeight: '44px' }}
            >
              <XCircleIcon className="h-5 w-5" />
              Cancelar actividad
            </button>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="mb-1 text-sm font-semibold text-zinc-900">
                Cancelar esta actividad?
              </p>
              <p className="mb-4 text-xs text-zinc-500">
                La actividad quedara marcada como cancelada y no aparecera en tu agenda.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  disabled={isCancelling}
                  className="flex-1 rounded-lg bg-zinc-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
                  style={{ minHeight: '40px' }}
                >
                  {isCancelling ? 'Cancelando...' : 'Si, cancelar'}
                </button>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={isCancelling}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  style={{ minHeight: '40px' }}
                >
                  Volver
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── HECHA STATE ───────────────────────────────────────────────────── */}
      {isHecha && activity.completedAt && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircleIcon className="h-5 w-5 text-green-600" />
            <p className="text-sm font-semibold text-green-900">Actividad completada</p>
          </div>
          <p className="text-xs text-green-700">
            Completada el {formatDateTime(activity.completedAt)}
          </p>
          {activity.outcomes && activity.outcomes.length > 0 && (
            <div className="mt-3 border-t border-green-200 pt-3">
              <p className="mb-1.5 text-xs font-medium text-green-800">Resultados</p>
              <ul className="space-y-1">
                {activity.outcomes.map((o, idx) => (
                  <li key={idx} className="text-sm text-green-800">
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── CANCELADA STATE ──────────────────────────────────────────────── */}
      {isCancelada && activity.cancelledAt && (
        <div className="mb-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4">
          <div className="flex items-center gap-2">
            <XCircleIcon className="h-5 w-5 text-zinc-400" />
            <p className="text-sm font-medium text-zinc-600">
              Cancelada el {formatDateTime(activity.cancelledAt)}
            </p>
          </div>
        </div>
      )}

      {/* ── DETAIL CARD ───────────────────────────────────────────────────── */}
      <AccountCard title="Detalle de la actividad">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <InfoRow label="Tipo" value={activity.tipoLabel ?? activity.tipoCodigo} />
          <InfoRow label="Vence" value={formatDate(activity.dueDate)} />
          {activity.scheduledAt && (
            <InfoRow label="Programado para" value={formatDateTime(activity.scheduledAt)} />
          )}
          <InfoRow label="Creado" value={formatDate(activity.createdAt)} />
          {activity.completedAt && (
            <InfoRow label="Completado" value={formatDateTime(activity.completedAt)} />
          )}
          {activity.cancelledAt && (
            <InfoRow label="Cancelado" value={formatDateTime(activity.cancelledAt)} />
          )}
        </div>
      </AccountCard>

      {/* Notes */}
      {activity.notes && (
        <AccountCard title="Notas">
          <p className="whitespace-pre-wrap text-sm text-zinc-700">{activity.notes}</p>
        </AccountCard>
      )}

      {/* Outcomes */}
      {isHecha && activity.outcomes && activity.outcomes.length > 0 && (
        <AccountCard title="Resultados">
          <ul className="space-y-2">
            {activity.outcomes.map((o, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-zinc-700">
                <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                {o}
              </li>
            ))}
          </ul>
        </AccountCard>
      )}

      {/* Checklist */}
      {activity.checklist && activity.checklist.length > 0 && (
        <AccountCard title="Lista de verificacion">
          <ul className="space-y-2">
            {activity.checklist.map((item, idx) => (
              <li key={idx} className="flex items-center gap-2 text-sm">
                <span
                  className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
                    item.done
                      ? 'border-green-500 bg-green-100 text-green-600'
                      : 'border-zinc-300 bg-white'
                  }`}
                >
                  {item.done && (
                    <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M8.707 2.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L4 5.586l3.293-3.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </span>
                <span className={item.done ? 'text-zinc-400 line-through' : 'text-zinc-700'}>
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        </AccountCard>
      )}

      {/* Scheduled */}
      {activity.scheduledAt && (
        <AccountCard title="Horario">
          <div className="flex items-center gap-3">
            <CalendarDaysIcon className="h-5 w-5 flex-shrink-0 text-zinc-400" />
            <p className="text-sm font-medium text-zinc-900">
              {formatDateTime(activity.scheduledAt)}
            </p>
          </div>
        </AccountCard>
      )}

      {/* ── DELETE SECTION ────────────────────────────────────────────────── */}
      <div className="mt-2">
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full rounded-lg border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            style={{ minHeight: '44px' }}
          >
            <span className="inline-flex items-center gap-2">
              <TrashIcon className="h-4 w-4" />
              Eliminar actividad
            </span>
          </button>
        ) : (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="mb-1 text-sm font-semibold text-red-900">
              Eliminar esta actividad permanentemente?
            </p>
            <p className="mb-4 text-xs text-red-700">
              La actividad sera eliminada. Esta accion no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700 disabled:bg-red-300"
                style={{ minHeight: '44px' }}
              >
                {isDeleting ? 'Eliminando...' : 'Si, eliminar'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                style={{ minHeight: '44px' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
