'use client';

import { useState } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Policy, PatchPolicyData } from '@/lib/api/policiesApi';
import { POLICY_TYPES } from '@/lib/constants/policyTypes';

interface Props {
  policy: Policy;
  onConfirm: (data: PatchPolicyData) => void;
  isSaving: boolean;
}

function ConfidenceBar({ value }: { value?: number }) {
  if (value === undefined) return null;
  const pct = Math.round(value * 100);
  const color = value >= 0.75 ? 'bg-green-500' : value >= 0.5 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-500">{pct}%</span>
    </div>
  );
}

export default function ReviewPanel({ policy, onConfirm, isSaving }: Props) {
  const review = policy.needsReviewFields ?? [];
  const confidence = policy.fieldConfidence ?? {};

  const [policyNumber, setPolicyNumber] = useState(policy.policyNumber ?? '');
  const [insuredName, setInsuredName] = useState(policy.insuredName ?? '');
  const [startDate, setStartDate] = useState(policy.startDate ?? '');
  const [endDate, setEndDate] = useState(policy.endDate ?? '');
  const [insurer, setInsurer] = useState(policy.insurer ?? '');
  const [policyType, setPolicyType] = useState(policy.policyType ?? '');
  const [premiumTotal, setPremiumTotal] = useState(
    policy.premiumTotal !== undefined ? String(policy.premiumTotal) : '',
  );
  const [currency, setCurrency] = useState(policy.currency ?? '');

  const fieldBorderClass = (field: string) =>
    review.includes(field)
      ? 'border-yellow-400 focus:border-yellow-500 focus:ring-yellow-500'
      : 'border-zinc-300 focus:border-blue-500 focus:ring-blue-500';

  const labelColorClass = (field: string) => {
    if (review.includes(field)) return 'text-yellow-700';
    const conf = confidence[field];
    if (conf === undefined) return 'text-zinc-700';
    if (conf >= 0.75) return 'text-green-700';
    if (conf >= 0.5) return 'text-yellow-700';
    return 'text-red-700';
  };

  const ReviewChip = ({ field }: { field: string }) =>
    review.includes(field) ? (
      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
        Revisar
      </span>
    ) : null;

  const handleSubmit = () => {
    const data: PatchPolicyData = {
      policyNumber: policyNumber.trim() || undefined,
      insuredName: insuredName.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      insurer: insurer.trim() || undefined,
      policyType: policyType || undefined,
      premiumTotal: premiumTotal ? Number(premiumTotal) : undefined,
      currency: currency.trim() || undefined,
    };
    onConfirm(data);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-800 flex items-start gap-2">
        <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <span>
          Algunos campos requieren revisión. Verifica y corrige los valores antes de confirmar.
        </span>
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Número de póliza */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className={`text-sm font-medium ${labelColorClass('policyNumber')}`}>
              Número de póliza
            </label>
            <ReviewChip field="policyNumber" />
          </div>
          <input
            type="text"
            value={policyNumber}
            onChange={(e) => setPolicyNumber(e.target.value)}
            className={`w-full rounded-lg border px-4 py-3 text-zinc-900 focus:outline-none focus:ring-1 ${fieldBorderClass('policyNumber')}`}
            style={{ minHeight: '44px' }}
          />
          <ConfidenceBar value={confidence['policyNumber']} />
        </div>

        {/* Nombre del asegurado */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className={`text-sm font-medium ${labelColorClass('insuredName')}`}>
              Nombre del asegurado
            </label>
            <ReviewChip field="insuredName" />
          </div>
          <input
            type="text"
            value={insuredName}
            onChange={(e) => setInsuredName(e.target.value)}
            className={`w-full rounded-lg border px-4 py-3 text-zinc-900 focus:outline-none focus:ring-1 ${fieldBorderClass('insuredName')}`}
            style={{ minHeight: '44px' }}
          />
          <ConfidenceBar value={confidence['insuredName']} />
        </div>

        {/* Aseguradora */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className={`text-sm font-medium ${labelColorClass('insurer')}`}>
              Aseguradora
            </label>
            <ReviewChip field="insurer" />
          </div>
          <input
            type="text"
            value={insurer}
            onChange={(e) => setInsurer(e.target.value)}
            className={`w-full rounded-lg border px-4 py-3 text-zinc-900 focus:outline-none focus:ring-1 ${fieldBorderClass('insurer')}`}
            style={{ minHeight: '44px' }}
          />
          <ConfidenceBar value={confidence['insurer']} />
        </div>

        {/* Tipo de póliza */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Tipo de póliza</label>
          <select
            value={policyType}
            onChange={(e) => setPolicyType(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            style={{ minHeight: '44px' }}
          >
            <option value="">— Seleccionar —</option>
            {POLICY_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Fecha inicio */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className={`text-sm font-medium ${labelColorClass('startDate')}`}>
              Fecha de inicio
            </label>
            <ReviewChip field="startDate" />
          </div>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={`w-full rounded-lg border px-4 py-3 text-zinc-900 focus:outline-none focus:ring-1 ${fieldBorderClass('startDate')}`}
            style={{ minHeight: '44px' }}
          />
          <ConfidenceBar value={confidence['startDate']} />
        </div>

        {/* Fecha vencimiento */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className={`text-sm font-medium ${labelColorClass('endDate')}`}>
              Fecha de vencimiento
            </label>
            <ReviewChip field="endDate" />
          </div>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={`w-full rounded-lg border px-4 py-3 text-zinc-900 focus:outline-none focus:ring-1 ${fieldBorderClass('endDate')}`}
            style={{ minHeight: '44px' }}
          />
          <ConfidenceBar value={confidence['endDate']} />
        </div>

        {/* Prima total */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Prima total</label>
          <input
            type="number"
            value={premiumTotal}
            onChange={(e) => setPremiumTotal(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            style={{ minHeight: '44px' }}
          />
          <ConfidenceBar value={confidence['premiumTotal']} />
        </div>

        {/* Moneda */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Moneda</label>
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            style={{ minHeight: '44px' }}
          />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={isSaving}
        className="w-full rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
        style={{ minHeight: '44px' }}
      >
        {isSaving ? 'Guardando...' : 'Confirmar póliza'}
      </button>
    </div>
  );
}
