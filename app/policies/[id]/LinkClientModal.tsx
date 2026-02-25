'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { XMarkIcon, UserIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { clientsApi, Client, ApiError, DuplicateCheckResponse } from '@/lib/api/clientsApi';
import { Policy } from '@/lib/api/policiesApi';
import { showError } from '@/lib/toast';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Split a full name string into firstName / lastName best-effort.
 * "María García López" → { firstName: "María", lastName: "García López" }
 */
function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  policy: Policy;
  onClose: () => void;
  onLinked: (client: Client) => void;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function LinkClientModal({ policy, onClose, onLinked }: Props) {
  const { firstName: prefillFirst, lastName: prefillLast } = splitFullName(
    policy.insuredName ?? ''
  );

  const [firstName, setFirstName] = useState(prefillFirst);
  const [lastName, setLastName] = useState(prefillLast);
  const [rfc, setRfc] = useState(policy.rfc ?? '');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Duplicate detection state
  const [duplicateClient, setDuplicateClient] = useState<DuplicateCheckResponse['existingClient'] | null>(null);
  const [isDuplicateChecking, setIsDuplicateChecking] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkDuplicate = useCallback(
    (fields: { email?: string; rfc?: string; phone?: string }) => {
      const hasAny = fields.email || fields.rfc || fields.phone;
      if (!hasAny) {
        setDuplicateClient(null);
        return;
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setIsDuplicateChecking(true);
        try {
          const result = await clientsApi.checkDuplicate({
            email: fields.email || undefined,
            rfc: fields.rfc?.toUpperCase() || undefined,
            phone: fields.phone || undefined,
          });
          setDuplicateClient(result.isDuplicate && result.existingClient ? result.existingClient : null);
        } catch {
          // Silent — duplicate check is best-effort
          setDuplicateClient(null);
        } finally {
          setIsDuplicateChecking(false);
        }
      }, 500);
    },
    []
  );

  // Run duplicate check when email/rfc/phone change
  useEffect(() => {
    checkDuplicate({ email, rfc, phone });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [email, rfc, phone, checkDuplicate]);

  const handleUseExisting = async () => {
    if (!duplicateClient) return;
    try {
      await clientsApi.linkPolicy(duplicateClient.clientId, policy.policyId);
      const fullClient = await clientsApi.getClient(duplicateClient.clientId);
      onLinked(fullClient);
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al vincular el cliente existente');
      }
    }
  };

  const handleCreateAndLink = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setSubmitError('El nombre y apellido son requeridos');
      return;
    }
    setSubmitError('');
    setIsSubmitting(true);

    try {
      const result = await clientsApi.upsertClient({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        rfc: rfc.trim().toUpperCase() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        sourcePolicyId: policy.policyId,
      });

      // Link the policy to the client (upsert may have created or found one)
      await clientsApi.linkPolicy(result.client.clientId, policy.policyId);
      onLinked(result.client);
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
        showError(err.message);
      } else {
        setSubmitError('Error al crear y vincular el cliente');
        showError('Error al crear y vincular el cliente');
      }
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h3 className="text-base font-semibold text-zinc-900">Vincular cliente</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
            aria-label="Cerrar"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {submitError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{submitError}</div>
          )}

          <p className="text-sm text-zinc-500">
            Completa los datos del cliente. Se pre-llenaron desde los datos de la póliza.
          </p>

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="María"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Apellido(s) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="García López"
                className={inputClass}
              />
            </div>
          </div>

          {/* RFC */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">RFC</label>
            <input
              type="text"
              value={rfc}
              onChange={(e) => setRfc(e.target.value)}
              onBlur={() => checkDuplicate({ email, rfc, phone })}
              placeholder="XAXX010101000"
              maxLength={13}
              className={inputClass}
            />
          </div>

          {/* Email */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => checkDuplicate({ email, rfc, phone })}
              placeholder="maria@ejemplo.com"
              className={inputClass}
            />
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">Teléfono</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => checkDuplicate({ email, rfc, phone })}
              placeholder="55 1234 5678"
              className={inputClass}
            />
          </div>

          {/* Duplicate notice */}
          {isDuplicateChecking && (
            <p className="text-xs text-zinc-400">Verificando duplicados...</p>
          )}

          {duplicateClient && !isDuplicateChecking && (
            <div className="flex items-start justify-between rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <UserIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <div>
                  <p className="text-xs font-medium text-amber-800">Cliente existente encontrado</p>
                  <p className="text-xs text-amber-700">
                    {duplicateClient.firstName} {duplicateClient.lastName}
                    {duplicateClient.field && ` · coincide por ${duplicateClient.field}`}
                  </p>
                </div>
              </div>
              <button
                onClick={handleUseExisting}
                className="ml-3 flex-shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
              >
                Usar existente
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-zinc-200 px-5 py-4">
          <button
            onClick={handleCreateAndLink}
            disabled={isSubmitting || !firstName.trim() || !lastName.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400 transition-colors"
            style={{ minHeight: '44px' }}
          >
            {isSubmitting ? (
              'Creando y vinculando...'
            ) : (
              <>
                <CheckCircleIcon className="h-4 w-4" />
                Crear y vincular
              </>
            )}
          </button>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            style={{ minHeight: '44px' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
