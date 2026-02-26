'use client';

import { useState } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/outline';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  opportunityId?: string;
}

export default function CloseWonModal({ isOpen, onClose, onConfirm, opportunityId }: Props) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      setIsConfirming(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isConfirming) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4 pb-6 sm:pb-0"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        {/* Icon */}
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <CheckCircleIcon className="h-7 w-7 text-green-600" />
          </div>
        </div>

        {/* Title */}
        <h2 className="mb-2 text-center text-lg font-semibold text-zinc-900">
          Marcar como ganada
        </h2>
        <p className="mb-6 text-center text-sm text-zinc-500">
          Esta oportunidad se marcara como ganada. Podras subir la poliza correspondiente a continuacion.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleConfirm}
            disabled={isConfirming}
            className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:bg-green-300 transition-colors"
            style={{ minHeight: '44px' }}
          >
            {isConfirming ? 'Cerrando...' : 'Si, cerrar como ganada'}
          </button>
          <button
            onClick={onClose}
            disabled={isConfirming}
            className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
            style={{ minHeight: '44px' }}
          >
            Cancelar
          </button>
        </div>

        {/* CTA note */}
        <p className="mt-4 text-center text-xs text-zinc-400">
          Despues de confirmar podras vincular la poliza correspondiente.
        </p>
      </div>
    </div>
  );
}
