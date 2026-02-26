'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { PlusIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';
import { Quote, AddQuoteData } from '@/lib/api/opportunitiesApi';

interface Props {
  quotes: Quote[];
  onAddQuote: (data: AddQuoteData) => Promise<void>;
}

function formatCurrency(amount: number): string {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toLocaleString('es-MX')}`;
  }
}

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "d 'de' MMMM yyyy", { locale: es });
  } catch {
    return dateStr;
  }
}

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const inputErrorClass =
  'w-full rounded-lg border border-red-400 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500';

interface AddFormErrors {
  insurer?: string;
  premium?: string;
}

export default function QuotesList({ quotes, onAddQuote }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [insurer, setInsurer] = useState('');
  const [premium, setPremium] = useState('');
  const [terms, setTerms] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<AddFormErrors>({});

  const validate = (): AddFormErrors => {
    const e: AddFormErrors = {};
    if (!insurer.trim()) e.insurer = 'La aseguradora es requerida';
    const val = parseFloat(premium);
    if (!premium.trim() || isNaN(val) || val <= 0) {
      e.premium = 'Ingresa una prima valida mayor a 0';
    }
    return e;
  };

  const handleSubmit = async () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setIsSubmitting(true);
    try {
      await onAddQuote({
        insurer: insurer.trim(),
        premium: parseFloat(premium),
        terms: terms.trim() || undefined,
      });
      setInsurer('');
      setPremium('');
      setTerms('');
      setShowForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setInsurer('');
    setPremium('');
    setTerms('');
    setErrors({});
    setShowForm(false);
  };

  return (
    <div>
      {/* Quote list */}
      {quotes.length === 0 && !showForm && (
        <p className="text-sm text-zinc-400 italic mb-4">
          No hay cotizaciones registradas aun.
        </p>
      )}

      {quotes.length > 0 && (
        <div className="mb-4 space-y-3">
          {quotes.map((quote) => (
            <div
              key={quote.id}
              className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <BuildingOfficeIcon className="h-4 w-4 flex-shrink-0 text-zinc-400" />
                  <p className="text-sm font-semibold text-zinc-900 truncate">
                    {quote.insurer}
                  </p>
                </div>
                <p className="flex-shrink-0 text-sm font-bold text-green-700">
                  {formatCurrency(quote.premium)}
                </p>
              </div>
              {quote.terms && (
                <p className="mt-1 text-xs text-zinc-500 whitespace-pre-wrap">
                  {quote.terms}
                </p>
              )}
              <p className="mt-1 text-xs text-zinc-400">
                {formatDate(quote.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Add quote form */}
      {showForm ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <h4 className="mb-3 text-sm font-semibold text-zinc-700">
            Agregar cotizacion
          </h4>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Aseguradora <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={insurer}
                onChange={(e) => setInsurer(e.target.value)}
                placeholder="Ej. GNP, AXA, Qualitas..."
                className={errors.insurer ? inputErrorClass : inputClass}
                style={{ minHeight: '44px' }}
              />
              {errors.insurer && (
                <p className="mt-1 text-xs text-red-600">{errors.insurer}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Prima anual (MXN) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
                placeholder="Ej. 12500"
                min="0"
                step="0.01"
                className={errors.premium ? inputErrorClass : inputClass}
                style={{ minHeight: '44px' }}
              />
              {errors.premium && (
                <p className="mt-1 text-xs text-red-600">{errors.premium}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Condiciones / notas
              </label>
              <textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="Cobertura, deducible, vigencia..."
                rows={2}
                className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
              style={{ minHeight: '44px' }}
            >
              {isSubmitting ? 'Guardando...' : 'Agregar'}
            </button>
            <button
              onClick={handleCancel}
              disabled={isSubmitting}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              style={{ minHeight: '44px' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          style={{ minHeight: '44px' }}
        >
          <PlusIcon className="h-4 w-4" />
          Agregar cotizacion
        </button>
      )}
    </div>
  );
}
