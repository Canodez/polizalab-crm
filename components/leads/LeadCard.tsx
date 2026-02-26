'use client';

import { isToday, isTomorrow, parseISO, format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  PhoneIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';
import { Lead, ProductInterest, LeadSource } from '@/lib/api/leadsApi';
import LeadStatusBadge from './LeadStatusBadge';

interface Props {
  lead: Lead;
  onClick: (leadId: string) => void;
  onConvert?: (leadId: string) => void;
}

const productLabels: Record<ProductInterest, string> = {
  AUTO: 'Auto',
  VIDA: 'Vida',
  GMM: 'GMM',
  HOGAR: 'Hogar',
  PYME: 'PyME',
  OTRO: 'Otro',
};

const sourceLabels: Record<LeadSource, string> = {
  WHATSAPP: 'WhatsApp',
  REFERIDO: 'Referido',
  WEB: 'Web',
  FACEBOOK: 'Facebook',
  EVENTO: 'Evento',
  OTRO: 'Otro',
};

function getInitials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

function formatNextAction(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return 'Hoy';
    if (isTomorrow(d)) return 'Manana';
    return format(d, "d MMM yyyy", { locale: es });
  } catch {
    return dateStr;
  }
}

export default function LeadCard({ lead, onClick, onConvert }: Props) {
  const initials = getInitials(lead.fullName);
  const canConvert = lead.status !== 'WON' && !lead.convertedClientId;

  const handleConvertClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onConvert?.(lead.leadId);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(lead.leadId)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(lead.leadId); }}
      className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm ring-1 ring-transparent transition-all duration-150 hover:ring-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100">
            <span className="text-xs font-bold text-indigo-700">{initials}</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-900">{lead.fullName}</p>
            <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
              <PhoneIcon className="h-3 w-3 flex-shrink-0 text-zinc-400" />
              <p className="truncate text-xs text-zinc-500">{lead.phone}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <LeadStatusBadge status={lead.status} />
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
            {productLabels[lead.productInterest]}
          </span>
        </div>
      </div>

      {/* Next action + source */}
      <div className="mt-3 space-y-1">
        {lead.nextActionAt && (
          <div className="flex items-center gap-1.5">
            <CalendarDaysIcon className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
            <p className="text-xs text-zinc-500">
              Prox. accion:{' '}
              <span className="font-medium text-zinc-700">
                {formatNextAction(lead.nextActionAt)}
              </span>
            </p>
          </div>
        )}
        {lead.source && (
          <p className="text-xs text-zinc-400">
            Origen: {sourceLabels[lead.source]}
          </p>
        )}
      </div>

      {/* Convert quick action */}
      {canConvert && onConvert && (
        <div className="mt-3 border-t border-zinc-100 pt-3">
          <button
            onClick={handleConvertClick}
            className="rounded-md bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
          >
            Convertir a cliente
          </button>
        </div>
      )}

      {lead.convertedClientId && (
        <div className="mt-3 border-t border-zinc-100 pt-3">
          <span className="text-xs text-green-600 font-medium">Cliente convertido</span>
        </div>
      )}
    </div>
  );
}
