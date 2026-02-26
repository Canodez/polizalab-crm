'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { PlusIcon } from '@heroicons/react/24/outline';
import { activitiesApi, Activity, ActivityStatus, EntityType } from '@/lib/api/activitiesApi';
import CreateActivityDrawer from './CreateActivityDrawer';

interface Props {
  entityType: EntityType;
  entityId: string;
  entityName?: string;
}

const tipoLabels: Record<string, string> = {
  CONTACTO_INICIAL:           'Contacto inicial',
  LLAMADA:                    'Llamada',
  WHATSAPP:                   'WhatsApp',
  REUNION:                    'Reunión',
  SEGUIMIENTO_COTIZACION:     'Seguimiento de cotización',
  SOLICITAR_DOCUMENTOS:       'Solicitar documentos',
  CONFIRMAR_PAGO:             'Confirmar pago',
  RENOVACION_PRIMER_CONTACTO: 'Primer contacto de renovación',
  RENOVACION_SEGUIMIENTO:     'Seguimiento de renovación',
  TAREA_INTERNA:              'Tarea interna',
};

const dotColors: Record<ActivityStatus, string> = {
  HECHA:     'bg-green-500',
  PENDIENTE: 'bg-amber-500',
  CANCELADA: 'bg-zinc-300',
};

function formatActivityDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-MX', {
      day:   'numeric',
      month: 'short',
      year:  'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function ActivityTimeline({ entityType, entityId, entityName }: Props) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await activitiesApi.getByEntity(entityType, entityId);
      // Newest first — sort by dueDate descending
      const sorted = [...res.activities].sort(
        (a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()
      );
      setActivities(sorted);
    } catch {
      setActivities([]);
    } finally {
      setIsLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Actividades</h3>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
          style={{ minHeight: '32px' }}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Crear actividad
        </button>
      </div>

      {/* Timeline body */}
      {isLoading ? (
        <p className="text-sm text-zinc-400 italic">Cargando actividades...</p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-zinc-400 italic">No hay actividades registradas.</p>
      ) : (
        <div className="relative pl-6">
          {activities.map((activity, index) => {
            const isLast     = index === activities.length - 1;
            const label      = activity.tipoLabel ?? tipoLabels[activity.tipoCodigo] ?? activity.tipoCodigo;
            const dotColor   = dotColors[activity.status];
            const dateLabel  = formatActivityDate(activity.dueDate);

            return (
              <div key={activity.activityId} className="relative pb-4">
                {/* Vertical connector line — skip on last item */}
                {!isLast && (
                  <div className="absolute left-[-16px] top-6 bottom-0 w-px bg-zinc-200" />
                )}

                {/* Status dot */}
                <div
                  className={`absolute left-[-20px] top-1 h-3 w-3 rounded-full border-2 border-white ${dotColor}`}
                />

                {/* Content */}
                <div>
                  <Link
                    href={`/actividades/${activity.activityId}`}
                    className="group flex items-start gap-1"
                  >
                    <p className="text-sm font-medium text-zinc-900 group-hover:text-blue-700 transition-colors">
                      {label}
                    </p>
                  </Link>
                  <p className="text-xs text-zinc-500">{dateLabel}</p>
                  {activity.notes && (
                    <p className="mt-0.5 truncate text-xs text-zinc-500">{activity.notes}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create drawer */}
      <CreateActivityDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        entityType={entityType}
        entityId={entityId}
        entityName={entityName}
        onCreated={load}
      />
    </>
  );
}
