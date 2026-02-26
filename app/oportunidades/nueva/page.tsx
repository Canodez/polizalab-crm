'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import {
  opportunitiesApi,
  OpportunityProduct,
  CommissionType,
} from '@/lib/api/opportunitiesApi';
import { leadsApi, Lead } from '@/lib/api/leadsApi';
import { ApiError } from '@/lib/api-client';
import { showSuccess, showError } from '@/lib/toast';
import { useDirtyFormGuard } from '@/lib/hooks/useDirtyFormGuard';
import { useAuth } from '@/lib/auth-context';

// ── Validation ───────────────────────────────────────────────────────────────

interface FormErrors {
  product?: string;
  entity?: string;
}

function validate(fields: {
  product: OpportunityProduct | '';
  leadId: string;
  clientId: string;
  entityName: string;
}): FormErrors {
  const errors: FormErrors = {};
  if (!fields.product) errors.product = 'Selecciona el tipo de producto';
  if (!fields.leadId && !fields.clientId && !fields.entityName.trim()) {
    errors.entity = 'Vincula un lead, un cliente o ingresa un nombre';
  }
  return errors;
}

// ── Field component ───────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  id: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, id, error, required, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const selectClass =
  'w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white';

const PRODUCTS: { value: OpportunityProduct; label: string }[] = [
  { value: 'AUTO', label: 'Auto' },
  { value: 'VIDA', label: 'Vida' },
  { value: 'GMM', label: 'GMM' },
  { value: 'HOGAR', label: 'Hogar' },
  { value: 'PYME', label: 'PyME' },
  { value: 'OTRO', label: 'Otro' },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function NuevaOportunidadPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { markDirty, markClean, guardedNavigate } = useDirtyFormGuard();

  // Required
  const [product, setProduct] = useState<OpportunityProduct | ''>('');

  // Entity linking
  const [entityType, setEntityType] = useState<'lead' | 'cliente' | 'manual'>('manual');
  const [entitySearch, setEntitySearch] = useState('');
  const [leadResults, setLeadResults] = useState<Lead[]>([]);
  const [isSearchingLeads, setIsSearchingLeads] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [selectedLeadName, setSelectedLeadName] = useState('');
  const [entityName, setEntityName] = useState('');

  // Optional
  const [commissionType, setCommissionType] = useState<CommissionType | ''>('');
  const [commissionValue, setCommissionValue] = useState('');
  const [estimatedPremium, setEstimatedPremium] = useState('');
  const [currency, setCurrency] = useState('MXN');
  const [notes, setNotes] = useState('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Lead search
  const searchLeads = useCallback(
    async (term: string) => {
      if (!term.trim()) {
        setLeadResults([]);
        return;
      }
      setIsSearchingLeads(true);
      try {
        const data = await leadsApi.listLeads({ search: term, limit: 8 });
        setLeadResults(data.leads);
      } catch {
        setLeadResults([]);
      } finally {
        setIsSearchingLeads(false);
      }
    },
    []
  );

  useEffect(() => {
    if (entityType !== 'lead') return;
    const timer = setTimeout(() => {
      searchLeads(entitySearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [entitySearch, entityType, searchLeads]);

  const handleSelectLead = (lead: Lead) => {
    setSelectedLeadId(lead.leadId);
    setSelectedLeadName(lead.fullName);
    setEntitySearch(lead.fullName);
    setLeadResults([]);
    markDirty();
  };

  const handleClearLead = () => {
    setSelectedLeadId('');
    setSelectedLeadName('');
    setEntitySearch('');
    setLeadResults([]);
  };

  const handleSubmit = async () => {
    const validationErrors = validate({
      product,
      leadId: selectedLeadId,
      clientId: '',
      entityName,
    });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitError('');
    setIsSubmitting(true);

    try {
      const result = await opportunitiesApi.create({
        product: product as OpportunityProduct,
        leadId: selectedLeadId || undefined,
        entityName: entityName.trim() || selectedLeadName || undefined,
        commissionType: commissionType || undefined,
        commissionValue: commissionValue ? parseFloat(commissionValue) : undefined,
        estimatedPremium: estimatedPremium ? parseFloat(estimatedPremium) : undefined,
        currency: currency || undefined,
        notes: notes.trim() || undefined,
      });

      markClean();
      showSuccess('Oportunidad creada exitosamente');
      router.push(`/oportunidades/${result.opportunity.opportunityId}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
        showError(err.message);
      } else {
        setSubmitError('Error al crear la oportunidad. Intenta nuevamente.');
        showError('Error al crear la oportunidad');
      }
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-zinc-50">
        <div className="text-lg text-zinc-600">Cargando...</div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div>
      {/* Back link */}
      <div className="mb-6">
        <button
          onClick={() => guardedNavigate('/oportunidades', router)}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Oportunidades
        </button>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-xl font-semibold text-zinc-900">Nueva oportunidad</h2>
        <p className="mb-6 text-sm text-zinc-500">
          Completa los datos de la oportunidad. Los campos marcados con * son obligatorios.
        </p>

        {submitError && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600">{submitError}</div>
        )}

        <div className="space-y-6">
          {/* Product chips */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Producto <span className="text-red-500">*</span>
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {PRODUCTS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    setProduct(p.value);
                    markDirty();
                    setErrors((prev) => ({ ...prev, product: undefined }));
                  }}
                  className={`rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${
                    product === p.value
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {errors.product && (
              <p className="mt-1.5 text-xs text-red-600">{errors.product}</p>
            )}
          </div>

          {/* Entity linking */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Contacto / entidad
            </h3>

            {/* Entity type selector */}
            <div className="mb-3 flex gap-2">
              {(['lead', 'manual'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setEntityType(t);
                    handleClearLead();
                    setEntityName('');
                    setErrors((prev) => ({ ...prev, entity: undefined }));
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors border ${
                    entityType === t
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                  }`}
                  style={{ minHeight: '32px' }}
                >
                  {t === 'lead' ? 'Buscar lead' : 'Nombre libre'}
                </button>
              ))}
            </div>

            {entityType === 'lead' && (
              <div className="relative">
                <div className="relative">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={selectedLeadId ? selectedLeadName : entitySearch}
                    onChange={(e) => {
                      if (selectedLeadId) handleClearLead();
                      setEntitySearch(e.target.value);
                      markDirty();
                    }}
                    placeholder="Buscar lead por nombre o telefono..."
                    className="w-full rounded-lg border border-zinc-300 bg-white py-3 pl-9 pr-10 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    style={{ minHeight: '44px' }}
                    readOnly={!!selectedLeadId}
                  />
                  {selectedLeadId && (
                    <button
                      type="button"
                      onClick={handleClearLead}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                    >
                      x
                    </button>
                  )}
                </div>

                {/* Lead search results */}
                {!selectedLeadId && leadResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                    {isSearchingLeads && (
                      <p className="px-4 py-2 text-xs text-zinc-400">Buscando...</p>
                    )}
                    {leadResults.map((lead) => (
                      <button
                        key={lead.leadId}
                        type="button"
                        onClick={() => handleSelectLead(lead)}
                        className="block w-full px-4 py-2 text-left hover:bg-zinc-50"
                      >
                        <p className="text-sm font-medium text-zinc-900">{lead.fullName}</p>
                        <p className="text-xs text-zinc-500">{lead.phone}</p>
                      </button>
                    ))}
                  </div>
                )}

                {!selectedLeadId && entitySearch && !isSearchingLeads && leadResults.length === 0 && (
                  <p className="mt-1 text-xs text-zinc-400">No se encontraron leads.</p>
                )}
              </div>
            )}

            {entityType === 'manual' && (
              <Field label="Nombre del contacto o empresa" id="entityName">
                <input
                  id="entityName"
                  type="text"
                  value={entityName}
                  onChange={(e) => {
                    setEntityName(e.target.value);
                    markDirty();
                    setErrors((prev) => ({ ...prev, entity: undefined }));
                  }}
                  placeholder="Ej. Juan Perez, Empresa ABC"
                  className={inputClass}
                  style={{ minHeight: '44px' }}
                />
              </Field>
            )}

            {errors.entity && (
              <p className="mt-1.5 text-xs text-red-600">{errors.entity}</p>
            )}
          </div>

          {/* Financial details */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Datos financieros (opcional)
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Prima estimada" id="estimatedPremium">
                <input
                  id="estimatedPremium"
                  type="number"
                  value={estimatedPremium}
                  onChange={(e) => { setEstimatedPremium(e.target.value); markDirty(); }}
                  placeholder="Ej. 12500"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  style={{ minHeight: '44px' }}
                />
              </Field>

              <Field label="Moneda" id="currency">
                <select
                  id="currency"
                  value={currency}
                  onChange={(e) => { setCurrency(e.target.value); markDirty(); }}
                  className={selectClass}
                  style={{ minHeight: '44px' }}
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                </select>
              </Field>

              <Field label="Tipo de comision" id="commissionType">
                <select
                  id="commissionType"
                  value={commissionType}
                  onChange={(e) => {
                    setCommissionType(e.target.value as CommissionType | '');
                    markDirty();
                    if (!e.target.value) setCommissionValue('');
                  }}
                  className={selectClass}
                  style={{ minHeight: '44px' }}
                >
                  <option value="">Sin especificar</option>
                  <option value="PCT">Porcentaje (%)</option>
                  <option value="AMOUNT">Monto fijo ($)</option>
                </select>
              </Field>

              {commissionType && (
                <Field
                  label={commissionType === 'PCT' ? 'Comision (%)' : 'Comision ($)'}
                  id="commissionValue"
                >
                  <input
                    id="commissionValue"
                    type="number"
                    value={commissionValue}
                    onChange={(e) => { setCommissionValue(e.target.value); markDirty(); }}
                    placeholder={commissionType === 'PCT' ? 'Ej. 15' : 'Ej. 2000'}
                    min="0"
                    step="0.01"
                    className={inputClass}
                    style={{ minHeight: '44px' }}
                  />
                </Field>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Notas (opcional)
            </h3>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); markDirty(); }}
              placeholder="Contexto adicional sobre la oportunidad..."
              rows={3}
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
            style={{ minHeight: '44px' }}
          >
            {isSubmitting ? 'Creando...' : 'Crear oportunidad'}
          </button>
          <button
            onClick={() => guardedNavigate('/oportunidades', router)}
            className="flex-1 rounded-lg border border-zinc-300 px-6 py-3 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            style={{ minHeight: '44px' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
