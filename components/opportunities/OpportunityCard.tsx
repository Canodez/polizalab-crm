'use client';

import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Opportunity, OpportunityProduct } from '@/lib/api/opportunitiesApi';
import OpportunityStageBadge from './OpportunityStageBadge';

interface Props {
  opportunity: Opportunity;
}

const productLabels: Record<OpportunityProduct, string> = {
  AUTO: 'Auto',
  VIDA: 'Vida',
  GMM: 'GMM',
  HOGAR: 'Hogar',
  PYME: 'PyME',
  OTRO: 'Otro',
};

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "d MMM yyyy", { locale: es });
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: number, currency = 'MXN'): string {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toLocaleString('es-MX')}`;
  }
}

export default function OpportunityCard({ opportunity }: Props) {
  const router = useRouter();

  const displayName = opportunity.entityName || opportunity.opportunityId;
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w: string) => w.charAt(0).toUpperCase())
    .join('');

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/oportunidades/${opportunity.opportunityId}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          router.push(`/oportunidades/${opportunity.opportunityId}`);
        }
      }}
      className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm ring-1 ring-transparent transition-all duration-150 hover:ring-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
            <span className="text-xs font-bold text-blue-700">{initials || '?'}</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-900">
              {opportunity.entityName || 'Sin nombre'}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {productLabels[opportunity.product]}
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <OpportunityStageBadge stage={opportunity.stage} />
        </div>
      </div>

      {/* Details */}
      <div className="mt-3 space-y-1">
        {opportunity.estimatedPremium != null && (
          <p className="text-xs text-zinc-500">
            Prima estimada:{' '}
            <span className="font-medium text-zinc-700">
              {formatCurrency(opportunity.estimatedPremium, opportunity.currency ?? 'MXN')}
            </span>
          </p>
        )}
        <p className="text-xs text-zinc-400">
          Creada: {formatDate(opportunity.createdAt)}
        </p>
      </div>
    </div>
  );
}
