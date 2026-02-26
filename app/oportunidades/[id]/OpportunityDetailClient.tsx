'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  PencilSquareIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  BanknotesIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  opportunitiesApi,
  Opportunity,
  PatchOpportunityData,
  OpportunityProduct,
  OpportunityStage,
  CommissionType,
  LostReason,
  AddQuoteData,
} from '@/lib/api/opportunitiesApi';
import { ApiError } from '@/lib/api-client';
import { useDirtyFormGuard } from '@/lib/hooks/useDirtyFormGuard';
import { showSuccess, showError } from '@/lib/toast';
import AccountCard from '@/components/account/AccountCard';
import OpportunityStageBadge from '@/components/opportunities/OpportunityStageBadge';
import StageStepper from '@/components/opportunities/StageStepper';
import QuotesList from '@/components/opportunities/QuotesList';
import CloseWonModal from '@/components/opportunities/CloseWonModal';
import CloseLostModal from '@/components/opportunities/CloseLostModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), "d 'de' MMMM yyyy", { locale: es });
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: number | null | undefined, currency = 'MXN'): string {
  if (amount == null) return '—';
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

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-zinc-900">{value || '—'}</p>
    </div>
  );
}

interface FieldProps {
  label: string;
  id: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, id, error, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-zinc-700">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const productLabels: Record<OpportunityProduct, string> = {
  AUTO: 'Auto',
  VIDA: 'Vida',
  GMM: 'GMM',
  HOGAR: 'Hogar',
  PYME: 'PyME',
  OTRO: 'Otro',
};

const lostReasonLabels: Record<LostReason, string> = {
  PRECIO: 'Precio',
  COBERTURA: 'Cobertura',
  COMPETENCIA: 'Competencia',
  SIN_RESPUESTA: 'Sin respuesta',
  CAMBIO_PLANES: 'Cambio de planes',
  OTRO: 'Otro',
};

// Pipeline stages in advance order (excluding terminal stages)
const ADVANCE_MAP: Partial<Record<OpportunityStage, OpportunityStage>> = {
  CALIFICAR: 'DATOS_MINIMOS',
  DATOS_MINIMOS: 'COTIZANDO',
  COTIZANDO: 'PROPUESTA_ENVIADA',
  PROPUESTA_ENVIADA: 'NEGOCIACION',
};

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const selectClass =
  'w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white';

// ── Main component ─────────────────────────────────────────────────────────────

export default function OpportunityDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();

  // Static export: extract real ID from pathname
  const opportunityId = pathname.split('/').filter(Boolean)[1] || params?.id || '';

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notFound, setNotFound] = useState(false);

  // Edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [editEntityName, setEditEntityName] = useState('');
  const [editProduct, setEditProduct] = useState<OpportunityProduct | ''>('');
  const [editCommissionType, setEditCommissionType] = useState<CommissionType | ''>('');
  const [editCommissionValue, setEditCommissionValue] = useState('');
  const [editEstimatedPremium, setEditEstimatedPremium] = useState('');
  const [editCurrency, setEditCurrency] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Stage advance
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Close modals
  const [showWonModal, setShowWonModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { markDirty, markClean, guardedNavigate } = useDirtyFormGuard();

  const populateForm = useCallback((o: Opportunity) => {
    setEditEntityName(o.entityName ?? '');
    setEditProduct(o.product);
    setEditCommissionType(o.commissionType ?? '');
    setEditCommissionValue(o.commissionValue != null ? String(o.commissionValue) : '');
    setEditEstimatedPremium(o.estimatedPremium != null ? String(o.estimatedPremium) : '');
    setEditCurrency(o.currency ?? 'MXN');
    setEditNotes(o.notes ?? '');
  }, []);

  useEffect(() => {
    if (!opportunityId) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    opportunitiesApi
      .get(opportunityId)
      .then((data) => {
        if (cancelled) return;
        setOpportunity(data);
        populateForm(data);
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.statusCode === 404) {
          setNotFound(true);
        } else if (err instanceof ApiError) {
          setLoadError(err.message);
        } else {
          setLoadError('Error al cargar la oportunidad');
        }
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [opportunityId, populateForm]);

  const handleSave = async () => {
    setSaveError('');
    setIsSaving(true);

    const data: PatchOpportunityData = {
      entityName: editEntityName.trim() || null,
      product: editProduct || undefined,
      commissionType: editCommissionType || null,
      commissionValue: editCommissionValue ? parseFloat(editCommissionValue) : null,
      estimatedPremium: editEstimatedPremium ? parseFloat(editEstimatedPremium) : null,
      currency: editCurrency.trim() || null,
      notes: editNotes.trim() || null,
    };

    try {
      const updated = await opportunitiesApi.patch(opportunityId, data);
      setOpportunity(updated);
      populateForm(updated);
      setIsEditMode(false);
      markClean();
      showSuccess('Oportunidad actualizada exitosamente');
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveError(err.message);
        showError(err.message);
      } else {
        setSaveError('Error al guardar los cambios');
        showError('Error al guardar los cambios');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (opportunity) populateForm(opportunity);
    setIsEditMode(false);
    setSaveError('');
    markClean();
  };

  const handleAdvanceStage = async () => {
    if (!opportunity) return;
    const nextStage = ADVANCE_MAP[opportunity.stage];
    if (!nextStage) return;

    setIsAdvancing(true);
    try {
      const updated = await opportunitiesApi.advanceStage(opportunityId, nextStage);
      setOpportunity(updated);
      showSuccess(`Etapa avanzada a ${productLabels[updated.product] ? updated.stage : updated.stage}`);
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al avanzar la etapa');
      }
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleCloseWon = async () => {
    const result = await opportunitiesApi.closeWon(opportunityId);
    setOpportunity(result.opportunity);
    setShowWonModal(false);
    showSuccess('Oportunidad cerrada como ganada');
  };

  const handleCloseLost = async (reason: LostReason, notes?: string) => {
    const updated = await opportunitiesApi.closeLost(opportunityId, reason, notes);
    setOpportunity(updated);
    setShowLostModal(false);
    showSuccess('Oportunidad cerrada como perdida');
  };

  const handleAddQuote = async (data: AddQuoteData) => {
    try {
      const updated = await opportunitiesApi.addQuote(opportunityId, data);
      setOpportunity(updated);
      showSuccess('Cotizacion agregada');
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al agregar la cotizacion');
      }
      throw err;
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await opportunitiesApi.delete(opportunityId);
      markClean();
      showSuccess('Oportunidad eliminada exitosamente');
      router.push('/oportunidades');
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al eliminar la oportunidad');
      }
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-lg text-zinc-600">Cargando...</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="mb-2 text-lg font-semibold text-zinc-900">Oportunidad no encontrada</p>
        <p className="mb-6 text-sm text-zinc-500">
          La oportunidad que buscas no existe o fue eliminada.
        </p>
        <button
          onClick={() => router.push('/oportunidades')}
          className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Volver a Oportunidades
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{loadError}</div>
    );
  }

  if (!opportunity) return null;

  const isTerminal = opportunity.stage === 'GANADA' || opportunity.stage === 'PERDIDA';
  const canAdvance = !isTerminal && !!ADVANCE_MAP[opportunity.stage];
  const isNegociacion = opportunity.stage === 'NEGOCIACION';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Modals */}
      <CloseWonModal
        isOpen={showWonModal}
        onClose={() => setShowWonModal(false)}
        onConfirm={handleCloseWon}
        opportunityId={opportunityId}
      />
      <CloseLostModal
        isOpen={showLostModal}
        onClose={() => setShowLostModal(false)}
        onConfirm={handleCloseLost}
      />

      {/* Back button */}
      <div className="mb-6">
        <button
          onClick={() => guardedNavigate('/oportunidades', router)}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
        >
          &larr; Oportunidades
        </button>
      </div>

      {/* Header card */}
      <div className="mb-6 rounded-xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-zinc-900 truncate">
              {opportunity.entityName || 'Sin nombre'}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <OpportunityStageBadge stage={opportunity.stage} />
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600">
                {productLabels[opportunity.product]}
              </span>
            </div>
          </div>

          {!isEditMode && (
            <button
              onClick={() => setIsEditMode(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors flex-shrink-0"
              style={{ minHeight: '36px' }}
            >
              <PencilSquareIcon className="h-4 w-4" />
              Editar
            </button>
          )}
        </div>

        {/* Stage stepper */}
        <div className="mt-5 pt-5 border-t border-zinc-100">
          <StageStepper
            currentStage={opportunity.stage}
            stageHistory={opportunity.stageHistory}
          />
        </div>

        {/* Entity links */}
        {(opportunity.leadId || opportunity.clientId) && (
          <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-wrap gap-3">
            {opportunity.leadId && (
              <Link
                href={`/leads/${opportunity.leadId}`}
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
              >
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                Ver lead
              </Link>
            )}
            {opportunity.clientId && (
              <Link
                href={`/clients/${opportunity.clientId}`}
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
              >
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                Ver cliente
              </Link>
            )}
          </div>
        )}
      </div>

      {/* ── EDIT MODE ──────────────────────────────────────────────────────── */}
      {isEditMode && (
        <AccountCard title="Editar oportunidad">
          {saveError && (
            <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{saveError}</div>
          )}
          <div className="space-y-6">
            <div>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Datos de la oportunidad
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nombre / entidad" id="edit-entityName">
                  <input
                    id="edit-entityName"
                    type="text"
                    value={editEntityName}
                    onChange={(e) => { setEditEntityName(e.target.value); markDirty(); }}
                    className={inputClass}
                    style={{ minHeight: '44px' }}
                    placeholder="Nombre del prospecto o empresa"
                  />
                </Field>

                <Field label="Producto" id="edit-product">
                  <select
                    id="edit-product"
                    value={editProduct}
                    onChange={(e) => { setEditProduct(e.target.value as OpportunityProduct); markDirty(); }}
                    className={selectClass}
                    style={{ minHeight: '44px' }}
                  >
                    <option value="AUTO">Auto</option>
                    <option value="VIDA">Vida</option>
                    <option value="GMM">GMM</option>
                    <option value="HOGAR">Hogar</option>
                    <option value="PYME">PyME</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </Field>

                <Field label="Prima estimada" id="edit-estimatedPremium">
                  <input
                    id="edit-estimatedPremium"
                    type="number"
                    value={editEstimatedPremium}
                    onChange={(e) => { setEditEstimatedPremium(e.target.value); markDirty(); }}
                    className={inputClass}
                    style={{ minHeight: '44px' }}
                    min="0"
                    step="0.01"
                    placeholder="0"
                  />
                </Field>

                <Field label="Moneda" id="edit-currency">
                  <select
                    id="edit-currency"
                    value={editCurrency}
                    onChange={(e) => { setEditCurrency(e.target.value); markDirty(); }}
                    className={selectClass}
                    style={{ minHeight: '44px' }}
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </Field>

                <Field label="Tipo de comision" id="edit-commissionType">
                  <select
                    id="edit-commissionType"
                    value={editCommissionType}
                    onChange={(e) => { setEditCommissionType(e.target.value as CommissionType | ''); markDirty(); }}
                    className={selectClass}
                    style={{ minHeight: '44px' }}
                  >
                    <option value="">Sin especificar</option>
                    <option value="PCT">Porcentaje (%)</option>
                    <option value="AMOUNT">Monto fijo ($)</option>
                  </select>
                </Field>

                {editCommissionType && (
                  <Field
                    label={editCommissionType === 'PCT' ? 'Comision (%)' : 'Comision ($)'}
                    id="edit-commissionValue"
                  >
                    <input
                      id="edit-commissionValue"
                      type="number"
                      value={editCommissionValue}
                      onChange={(e) => { setEditCommissionValue(e.target.value); markDirty(); }}
                      className={inputClass}
                      style={{ minHeight: '44px' }}
                      min="0"
                      step="0.01"
                      placeholder={editCommissionType === 'PCT' ? 'Ej. 15' : 'Ej. 2000'}
                    />
                  </Field>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Notas
              </h3>
              <textarea
                value={editNotes}
                onChange={(e) => { setEditNotes(e.target.value); markDirty(); }}
                rows={3}
                className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                placeholder="Notas internas sobre la oportunidad..."
              />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
              style={{ minHeight: '44px' }}
            >
              {isSaving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={isSaving}
              className="flex-1 rounded-lg border border-zinc-300 px-6 py-3 font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100"
              style={{ minHeight: '44px' }}
            >
              Cancelar
            </button>
          </div>
        </AccountCard>
      )}

      {/* ── READ-ONLY VIEW ─────────────────────────────────────────────────── */}
      {!isEditMode && (
        <>
          {/* Summary card */}
          <AccountCard title="Resumen">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <InfoRow
                label="Prima estimada"
                value={formatCurrency(opportunity.estimatedPremium, opportunity.currency ?? 'MXN')}
              />
              <InfoRow
                label="Comision"
                value={
                  opportunity.commissionType && opportunity.commissionValue != null
                    ? opportunity.commissionType === 'PCT'
                      ? `${opportunity.commissionValue}%`
                      : formatCurrency(opportunity.commissionValue, opportunity.currency ?? 'MXN')
                    : null
                }
              />
              <InfoRow label="Moneda" value={opportunity.currency ?? 'MXN'} />
              <InfoRow label="Creada" value={formatDate(opportunity.createdAt)} />
              <InfoRow label="Actualizada" value={formatDate(opportunity.updatedAt)} />
              {opportunity.closedAt && (
                <InfoRow label="Cerrada" value={formatDate(opportunity.closedAt)} />
              )}
            </div>
          </AccountCard>

          {/* No activity banner */}
          {!isTerminal && !opportunity.nextActivityId && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-medium text-amber-800">Sin actividad proxima</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Agenda una actividad para dar seguimiento a esta oportunidad.
                </p>
              </div>
            </div>
          )}

          {/* Lost reason banner */}
          {opportunity.stage === 'PERDIDA' && opportunity.closedReason && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-red-800">Motivo de perdida</p>
                <p className="text-xs text-red-700 mt-0.5">
                  {lostReasonLabels[opportunity.closedReason]}
                </p>
              </div>
            </div>
          )}

          {/* Won: upload policy CTA */}
          {opportunity.stage === 'GANADA' && (
            <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-green-900">Oportunidad ganada</p>
                  {opportunity.wonPolicyId ? (
                    <p className="text-xs text-green-700 mt-0.5">
                      Poliza vinculada.
                    </p>
                  ) : (
                    <p className="text-xs text-green-700 mt-0.5">
                      Sube la poliza correspondiente para completar el proceso.
                    </p>
                  )}
                </div>
                {!opportunity.wonPolicyId && (
                  <Link
                    href="/policies"
                    className="inline-flex items-center gap-1.5 flex-shrink-0 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
                  >
                    <BanknotesIcon className="h-4 w-4" />
                    Subir poliza
                  </Link>
                )}
                {opportunity.wonPolicyId && (
                  <Link
                    href={`/policies/${opportunity.wonPolicyId}`}
                    className="inline-flex items-center gap-1.5 flex-shrink-0 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    Ver poliza
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {opportunity.notes && (
            <AccountCard title="Notas">
              <p className="whitespace-pre-wrap text-sm text-zinc-700">{opportunity.notes}</p>
            </AccountCard>
          )}

          {/* Quotes */}
          {!isTerminal && (
            <AccountCard title="Cotizaciones">
              <QuotesList
                quotes={opportunity.quotes ?? []}
                onAddQuote={handleAddQuote}
              />
            </AccountCard>
          )}
          {isTerminal && (opportunity.quotes?.length ?? 0) > 0 && (
            <AccountCard title="Cotizaciones">
              <QuotesList
                quotes={opportunity.quotes ?? []}
                onAddQuote={handleAddQuote}
              />
            </AccountCard>
          )}
        </>
      )}

      {/* ── STAGE ACTIONS ──────────────────────────────────────────────────── */}
      {!isEditMode && !isTerminal && (
        <div className="mt-2 space-y-2">
          {canAdvance && (
            <button
              onClick={handleAdvanceStage}
              disabled={isAdvancing}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
              style={{ minHeight: '44px' }}
            >
              {isAdvancing ? 'Avanzando...' : `Avanzar a ${ADVANCE_MAP[opportunity.stage] ?? ''}`}
            </button>
          )}

          {isNegociacion && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowWonModal(true)}
                className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 transition-colors"
                style={{ minHeight: '44px' }}
              >
                Cerrar ganada
              </button>
              <button
                onClick={() => setShowLostModal(true)}
                className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                style={{ minHeight: '44px' }}
              >
                Cerrar perdida
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── DELETE SECTION ────────────────────────────────────────────────── */}
      {!isEditMode && (
        <div className="mt-4">
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full rounded-lg border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              style={{ minHeight: '44px' }}
            >
              <span className="inline-flex items-center gap-2">
                <TrashIcon className="h-4 w-4" />
                Eliminar oportunidad
              </span>
            </button>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="mb-1 text-sm font-semibold text-red-900">
                Eliminar esta oportunidad permanentemente?
              </p>
              <p className="mb-4 text-xs text-red-700">
                La oportunidad y sus cotizaciones seran eliminadas. Esta accion no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700 disabled:bg-red-300"
                  style={{ minHeight: '44px' }}
                >
                  {isDeleting ? 'Eliminando...' : 'Si, eliminar'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  style={{ minHeight: '44px' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
