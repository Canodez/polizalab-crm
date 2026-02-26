'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Dialog, Transition } from '@headlessui/react';
import {
  XMarkIcon,
  CheckIcon,
  ClockIcon,
  PhoneIcon,
  ChatBubbleLeftEllipsisIcon,
  NoSymbolIcon,
} from '@heroicons/react/24/outline';
import { activitiesApi, Activity, EntityType } from '@/lib/api/activitiesApi';
import ActivityStatusBadge from '@/components/activities/ActivityStatusBadge';
import { showSuccess, showError } from '@/lib/toast';

interface Props {
  activityId: string | null;
  onClose: () => void;
  onUpdate?: () => void;
}

const tipoLabels: Record<string, string> = {
  CONTACTO_INICIAL:           'Contacto inicial',
  LLAMADA:                    'Llamada',
  WHATSAPP:                   'WhatsApp',
  REUNION:                    'Reunion',
  SEGUIMIENTO_COTIZACION:     'Seguimiento cotizacion',
  SOLICITAR_DOCUMENTOS:       'Solicitar documentos',
  CONFIRMAR_PAGO:             'Confirmar pago',
  RENOVACION_PRIMER_CONTACTO: 'Renovacion contacto',
  RENOVACION_SEGUIMIENTO:     'Renovacion seguimiento',
  TAREA_INTERNA:              'Tarea interna',
};

const entityPrefixes: Record<EntityType, string> = {
  LEAD:        '/leads',
  CLIENT:      '/clients',
  OPPORTUNITY: '/oportunidades',
};

function formatDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return isoStr;
  }
}

function formatDateOnly(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return isoStr;
  }
}

interface InfoRowProps {
  label: string;
  value: string;
}

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-zinc-900">{value}</p>
    </div>
  );
}

export default function ActivityDetailDrawer({ activityId, onClose, onUpdate }: Props) {
  const isOpen = activityId !== null;
  const [activity, setActivity] = useState<Activity | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  const fetchActivity = useCallback(() => {
    if (!activityId) return;
    let cancelled = false;
    setIsFetching(true);
    setFetchError('');
    setActivity(null);
    activitiesApi
      .get(activityId)
      .then((res) => {
        if (!cancelled) {
          setActivity(res);
          setIsFetching(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchError('No se pudo cargar la actividad');
          setIsFetching(false);
        }
      });
    return () => { cancelled = true; };
  }, [activityId]);

  useEffect(() => {
    if (isOpen) {
      const cancel = fetchActivity();
      return cancel ?? undefined;
    } else {
      setActivity(null);
      setFetchError('');
    }
  }, [isOpen, fetchActivity]);

  const handleComplete = async () => {
    if (!activity) return;
    setActionLoading('complete');
    try {
      await activitiesApi.complete(activity.activityId);
      showSuccess('Actividad marcada como hecha');
      onUpdate?.();
      onClose();
    } catch {
      showError('Error al completar la actividad');
    } finally {
      setActionLoading('');
    }
  };

  const handleReschedule = async (mode: '+2h' | 'tomorrow_10am') => {
    if (!activity) return;
    setActionLoading(mode);
    try {
      await activitiesApi.reschedule(activity.activityId, { mode });
      showSuccess(mode === '+2h' ? 'Actividad reprogramada +2h' : 'Actividad reprogramada para manana');
      onUpdate?.();
      const updated = await activitiesApi.get(activity.activityId);
      setActivity(updated);
    } catch {
      showError('Error al reprogramar');
    } finally {
      setActionLoading('');
    }
  };

  const handleCancel = async () => {
    if (!activity) return;
    setActionLoading('cancel');
    try {
      await activitiesApi.cancel(activity.activityId);
      showSuccess('Actividad cancelada');
      onUpdate?.();
      onClose();
    } catch {
      showError('Error al cancelar la actividad');
    } finally {
      setActionLoading('');
    }
  };

  const tipoLabel =
    activity?.tipoLabel ?? tipoLabels[activity?.tipoCodigo ?? ''] ?? activity?.tipoCodigo ?? '';

  const entityHref =
    activity?.entityType && activity?.entityId
      ? `${entityPrefixes[activity.entityType] ?? ''}/${activity.entityId}`
      : null;

  const chipClass =
    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50';

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Overlay */}
        <Transition.Child
          as={Fragment}
          enter="transition-opacity ease-linear duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity ease-linear duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-zinc-900/40" />
        </Transition.Child>

        {/* Slide-over panel */}
        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-md">
                  <div className="flex h-full flex-col bg-white shadow-xl">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-4">
                      <Dialog.Title className="text-base font-semibold text-zinc-900">
                        Detalle de actividad
                      </Dialog.Title>
                      <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
                        aria-label="Cerrar"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto px-4 py-6">
                      {/* Loading */}
                      {isFetching && (
                        <div className="flex items-center justify-center py-12">
                          <span className="text-sm text-zinc-500">Cargando...</span>
                        </div>
                      )}

                      {/* Error */}
                      {!isFetching && fetchError && (
                        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                          {fetchError}
                        </div>
                      )}

                      {/* Content */}
                      {!isFetching && activity && (
                        <div className="space-y-6">
                          {/* Tipo + status */}
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-lg font-semibold text-zinc-900">{tipoLabel}</p>
                              {entityHref && (
                                <Link
                                  href={entityHref}
                                  onClick={onClose}
                                  className="mt-1 text-sm text-blue-600 hover:underline truncate block max-w-xs"
                                >
                                  {activity.entityName ?? activity.entityId}
                                </Link>
                              )}
                            </div>
                            <ActivityStatusBadge status={activity.status} size="md" />
                          </div>

                          {/* Date info */}
                          <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-100 bg-zinc-50 p-4">
                            <InfoRow
                              label="Fecha de vencimiento"
                              value={formatDateOnly(activity.dueDate)}
                            />
                            <InfoRow
                              label="Hora programada"
                              value={activity.scheduledAt ? formatDateTime(activity.scheduledAt) : '—'}
                            />
                            {activity.reminderAt && (
                              <InfoRow
                                label="Recordatorio"
                                value={formatDateTime(activity.reminderAt)}
                              />
                            )}
                            {activity.completedAt && (
                              <InfoRow
                                label="Completada"
                                value={formatDateTime(activity.completedAt)}
                              />
                            )}
                          </div>

                          {/* Notes */}
                          {activity.notes && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-zinc-500">Notas</p>
                              <p className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-800">
                                {activity.notes}
                              </p>
                            </div>
                          )}

                          {/* Checklist */}
                          {activity.checklist && activity.checklist.length > 0 && (
                            <div>
                              <p className="mb-2 text-xs font-medium text-zinc-500">Checklist</p>
                              <ul className="space-y-1.5">
                                {activity.checklist.map((item, idx) => (
                                  <li key={idx} className="flex items-center gap-2 text-sm text-zinc-800">
                                    <span
                                      className={`h-4 w-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center ${
                                        item.done
                                          ? 'border-green-500 bg-green-500'
                                          : 'border-zinc-300'
                                      }`}
                                    >
                                      {item.done && (
                                        <CheckIcon className="h-2.5 w-2.5 text-white" />
                                      )}
                                    </span>
                                    <span className={item.done ? 'line-through text-zinc-400' : ''}>
                                      {item.text}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Phone / WhatsApp quick actions */}
                          {activity.entityName && (
                            <div>
                              <p className="mb-2 text-xs font-medium text-zinc-500">Acciones rapidas</p>
                              <div className="flex gap-2">
                                <a
                                  href="tel:"
                                  className={`${chipClass} bg-zinc-100 text-zinc-700 hover:bg-zinc-200`}
                                >
                                  <PhoneIcon className="h-3.5 w-3.5" />
                                  Llamar
                                </a>
                                <a
                                  href="https://wa.me/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`${chipClass} bg-green-50 text-green-700 hover:bg-green-100`}
                                >
                                  <ChatBubbleLeftEllipsisIcon className="h-3.5 w-3.5" />
                                  WhatsApp
                                </a>
                              </div>
                            </div>
                          )}

                          {/* Action buttons (only for PENDIENTE) */}
                          {activity.status === 'PENDIENTE' && (
                            <div>
                              <p className="mb-2 text-xs font-medium text-zinc-500">Acciones</p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={handleComplete}
                                  disabled={!!actionLoading}
                                  className={`${chipClass} bg-green-50 text-green-700 hover:bg-green-100`}
                                  style={{ minHeight: '44px' }}
                                >
                                  <CheckIcon className="h-3.5 w-3.5" />
                                  {actionLoading === 'complete' ? 'Guardando...' : 'Marcar hecha'}
                                </button>

                                <button
                                  onClick={() => handleReschedule('+2h')}
                                  disabled={!!actionLoading}
                                  className={`${chipClass} bg-blue-50 text-blue-700 hover:bg-blue-100`}
                                  style={{ minHeight: '44px' }}
                                >
                                  <ClockIcon className="h-3.5 w-3.5" />
                                  {actionLoading === '+2h' ? '...' : 'Reprogramar +2h'}
                                </button>

                                <button
                                  onClick={() => handleReschedule('tomorrow_10am')}
                                  disabled={!!actionLoading}
                                  className={`${chipClass} bg-blue-50 text-blue-700 hover:bg-blue-100`}
                                  style={{ minHeight: '44px' }}
                                >
                                  <ClockIcon className="h-3.5 w-3.5" />
                                  {actionLoading === 'tomorrow_10am' ? '...' : 'Manana 10am'}
                                </button>

                                <button
                                  onClick={handleCancel}
                                  disabled={!!actionLoading}
                                  className={`${chipClass} bg-red-50 text-red-600 hover:bg-red-100`}
                                  style={{ minHeight: '44px' }}
                                >
                                  <NoSymbolIcon className="h-3.5 w-3.5" />
                                  {actionLoading === 'cancel' ? '...' : 'Cancelar'}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* View full detail link */}
                          <div className="pt-2 border-t border-zinc-100">
                            <Link
                              href={`/actividades/${activity.activityId}`}
                              onClick={onClose}
                              className="text-sm text-blue-600 hover:underline"
                            >
                              Ver detalle completo
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
