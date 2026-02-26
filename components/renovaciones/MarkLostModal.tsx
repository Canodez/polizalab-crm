'use client';

import { useState } from 'react';
import { XMarkIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { policiesApi } from '@/lib/api/policiesApi';
import { showSuccess, showError } from '@/lib/toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  policyId: string;
  onConfirm: () => void;
}

interface ReasonChip {
  value: string;
  label: string;
}

const REASONS: ReasonChip[] = [
  { value: 'PRECIO', label: 'Precio' },
  { value: 'COBERTURA', label: 'Cobertura' },
  { value: 'COMPETENCIA', label: 'Competencia' },
  { value: 'SIN_RESPUESTA', label: 'Sin respuesta' },
  { value: 'CAMBIO_PLANES', label: 'Cambio de planes' },
  { value: 'OTRO', label: 'Otro' },
];

export default function MarkLostModal({ isOpen, onClose, policyId, onConfirm }: Props) {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!selectedReason) return;
    setIsSubmitting(true);
    try {
      await policiesApi.markRenewalLost(policyId, selectedReason);
      showSuccess('Renovacion marcada como perdida');
      setSelectedReason('');
      onConfirm();
      onClose();
    } catch {
      showError('No se pudo registrar la renovacion perdida');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setSelectedReason('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <XCircleIcon className="h-5 w-5 text-red-500" />
            <h2 className="text-base font-semibold text-zinc-900">Renovacion perdida</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-40"
            aria-label="Cerrar"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-zinc-600">
            Selecciona el motivo por el que se perdio esta renovacion. Esta accion es permanente.
          </p>

          <div>
            <p className="mb-2.5 text-sm font-medium text-zinc-700">Motivo de perdida</p>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((reason) => {
                const isSelected = selectedReason === reason.value;
                return (
                  <button
                    key={reason.value}
                    onClick={() => setSelectedReason(reason.value)}
                    disabled={isSubmitting}
                    className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                      isSelected
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    {reason.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4">
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
            style={{ minHeight: '44px' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedReason || isSubmitting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
            style={{ minHeight: '44px' }}
          >
            {isSubmitting ? 'Guardando...' : 'Confirmar perdida'}
          </button>
        </div>
      </div>
    </div>
  );
}
