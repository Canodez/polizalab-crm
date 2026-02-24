'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { policiesApi, Policy, PatchPolicyData, ApiError, PolicyStatus } from '@/lib/api/policiesApi';
import { POLICY_TYPES, POLICY_TYPE_VALUES, getPolicyTypeConfig } from '@/lib/constants/policyTypes';
import { useDirtyFormGuard } from '@/lib/hooks/useDirtyFormGuard';
import AccountCard from '@/components/account/AccountCard';
import RenewalBadge from '@/components/policies/RenewalBadge';
import ReviewPanel from './ReviewPanel';

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 5 * 60 * 1000; // 5 minutes

const PROCESSING_STATUSES: PolicyStatus[] = ['CREATED', 'UPLOADED', 'PROCESSING'];

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'd MMM yyyy', { locale: es });
  } catch {
    return '—';
  }
}

function toDateInputValue(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

export default function PolicyDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  // In static export, useParams returns '_' (the pre-generated shell param).
  // usePathname() reflects the real browser URL after hydration.
  const policyId = pathname.split('/').filter(Boolean)[1] || params?.id || '';

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Edit form fields
  const [policyNumber, setPolicyNumber] = useState('');
  const [insuredName, setInsuredName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [insurer, setInsurer] = useState('');
  const [policyType, setPolicyType] = useState('');

  const { markDirty, markClean, guardedNavigate } = useDirtyFormGuard();

  const isDirty =
    policy !== null &&
    isEditMode &&
    (policyNumber !== (policy.policyNumber || '') ||
      insuredName !== (policy.insuredName || '') ||
      startDate !== toDateInputValue(policy.startDate) ||
      endDate !== toDateInputValue(policy.endDate) ||
      insurer !== (policy.insurer || '') ||
      policyType !== (policy.policyType || ''));

  useEffect(() => {
    if (isDirty) markDirty();
    else markClean();
  }, [isDirty, markDirty, markClean]);

  const populateForm = useCallback((p: Policy) => {
    setPolicyNumber(p.policyNumber || '');
    setInsuredName(p.insuredName || '');
    setStartDate(toDateInputValue(p.startDate));
    setEndDate(toDateInputValue(p.endDate));
    setInsurer(p.insurer || '');
    setPolicyType(p.policyType || '');
  }, []);

  // Polling logic
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const scheduleNextPoll = useCallback(
    (id: string, startMs: number) => {
      pollTimerRef.current = setTimeout(async () => {
        if (Date.now() - startMs > POLL_MAX_MS) {
          setPollTimedOut(true);
          return;
        }
        try {
          const data = await policiesApi.getPolicy(id);
          setPolicy(data);
          if (PROCESSING_STATUSES.includes(data.status)) {
            scheduleNextPoll(id, startMs);
          } else {
            populateForm(data);
          }
        } catch {
          // Silent fail during polling — try again
          scheduleNextPoll(id, startMs);
        }
      }, POLL_INTERVAL_MS);
    },
    [populateForm],
  );

  useEffect(() => {
    if (!policyId) return;
    let cancelled = false;
    setIsLoading(true);

    policiesApi
      .getPolicy(policyId)
      .then((data) => {
        if (cancelled) return;
        setPolicy(data);
        populateForm(data);
        setIsLoading(false);
        if (PROCESSING_STATUSES.includes(data.status)) {
          scheduleNextPoll(policyId, Date.now());
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.statusCode === 404) {
          setNotFound(true);
        } else if (err instanceof ApiError) {
          setLoadError(err.message);
        } else {
          setLoadError('Error al cargar la póliza');
        }
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [policyId, scheduleNextPoll, stopPolling, populateForm]);

  const handleConfirm = async (data: PatchPolicyData) => {
    if (!policy) return;
    setSaveError('');
    setIsSaving(true);
    try {
      const updated = await policiesApi.patchPolicy(policyId, data);
      setPolicy(updated);
      populateForm(updated);
      setIsEditMode(false);
      markClean();
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveError(err.message);
      } else {
        setSaveError('Error al guardar los cambios');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await policiesApi.deletePolicy(policyId);
      router.push('/policies');
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(err.message);
      } else {
        setDeleteError('Error al eliminar la póliza');
      }
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleRetry = async () => {
    if (!policy) return;
    setSaveError('');
    try {
      await policiesApi.ingest(policyId);
      // Optimistically show UPLOADED and start polling
      const optimistic: Policy = { ...policy, status: 'UPLOADED' };
      setPolicy(optimistic);
      setPollTimedOut(false);
      scheduleNextPoll(policyId, Date.now());
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveError(err.message);
      } else {
        setSaveError('Error al reintentar el procesamiento');
      }
    }
  };

  const handleEditSave = async () => {
    const data: PatchPolicyData = {
      policyNumber: policyNumber.trim() || undefined,
      insuredName: insuredName.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      insurer: insurer.trim() || undefined,
      policyType: policyType || undefined,
    };
    await handleConfirm(data);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
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
        <p className="mb-2 text-lg font-semibold text-zinc-900">Póliza no encontrada</p>
        <p className="mb-6 text-sm text-zinc-500">La póliza que buscas no existe o fue eliminada.</p>
        <button
          onClick={() => router.push('/policies')}
          className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Volver a Pólizas
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{loadError}</div>
    );
  }

  if (!policy) return null;

  const typeConfig = getPolicyTypeConfig(policy.policyType || '');
  const isUnknownType = policy.policyType && !POLICY_TYPE_VALUES.includes(policy.policyType);
  const isProcessing = PROCESSING_STATUSES.includes(policy.status);

  return (
    <div>
      {/* Back button */}
      <div className="mb-6">
        <button
          onClick={() => guardedNavigate('/policies', router)}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← Mis pólizas
        </button>
      </div>

      {/* Policy header card */}
      <div className="mb-6 flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${typeConfig?.color ?? 'bg-zinc-100'}`}
          >
            <span className={`text-sm font-bold ${typeConfig?.textColor ?? 'text-zinc-600'}`}>
              {(policy.policyType || '?').charAt(0)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-900">
              {policy.policyType || policy.sourceFileName || 'Tipo desconocido'}
            </p>
            {policy.policyNumber && (
              <p className="text-xs text-zinc-500">#{policy.policyNumber}</p>
            )}
          </div>
        </div>
        <RenewalBadge policyStatus={policy.status} renewalStatus={policy.renewalStatus} />
      </div>

      {/* ── PROCESSING spinner ─────────────────────────────────────────────── */}
      {isProcessing && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          {pollTimedOut ? (
            <>
              <p className="text-sm font-medium text-zinc-700">
                El análisis está tardando más de lo esperado.
              </p>
              <p className="mt-1 text-sm text-zinc-500">Puedes volver a verificar más tarde.</p>
              <button
                onClick={() => router.push('/policies')}
                className="mt-6 rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Volver a Pólizas
              </button>
            </>
          ) : (
            <>
              <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-800" />
              <p className="text-sm font-medium text-zinc-700">Analizando documento...</p>
              <p className="mt-1 text-xs text-zinc-500">Esto puede tardar hasta un minuto</p>
            </>
          )}
        </div>
      )}

      {/* ── FAILED ────────────────────────────────────────────────────────── */}
      {policy.status === 'FAILED' && (
        <AccountCard title="Error en el análisis">
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 mb-4">
            {policy.lastError || 'El análisis del documento falló. Por favor, intenta nuevamente.'}
          </div>
          {saveError && (
            <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{saveError}</div>
          )}
          <button
            onClick={handleRetry}
            className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
            style={{ minHeight: '44px' }}
          >
            Reintentar análisis
          </button>
        </AccountCard>
      )}

      {/* ── NEEDS_REVIEW ──────────────────────────────────────────────────── */}
      {policy.status === 'NEEDS_REVIEW' && (
        <AccountCard title="Revisión requerida">
          {saveError && (
            <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{saveError}</div>
          )}
          <ReviewPanel policy={policy} onConfirm={handleConfirm} isSaving={isSaving} />
        </AccountCard>
      )}

      {/* ── DELETE SECTION ────────────────────────────────────────────────── */}
      {!isProcessing && (
        <div className="mt-6">
          {deleteError && (
            <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{deleteError}</div>
          )}
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full rounded-lg border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              style={{ minHeight: '44px' }}
            >
              Eliminar póliza
            </button>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="mb-1 text-sm font-semibold text-red-800">
                ¿Eliminar esta póliza?
              </p>
              <p className="mb-4 text-xs text-red-600">
                Se eliminará el documento y todos los datos. Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700 disabled:bg-red-300"
                  style={{ minHeight: '44px' }}
                >
                  {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteError(''); }}
                  disabled={isDeleting}
                  className="flex-1 rounded-lg border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  style={{ minHeight: '44px' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── EXTRACTED / VERIFIED ──────────────────────────────────────────── */}
      {(policy.status === 'EXTRACTED' || policy.status === 'VERIFIED') && (
        <>
          {/* VERIFIED banner */}
          {policy.status === 'VERIFIED' && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
              <span className="font-medium">Verificada</span>
              {policy.verifiedAt && (
                <span className="text-green-600">· {formatDate(policy.verifiedAt)}</span>
              )}
            </div>
          )}

          <AccountCard title="Datos de la póliza">
            {saveError && (
              <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{saveError}</div>
            )}
            {!isEditMode ? (
              /* Read-only view */
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <p className="text-zinc-500">Número de póliza</p>
                    <p className="font-medium text-zinc-900">{policy.policyNumber || '—'}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Asegurado</p>
                    <p className="font-medium text-zinc-900">{policy.insuredName || '—'}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Aseguradora</p>
                    <p className="font-medium text-zinc-900">{policy.insurer || '—'}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Tipo de póliza</p>
                    <p className="font-medium text-zinc-900">{policy.policyType || '—'}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Fecha inicio</p>
                    <p className="font-medium text-zinc-900">{formatDate(policy.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Fecha vencimiento</p>
                    <p className="font-medium text-zinc-900">{formatDate(policy.endDate)}</p>
                  </div>
                  {policy.premiumTotal !== undefined && (
                    <div>
                      <p className="text-zinc-500">Prima total</p>
                      <p className="font-medium text-zinc-900">
                        {policy.currency} {policy.premiumTotal.toLocaleString()}
                      </p>
                    </div>
                  )}
                  {policy.fechaRenovacion && (
                    <div>
                      <p className="text-zinc-500">Próxima renovación</p>
                      <p className="font-medium text-zinc-900">
                        {formatDate(policy.fechaRenovacion)}
                      </p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setIsEditMode(true)}
                  className="mt-2 rounded-lg border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  style={{ minHeight: '44px' }}
                >
                  Editar
                </button>
              </div>
            ) : (
              /* Edit mode */
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Número de póliza
                  </label>
                  <input
                    type="text"
                    value={policyNumber}
                    onChange={(e) => setPolicyNumber(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    style={{ minHeight: '44px' }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Nombre del asegurado
                  </label>
                  <input
                    type="text"
                    value={insuredName}
                    onChange={(e) => setInsuredName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    style={{ minHeight: '44px' }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Aseguradora</label>
                  <input
                    type="text"
                    value={insurer}
                    onChange={(e) => setInsurer(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    style={{ minHeight: '44px' }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Tipo de póliza
                  </label>
                  <select
                    value={policyType}
                    onChange={(e) => setPolicyType(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    style={{ minHeight: '44px' }}
                  >
                    <option value="">— Seleccionar —</option>
                    {isUnknownType && (
                      <option value={policy.policyType}>{policy.policyType}</option>
                    )}
                    {POLICY_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Fecha de inicio
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    style={{ minHeight: '44px' }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Fecha de vencimiento
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    style={{ minHeight: '44px' }}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleEditSave}
                    disabled={isSaving}
                    className="flex-1 rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
                    style={{ minHeight: '44px' }}
                  >
                    {isSaving ? 'Guardando...' : 'Confirmar'}
                  </button>
                  <button
                    onClick={() => {
                      populateForm(policy);
                      setIsEditMode(false);
                      markClean();
                    }}
                    disabled={isSaving}
                    className="flex-1 rounded-lg border border-zinc-300 px-6 py-3 font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100"
                    style={{ minHeight: '44px' }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </AccountCard>
        </>
      )}
    </div>
  );
}
