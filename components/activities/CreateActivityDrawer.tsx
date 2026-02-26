'use client';

import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import {
  activitiesApi,
  CreateActivityData,
  EntityType,
} from '@/lib/api/activitiesApi';
import {
  activityTypesApi,
  ActivityType,
} from '@/lib/api/activityTypesApi';
import { showSuccess, showError } from '@/lib/toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  entityType?: EntityType;
  entityId?: string;
  entityName?: string;
  onCreated?: () => void;
}

// Fallback list used while activity types are loading
const FALLBACK_TYPES: { code: string; label: string }[] = [
  { code: 'LLAMADA',                    label: 'Llamada'                       },
  { code: 'WHATSAPP',                   label: 'WhatsApp'                      },
  { code: 'REUNION',                    label: 'Reunión'                       },
  { code: 'CONTACTO_INICIAL',           label: 'Contacto inicial'              },
  { code: 'SEGUIMIENTO_COTIZACION',     label: 'Seguimiento de cotización'     },
  { code: 'SOLICITAR_DOCUMENTOS',       label: 'Solicitar documentos'          },
  { code: 'CONFIRMAR_PAGO',             label: 'Confirmar pago'                },
  { code: 'RENOVACION_PRIMER_CONTACTO', label: 'Primer contacto de renovación' },
  { code: 'RENOVACION_SEGUIMIENTO',     label: 'Seguimiento de renovación'     },
  { code: 'TAREA_INTERNA',              label: 'Tarea interna'                 },
];

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CreateActivityDrawer({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityName,
  onCreated,
}: Props) {
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);

  // Form state
  const [tipoCodigo, setTipoCodigo] = useState('');
  const [dueDate, setDueDate] = useState(todayISODate());
  const [scheduledTime, setScheduledTime] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load activity types when drawer opens
  useEffect(() => {
    if (!isOpen) return;

    setTypesLoading(true);
    activityTypesApi
      .list()
      .then((res) => setActivityTypes(res.activityTypes.filter((t) => t.isActive)))
      .catch(() => setActivityTypes([]))
      .finally(() => setTypesLoading(false));
  }, [isOpen]);

  // Reset form when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTipoCodigo('');
      setDueDate(todayISODate());
      setScheduledTime('');
      setNotes('');
    }
  }, [isOpen]);

  // Sorted types: favorites first, then by sortOrder
  const displayTypes: { code: string; label: string; isFavorite?: boolean }[] =
    activityTypes.length > 0
      ? [...activityTypes].sort((a, b) => {
          if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
          return a.sortOrder - b.sortOrder;
        })
      : FALLBACK_TYPES;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tipoCodigo) {
      showError('Selecciona el tipo de actividad');
      return;
    }
    if (!dueDate) {
      showError('Indica la fecha de vencimiento');
      return;
    }

    setIsSubmitting(true);
    try {
      const data: CreateActivityData = {
        tipoCodigo,
        dueDate,
        notes: notes.trim() || undefined,
      };

      if (entityType) data.entityType = entityType;
      if (entityId)   data.entityId   = entityId;

      // Build scheduledAt from dueDate + scheduledTime if time was provided
      if (scheduledTime) {
        data.scheduledAt = `${dueDate}T${scheduledTime}:00`;
      }

      await activitiesApi.create(data);
      showSuccess('Actividad creada');
      onCreated?.();
      onClose();
    } catch {
      showError('Error al crear la actividad');
    } finally {
      setIsSubmitting(false);
    }
  };

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
                  <div className="flex h-full flex-col overflow-y-auto bg-white shadow-xl">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-4">
                      <div>
                        <Dialog.Title className="text-base font-semibold text-zinc-900">
                          Nueva actividad
                        </Dialog.Title>
                        {entityName && (
                          <p className="mt-0.5 text-xs text-zinc-500">
                            Vinculada a: {entityName}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
                        aria-label="Cerrar"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>

                    {/* Form */}
                    <form
                      onSubmit={handleSubmit}
                      className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-6"
                    >
                      {/* Activity type chip grid */}
                      <fieldset>
                        <legend className="mb-2 text-sm font-medium text-zinc-700">
                          Tipo de actividad
                        </legend>
                        {typesLoading ? (
                          <p className="text-xs text-zinc-400">Cargando tipos...</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {displayTypes.map((t) => {
                              const isSelected = tipoCodigo === t.code;
                              return (
                                <button
                                  key={t.code}
                                  type="button"
                                  onClick={() => setTipoCodigo(t.code)}
                                  className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                    isSelected
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                                  }`}
                                >
                                  {'isFavorite' in t && t.isFavorite && !isSelected
                                    ? `${t.label} *`
                                    : t.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </fieldset>

                      {/* Due date */}
                      <div>
                        <label
                          htmlFor="activity-due-date"
                          className="mb-1.5 block text-sm font-medium text-zinc-700"
                        >
                          Fecha de vencimiento
                        </label>
                        <input
                          id="activity-due-date"
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          required
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          style={{ minHeight: '44px' }}
                        />
                      </div>

                      {/* Optional time */}
                      <div>
                        <label
                          htmlFor="activity-time"
                          className="mb-1.5 block text-sm font-medium text-zinc-700"
                        >
                          Hora (opcional)
                        </label>
                        <input
                          id="activity-time"
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          style={{ minHeight: '44px' }}
                        />
                      </div>

                      {/* Notes */}
                      <div>
                        <label
                          htmlFor="activity-notes"
                          className="mb-1.5 block text-sm font-medium text-zinc-700"
                        >
                          Notas (opcional)
                        </label>
                        <textarea
                          id="activity-notes"
                          rows={3}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Agrega contexto o instrucciones..."
                          className="w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      {/* Spacer so button stays at bottom */}
                      <div className="flex-1" />

                      {/* Submit */}
                      <button
                        type="submit"
                        disabled={isSubmitting || !tipoCodigo}
                        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                        style={{ minHeight: '44px' }}
                      >
                        {isSubmitting ? 'Guardando...' : 'Crear actividad'}
                      </button>
                    </form>
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
