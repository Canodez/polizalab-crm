import { LeadStatus } from '@/lib/api/leadsApi';

interface Props {
  status: LeadStatus;
  size?: 'sm' | 'md';
}

const statusConfig: Record<LeadStatus, { label: string; className: string }> = {
  NEW: {
    label: 'Nuevo',
    className: 'bg-blue-100 text-blue-700',
  },
  CONTACTED: {
    label: 'Contactado',
    className: 'bg-amber-100 text-amber-700',
  },
  QUOTING: {
    label: 'Cotizando',
    className: 'bg-purple-100 text-purple-700',
  },
  WON: {
    label: 'Ganado',
    className: 'bg-green-100 text-green-700',
  },
  LOST: {
    label: 'Perdido',
    className: 'bg-zinc-100 text-zinc-500',
  },
};

export default function LeadStatusBadge({ status, size = 'sm' }: Props) {
  const config = statusConfig[status];
  const sizeClass = size === 'md' ? 'px-2.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${config.className}`}
    >
      {config.label}
    </span>
  );
}
