'use client';

import { ActivityStatus } from '@/lib/api/activitiesApi';

interface Props {
  status: ActivityStatus;
  size?: 'sm' | 'md';
}

const config: Record<ActivityStatus, { label: string; bg: string; text: string }> = {
  PENDIENTE: { label: 'Pendiente', bg: 'bg-amber-100', text: 'text-amber-700' },
  HECHA:     { label: 'Hecha',     bg: 'bg-green-100', text: 'text-green-700' },
  CANCELADA: { label: 'Cancelada', bg: 'bg-zinc-100',  text: 'text-zinc-500'  },
};

export default function ActivityStatusBadge({ status, size = 'sm' }: Props) {
  const c = config[status] ?? config.PENDIENTE;
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${c.bg} ${c.text} ${
        size === 'md' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-xs'
      }`}
    >
      {c.label}
    </span>
  );
}
