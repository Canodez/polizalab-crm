'use client';

import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { Activity } from '@/lib/api/activitiesApi';

interface Props {
  activities: Activity[];
  dateLabel: string;
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

/**
 * Format a JS Date to ICS DTSTART/DTEND format: YYYYMMDDTHHmmssZ
 */
function toIcsDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}` +
    `${pad(date.getUTCMonth() + 1)}` +
    `${pad(date.getUTCDate())}` +
    `T` +
    `${pad(date.getUTCHours())}` +
    `${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}` +
    `Z`
  );
}

/**
 * Format a JS Date to ICS DATE-only format: YYYYMMDD (for all-day events)
 */
function toIcsDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}` +
    `${pad(date.getMonth() + 1)}` +
    `${pad(date.getDate())}`
  );
}

/**
 * Escape special characters in ICS text values per RFC 5545
 */
function escapeIcsText(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/**
 * Generate a simple UID for each VEVENT
 */
function generateUid(activityId: string): string {
  return `${activityId}@polizalab.crm`;
}

function buildIcsContent(activities: Activity[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PolizaLab CRM//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const activity of activities) {
    const label =
      activity.tipoLabel ?? tipoLabels[activity.tipoCodigo] ?? activity.tipoCodigo;
    const summary = escapeIcsText(label);
    const description = activity.notes ? escapeIcsText(activity.notes) : '';
    const uid = generateUid(activity.activityId);

    const rawStart = activity.scheduledAt || activity.dueDate;
    const isTimedEvent = !!activity.scheduledAt;

    if (!rawStart) continue;

    const startDate = new Date(rawStart);
    if (isNaN(startDate.getTime())) continue;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`SUMMARY:${summary}`);

    if (isTimedEvent) {
      // Timed event: use DTSTART with time, DTEND = start + 1 hour
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      lines.push(`DTSTART:${toIcsDateTime(startDate)}`);
      lines.push(`DTEND:${toIcsDateTime(endDate)}`);
    } else {
      // All-day event: use DATE value type, DTEND = next day
      const nextDay = new Date(startDate);
      nextDay.setDate(nextDay.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(startDate)}`);
      lines.push(`DTEND;VALUE=DATE:${toIcsDate(nextDay)}`);
    }

    if (description) {
      lines.push(`DESCRIPTION:${description}`);
    }

    if (activity.entityName) {
      lines.push(`LOCATION:${escapeIcsText(activity.entityName)}`);
    }

    // DTSTAMP = now (required by RFC 5545)
    lines.push(`DTSTAMP:${toIcsDateTime(new Date())}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  // ICS lines must be folded at 75 octets — keep simple for now
  return lines.join('\r\n');
}

function sanitizeFilename(label: string): string {
  return label.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40);
}

export default function IcsExportButton({ activities, dateLabel }: Props) {
  const handleExport = () => {
    if (activities.length === 0) return;

    const icsContent = buildIcsContent(activities);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `agenda_${sanitizeFilename(dateLabel)}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      disabled={activities.length === 0}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      title={activities.length === 0 ? 'Sin actividades para exportar' : 'Exportar como calendario .ics'}
    >
      <ArrowDownTrayIcon className="h-3.5 w-3.5" />
      Exportar .ics
    </button>
  );
}
