'use client';

import { useState } from 'react';
import { XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { policiesApi } from '@/lib/api/policiesApi';
import { showSuccess, showError } from '@/lib/toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  policyId: string;
  onConfirm: () => void;
}

export default function MarkRenewedModal({ isOpen, onClose, policyId, onConfirm }: Props) {
  const [newPolicyId, setNewPolicyId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await policiesApi.markRenewed(policyId, newPolicyId.trim() || undefined);
      showSuccess('Poliza marcada como renovada');
      setNewPolicyId('');
      onConfirm();
      onClose();
    } catch {
      showError('No se pudo marcar la poliza como renovada');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setNewPolicyId('');
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
            <CheckCircleIcon className="h-5 w-5 text-green-600" />
            <h2 className="text-base font-semibold text-zinc-900">Marcar como renovada</h2>
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
            Esta accion marcara la poliza como renovada y la retirara de la lista de renovaciones pendientes.
          </p>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">
              ID de la nueva poliza
              <span className="ml-1 font-normal text-zinc-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={newPolicyId}
              onChange={(e) => setNewPolicyId(e.target.value)}
              placeholder="Ej. abc123..."
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              style={{ minHeight: '44px' }}
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-zinc-400">
              Vincula esta poliza con la nueva póliza creada para el cliente.
            </p>
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
            disabled={isSubmitting}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
            style={{ minHeight: '44px' }}
          >
            {isSubmitting ? 'Guardando...' : 'Confirmar renovacion'}
          </button>
        </div>
      </div>
    </div>
  );
}
