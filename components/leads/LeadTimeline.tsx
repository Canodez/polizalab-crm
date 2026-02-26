import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  PhoneIcon,
  ChatBubbleLeftEllipsisIcon,
  EnvelopeIcon,
  CalendarDaysIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { TimelineEntry, NextActionType } from '@/lib/api/leadsApi';

interface Props {
  entries: TimelineEntry[];
}

const typeConfig: Record<
  NextActionType,
  { label: string; Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; color: string; bg: string }
> = {
  CALL: {
    label: 'Llamada',
    Icon: PhoneIcon,
    color: 'text-blue-600',
    bg: 'bg-blue-100',
  },
  WHATSAPP: {
    label: 'WhatsApp',
    Icon: ChatBubbleLeftEllipsisIcon,
    color: 'text-green-600',
    bg: 'bg-green-100',
  },
  EMAIL: {
    label: 'Email',
    Icon: EnvelopeIcon,
    color: 'text-purple-600',
    bg: 'bg-purple-100',
  },
  MEETING: {
    label: 'Reunión',
    Icon: CalendarDaysIcon,
    color: 'text-amber-600',
    bg: 'bg-amber-100',
  },
  FOLLOWUP: {
    label: 'Seguimiento',
    Icon: ArrowPathIcon,
    color: 'text-zinc-600',
    bg: 'bg-zinc-100',
  },
};

function formatEntryDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "d 'de' MMMM yyyy, HH:mm", { locale: es });
  } catch {
    return dateStr;
  }
}

export default function LeadTimeline({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-zinc-400 italic">
        No hay registros de contacto aun.
      </p>
    );
  }

  // Show newest first
  const sorted = [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <ol className="relative">
      {sorted.map((entry, index) => {
        const config = typeConfig[entry.type] ?? typeConfig.FOLLOWUP;
        const Icon = config.Icon;
        const isLast = index === sorted.length - 1;

        return (
          <li key={entry.id} className="relative flex gap-4">
            {/* Vertical connector line */}
            {!isLast && (
              <div className="absolute left-4 top-9 bottom-0 w-0.5 bg-zinc-200" />
            )}

            {/* Icon */}
            <div
              className={`relative z-10 mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${config.bg}`}
            >
              <Icon className={`h-4 w-4 ${config.color}`} />
            </div>

            {/* Content */}
            <div className={`flex-1 pb-6 ${isLast ? 'pb-0' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-semibold ${config.color}`}>
                  {config.label}
                </span>
                <span className="text-xs text-zinc-400">
                  {formatEntryDate(entry.createdAt)}
                </span>
              </div>
              {entry.note && (
                <p className="mt-1 text-sm text-zinc-700 whitespace-pre-wrap">
                  {entry.note}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
