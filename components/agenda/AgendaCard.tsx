'use client';

import Link from 'next/link';
import { Activity } from '@/lib/api/activitiesApi';

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

// Border color per tipo for normal (non-compact) cards
const tipoBorderColor: Record<string, string> = {
  CONTACTO_INICIAL:           'border-l-violet-400',
  LLAMADA:                    'border-l-blue-400',
  WHATSAPP:                   'border-l-green-500',
  REUNION:                    'border-l-amber-400',
  SEGUIMIENTO_COTIZACION:     'border-l-orange-400',
  SOLICITAR_DOCUMENTOS:       'border-l-sky-400',
  CONFIRMAR_PAGO:             'border-l-emerald-500',
  RENOVACION_PRIMER_CONTACTO: 'border-l-pink-400',
  RENOVACION_SEGUIMIENTO:     'border-l-rose-400',
  TAREA_INTERNA:              'border-l-zinc-400',
};

// Compact card background tints per tipo
const tipoCompactBg: Record<string, string> = {
  CONTACTO_INICIAL:           'bg-violet-50 border-l-violet-400 hover:bg-violet-100',
  LLAMADA:                    'bg-blue-50 border-l-blue-400 hover:bg-blue-100',
  WHATSAPP:                   'bg-green-50 border-l-green-500 hover:bg-green-100',
  REUNION:                    'bg-amber-50 border-l-amber-400 hover:bg-amber-100',
  SEGUIMIENTO_COTIZACION:     'bg-orange-50 border-l-orange-400 hover:bg-orange-100',
  SOLICITAR_DOCUMENTOS:       'bg-sky-50 border-l-sky-400 hover:bg-sky-100',
  CONFIRMAR_PAGO:             'bg-emerald-50 border-l-emerald-500 hover:bg-emerald-100',
  RENOVACION_PRIMER_CONTACTO: 'bg-pink-50 border-l-pink-400 hover:bg-pink-100',
  RENOVACION_SEGUIMIENTO:     'bg-rose-50 border-l-rose-400 hover:bg-rose-100',
  TAREA_INTERNA:              'bg-zinc-100 border-l-zinc-400 hover:bg-zinc-200',
};

function formatTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

interface Props {
  activity: Activity;
  compact?: boolean;
}

export default function AgendaCard({ activity, compact }: Props) {
  const label =
    activity.tipoLabel ?? tipoLabels[activity.tipoCodigo] ?? activity.tipoCodigo;
  const time = formatTime(activity.scheduledAt || activity.dueDate);
  const borderColor = tipoBorderColor[activity.tipoCodigo] ?? 'border-l-zinc-400';
  const compactStyle =
    tipoCompactBg[activity.tipoCodigo] ??
    'bg-blue-50 border-l-blue-400 hover:bg-blue-100';

  if (compact) {
    return (
      <Link
        href={`/actividades/${activity.activityId}`}
        className={`block rounded border-l-2 px-2 py-1 text-xs text-zinc-700 transition-colors truncate ${compactStyle}`}
      >
        {time && <span className="font-medium">{time} </span>}
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={`/actividades/${activity.activityId}`}
      className={`flex items-center gap-2 rounded-lg border border-zinc-200 border-l-4 bg-white px-3 py-2 hover:bg-zinc-50 transition-colors ${borderColor}`}
    >
      {time && (
        <span className="text-xs font-semibold text-blue-600 w-10 flex-shrink-0">
          {time}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-900 truncate">{label}</p>
        {activity.entityName && (
          <p className="text-xs text-zinc-500 truncate">{activity.entityName}</p>
        )}
      </div>
    </Link>
  );
}
