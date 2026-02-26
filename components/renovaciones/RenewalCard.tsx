'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDaysIcon,
  BuildingOffice2Icon,
  DocumentTextIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { Policy } from '@/lib/api/policiesApi';
import RenewalCountdownBadge from './RenewalCountdownBadge';
import MarkRenewedModal from './MarkRenewedModal';
import MarkLostModal from './MarkLostModal';

interface Props {
  policy: Policy;
  onUpdate: () => void;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount?: number, currency?: string): string {
  if (amount == null) return '';
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: currency || 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || 'MXN'} ${amount}`;
  }
}

export default function RenewalCard({ policy, onUpdate }: Props) {
  const router = useRouter();
  const [showRenewedModal, setShowRenewedModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);

  const renewalDate = policy.fechaRenovacion
    ? formatDate(policy.fechaRenovacion)
    : null;

  const premium = formatCurrency(policy.premiumTotal, policy.currency);

  return (
    <>
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Policy number + type */}
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {policy.policyNumber && (
                <span className="flex items-center gap-1 text-sm font-semibold text-zinc-900">
                  <DocumentTextIcon className="h-4 w-4 text-zinc-400" />
                  {policy.policyNumber}
                </span>
              )}
              {policy.policyType && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                  {policy.policyType}
                </span>
              )}
            </div>

            {/* Insured name */}
            {policy.insuredName && (
              <p className="truncate text-sm text-zinc-700 font-medium">{policy.insuredName}</p>
            )}
          </div>

          {/* Countdown badge */}
          {policy.renewalStatus && (
            <div className="flex-shrink-0">
              <RenewalCountdownBadge
                renewalStatus={policy.renewalStatus}
                fechaRenovacion={policy.fechaRenovacion}
              />
            </div>
          )}
        </div>

        {/* Detail row */}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
          {policy.insurer && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <BuildingOffice2Icon className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
              <span>{policy.insurer}</span>
            </div>
          )}
          {premium && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <CurrencyDollarIcon className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
              <span>{premium}</span>
            </div>
          )}
          {renewalDate && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <CalendarDaysIcon className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
              <span>Vence: {renewalDate}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
          <button
            onClick={() =>
              router.push(
                `/actividades/nueva?entityType=POLICY&entityId=${policy.policyId}`
              )
            }
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            style={{ minHeight: '36px' }}
          >
            Crear actividad
          </button>
          <button
            onClick={() => setShowRenewedModal(true)}
            className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
            style={{ minHeight: '36px' }}
          >
            Marcar renovada
          </button>
          <button
            onClick={() => setShowLostModal(true)}
            className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
            style={{ minHeight: '36px' }}
          >
            Marcar perdida
          </button>
        </div>
      </div>

      <MarkRenewedModal
        isOpen={showRenewedModal}
        onClose={() => setShowRenewedModal(false)}
        policyId={policy.policyId}
        onConfirm={onUpdate}
      />

      <MarkLostModal
        isOpen={showLostModal}
        onClose={() => setShowLostModal(false)}
        policyId={policy.policyId}
        onConfirm={onUpdate}
      />
    </>
  );
}
