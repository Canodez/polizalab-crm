'use client';

interface Props {
  renewalStatus: string;
  fechaRenovacion?: string;
}

function daysUntil(dateStr: string): number {
  try {
    const renewal = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = renewal.getTime() - today.getTime();
    return Math.round(diff / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

const STATUS_CONFIG: Record<string, { bgClass: string; textClass: string }> = {
  OVERDUE: { bgClass: 'bg-red-100', textClass: 'text-red-700' },
  '30_DAYS': { bgClass: 'bg-orange-100', textClass: 'text-orange-700' },
  '60_DAYS': { bgClass: 'bg-amber-100', textClass: 'text-amber-700' },
  '90_DAYS': { bgClass: 'bg-green-100', textClass: 'text-green-700' },
};

export default function RenewalCountdownBadge({ renewalStatus, fechaRenovacion }: Props) {
  const config = STATUS_CONFIG[renewalStatus];
  if (!config) return null;

  let label: string;
  if (renewalStatus === 'OVERDUE') {
    label = 'Vencida';
  } else if (fechaRenovacion) {
    const days = daysUntil(fechaRenovacion);
    label = days <= 0 ? 'Vencida' : `${days} dias`;
  } else {
    // Fallback labels per status bucket
    const fallbacks: Record<string, string> = {
      '30_DAYS': '30 dias',
      '60_DAYS': '60 dias',
      '90_DAYS': '90 dias',
    };
    label = fallbacks[renewalStatus] ?? renewalStatus;
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bgClass} ${config.textClass}`}
    >
      {label}
    </span>
  );
}
