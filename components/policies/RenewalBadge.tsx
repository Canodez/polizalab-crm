import { PolicyStatus } from '@/lib/api/policiesApi';

interface Props {
  policyStatus?: PolicyStatus | string;
  renewalStatus?: string;
}

const BADGE_CONFIG: Record<string, { label: string; className: string }> = {
  // Processing states (animated pulse)
  CREATED:      { label: 'Procesando', className: 'bg-zinc-100 text-zinc-600 animate-pulse' },
  UPLOADED:     { label: 'Procesando', className: 'bg-zinc-100 text-zinc-600 animate-pulse' },
  PROCESSING:   { label: 'Procesando', className: 'bg-zinc-100 text-zinc-600 animate-pulse' },
  // Terminal / review states
  FAILED:       { label: 'Error',      className: 'bg-red-100 text-red-700' },
  VERIFIED:     { label: 'Verificada', className: 'bg-green-100 text-green-700' },
  NEEDS_REVIEW: { label: 'Revisar',   className: 'bg-yellow-100 text-yellow-700' },
  // Renewal statuses (shown when status=EXTRACTED or no policyStatus override)
  OVERDUE:      { label: 'Vencida',   className: 'bg-red-100 text-red-700' },
  '30_DAYS':    { label: '30 días',   className: 'bg-orange-100 text-orange-700' },
  '60_DAYS':    { label: '60 días',   className: 'bg-amber-100 text-amber-700' },
  '90_DAYS':    { label: '90 días',   className: 'bg-blue-100 text-blue-700' },
  NOT_URGENT:   { label: 'Al día',    className: 'bg-green-100 text-green-700' },
};

export default function RenewalBadge({ policyStatus, renewalStatus }: Props) {
  let config: { label: string; className: string } | undefined;

  // policyStatus takes priority, except for EXTRACTED which falls through to renewalStatus
  if (policyStatus && policyStatus !== 'EXTRACTED') {
    config = BADGE_CONFIG[policyStatus];
  }

  // Fall through to renewalStatus for EXTRACTED or when policyStatus has no badge config
  if (!config && renewalStatus) {
    config = BADGE_CONFIG[renewalStatus];
  }

  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
