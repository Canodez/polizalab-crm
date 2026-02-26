'use client';

import Link from 'next/link';
import { Activity, EntityType } from '@/lib/api/activitiesApi';
import ActivityStatusBadge from './ActivityStatusBadge';
import ActivityQuickActions from './ActivityQuickActions';

interface Props {
  activity: Activity;
  onUpdate?: () => void;
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

interface DueDateInfo {
  label: string;
  isOverdue: boolean;
}

function formatDueDate(dateStr: string): DueDateInfo {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  const diff = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0) {
    const abs = Math.abs(diff);
    return { label: `Hace ${abs} día${abs > 1 ? 's' : ''}`, isOverdue: true };
  }
  if (diff === 0) return { label: 'Hoy', isOverdue: false };
  if (diff === 1) return { label: 'Mañana', isOverdue: false };

  return {
    label: due.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }),
    isOverdue: false,
  };
}

interface EntityLinkInfo {
  href: string;
  label: string;
}

function getEntityLink(activity: Activity): EntityLinkInfo | null {
  if (!activity.entityType || !activity.entityId) return null;

  const typeMap: Record<EntityType, { prefix: string; label: string }> = {
    LEAD:        { prefix: '/leads',        label: 'Lead'        },
    CLIENT:      { prefix: '/clients',      label: 'Cliente'     },
    OPPORTUNITY: { prefix: '/oportunidades', label: 'Oportunidad' },
  };

  const entityConfig = typeMap[activity.entityType];
  if (!entityConfig) return null;

  return {
    href:  `${entityConfig.prefix}/${activity.entityId}`,
    label: activity.entityName ?? entityConfig.label,
  };
}

export default function ActivityCard({ activity, onUpdate }: Props) {
  const tipoLabel =
    activity.tipoLabel ?? tipoLabels[activity.tipoCodigo] ?? activity.tipoCodigo;
  const dueInfo   = formatDueDate(activity.dueDate);
  const entityLink = getEntityLink(activity);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      {/* Top row: tipo + status badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/actividades/${activity.activityId}`}
            className="block"
          >
            <p className="truncate text-sm font-semibold text-zinc-900 hover:text-blue-700 transition-colors">
              {tipoLabel}
            </p>
          </Link>

          {/* Second row: entity link + due date */}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {entityLink && (
              <Link
                href={entityLink.href}
                className="max-w-[150px] truncate text-blue-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {entityLink.label}
              </Link>
            )}
            <span
              className={
                dueInfo.isOverdue
                  ? 'font-medium text-red-600'
                  : 'text-zinc-500'
              }
            >
              {dueInfo.label}
            </span>
          </div>

          {/* Notes snippet */}
          {activity.notes && (
            <p className="mt-1 truncate text-xs text-zinc-500">{activity.notes}</p>
          )}
        </div>

        <ActivityStatusBadge status={activity.status} />
      </div>

      {/* Quick actions — only for PENDIENTE and when onUpdate is provided */}
      {activity.status === 'PENDIENTE' && onUpdate && (
        <div className="mt-2 border-t border-zinc-100 pt-2">
          <ActivityQuickActions activity={activity} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}
