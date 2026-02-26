'use client';

import { useState } from 'react';
import { XCircleIcon } from '@heroicons/react/24/outline';
import { LostReason } from '@/lib/api/opportunitiesApi';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: LostReason, notes?: string) => Promise<void>;
}

const LOST_REASONS: { value: LostReason; label: string }[] = [
  { value: 'PRECIO', label: 'Precio' },
  { value: 'COBERTURA', label: 'Cobertura' },
  { value: 'COMPETENCIA', label: 'Competencia' },
  { value: 'SIN_RESPUESTA', label: 'Sin respuesta' },
  { value: 'CAMBIO_PLANES', label: 'Cambio de planes' },
  { value: 'OTRO', label: 'Otro' },
];

export default function CloseLostModal({ isOpen, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState<LostReason | ''>('');
  const [notes, setNotes] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [reasonError, setReasonError] = useState('');

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!reason) {
      setReasonError('Selecciona el motivo de perdida');
      return;
    }
    setReasonError('');
    setIsConfirming(true);
    try {
      await onConfirm(reason as LostReason, notes.trim() || undefined);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleClose = () => {
    if (isConfirming) return;
    setReason('');
    setNotes('');
    setReasonError('');
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
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
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <XCircleIcon className="h-7 w-7 text-red-600" />
          </div>
        </div>

        {/* Title */}
        <h2 className="mb-1 text-center text-lg font-semibold text-zinc-900">
          Cerrar como perdida
        </h2>
        <p className="mb-5 text-center text-sm text-zinc-500">
          Selecciona el motivo por el que se perdio esta oportunidad.
        </p>

        {/* Reason chips */}
        <div className="mb-1">
          <p className="mb-2 text-xs font-medium text-zinc-700">
            Motivo <span className="text-red-500">*</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {LOST_REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => {
                  setReason(r.value);
                  setReasonError('');
                }}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                  reason === r.value
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
                style={{ minHeight: '44px' }}
              >
                {r.label}
              </button>
            ))}
          </div>
          {reasonError && (
            <p className="mt-1.5 text-xs text-red-600">{reasonError}</p>
          )}
        </div>

        {/* Notes */}
        <div className="mt-4 mb-5">
          <label className="mb-1 block text-xs font-medium text-zinc-700">
            Notas adicionales (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Detalla el motivo o contexto..."
            rows={2}
            className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleConfirm}
            disabled={isConfirming}
            className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700 disabled:bg-red-300 transition-colors"
            style={{ minHeight: '44px' }}
          >
            {isConfirming ? 'Cerrando...' : 'Cerrar como perdida'}
          </button>
          <button
            onClick={handleClose}
            disabled={isConfirming}
            className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
            style={{ minHeight: '44px' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
