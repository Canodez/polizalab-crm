import { ComponentType } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  TruckIcon,
  HeartIcon,
  BeakerIcon,
  HomeIcon,
  ScaleIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { BuildingOffice2Icon } from '@heroicons/react/24/outline';
import { Policy } from '@/lib/api/policiesApi';
import { getPolicyTypeConfig } from '@/lib/constants/policyTypes';
import RenewalBadge from './RenewalBadge';

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  TruckIcon,
  HeartIcon,
  BeakerIcon,
  HomeIcon,
  BuildingOffice2Icon,
  ScaleIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
};

interface Props {
  policy: Policy;
  onClick: (policyId: string) => void;
}

function formatDate(dateStr?: string): string | null {
  if (!dateStr) return null;
  try {
    return format(new Date(dateStr), 'd MMM yyyy', { locale: es });
  } catch {
    return null;
  }
}

export default function PolicyCard({ policy, onClick }: Props) {
  const typeConfig = policy.policyType
    ? getPolicyTypeConfig(policy.policyType)
    : undefined;

  const IconComponent = typeConfig ? ICON_MAP[typeConfig.iconName] : undefined;
  const iconColor = typeConfig?.color ?? 'bg-zinc-100';
  const iconTextColor = typeConfig?.textColor ?? 'text-zinc-600';
  const typeLabel = policy.policyType || policy.sourceFileName || 'Tipo desconocido';

  const clientName = policy.insuredName || 'Sin nombre';
  const dateLabel = formatDate(policy.fechaRenovacion || policy.endDate);

  return (
    <button
      onClick={() => onClick(policy.policyId)}
      className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm ring-1 ring-transparent transition-all duration-150 hover:ring-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${iconColor}`}>
            {IconComponent ? (
              <IconComponent className={`h-5 w-5 ${iconTextColor}`} />
            ) : (
              <span className="text-xs font-bold text-zinc-500">?</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-zinc-500">{typeLabel}</p>
            {policy.insurer && (
              <p className="truncate text-xs text-zinc-400">{policy.insurer}</p>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">
          <RenewalBadge policyStatus={policy.status} renewalStatus={policy.renewalStatus} />
        </div>
      </div>

      {/* Body */}
      <div className="mt-3 space-y-1 min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-900">{clientName}</p>
        {policy.policyNumber && (
          <p className="truncate text-xs text-zinc-500">Póliza: {policy.policyNumber}</p>
        )}
        {dateLabel && (
          <p className="text-xs text-zinc-400">Vence: {dateLabel}</p>
        )}
      </div>
    </button>
  );
}
