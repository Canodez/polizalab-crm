'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  PencilSquareIcon,
  DocumentTextIcon,
  ArchiveBoxIcon,
  ArchiveBoxXMarkIcon,
  ClipboardDocumentListIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  clientsApi,
  Client,
  PatchClientData,
  ApiError,
  ClientDetailResponse,
} from '@/lib/api/clientsApi';
import { Policy } from '@/lib/api/policiesApi';
import { useDirtyFormGuard } from '@/lib/hooks/useDirtyFormGuard';
import { showSuccess, showError } from '@/lib/toast';
import AccountCard from '@/components/account/AccountCard';
import ActivityTimeline from '@/components/activities/ActivityTimeline';

// ── Validation helpers ──────────────────────────────────────────────────────

const RFC_REGEX = /^[A-Z&]{3,4}\d{6}[A-Z\d]{3}$/i;
const CURP_REGEX = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s\-+().]{7,20}$/;

interface FormErrors {
  firstName?: string;
  lastName?: string;
  rfc?: string;
  curp?: string;
  email?: string;
  phone?: string;
  zipCode?: string;
}

function validatePatch(fields: {
  firstName: string;
  lastName: string;
  rfc: string;
  curp: string;
  email: string;
  phone: string;
  zipCode: string;
}): FormErrors {
  const errors: FormErrors = {};
  if (!fields.firstName.trim()) errors.firstName = 'El nombre es requerido';
  if (!fields.lastName.trim()) errors.lastName = 'El apellido es requerido';
  if (fields.rfc.trim() && !RFC_REGEX.test(fields.rfc.trim())) {
    errors.rfc = 'RFC inválido (ej. XAXX010101000)';
  }
  if (fields.curp.trim() && !CURP_REGEX.test(fields.curp.trim())) {
    errors.curp = 'CURP inválida (18 caracteres)';
  }
  if (fields.email.trim() && !EMAIL_REGEX.test(fields.email.trim())) {
    errors.email = 'Correo electrónico inválido';
  }
  if (fields.phone.trim() && !PHONE_REGEX.test(fields.phone.trim())) {
    errors.phone = 'Teléfono inválido';
  }
  if (fields.zipCode.trim() && !/^\d{5}$/.test(fields.zipCode.trim())) {
    errors.zipCode = 'Código postal debe tener 5 dígitos';
  }
  return errors;
}

// ── Small display helpers ───────────────────────────────────────────────────

function StatusBadge({ status }: { status: Client['status'] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        status === 'active' ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
      }`}
    >
      {status === 'active' ? 'Activo' : 'Archivado'}
    </span>
  );
}

function CreatedFromBadge({ createdFrom }: { createdFrom: Client['createdFrom'] }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600">
      {createdFrom === 'manual' ? (
        <>
          <PencilSquareIcon className="h-3 w-3" />
          Manual
        </>
      ) : (
        <>
          <DocumentTextIcon className="h-3 w-3" />
          Desde póliza
        </>
      )}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-zinc-900">{value || '—'}</p>
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const inputErrorClass =
  'w-full rounded-lg border border-red-400 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500';

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

// ── Policy mini-card ────────────────────────────────────────────────────────

function LinkedPolicyCard({ policy }: { policy: Policy }) {
  const statusLabel: Record<string, string> = {
    CREATED: 'Creada',
    UPLOADED: 'Subida',
    PROCESSING: 'Procesando',
    EXTRACTED: 'Extraída',
    NEEDS_REVIEW: 'Revisión',
    FAILED: 'Error',
    VERIFIED: 'Verificada',
  };

  return (
    <Link
      href={`/policies/${policy.policyId}`}
      className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm transition-colors hover:bg-zinc-100"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-zinc-900">
          {policy.policyType || policy.sourceFileName || 'Póliza sin tipo'}
        </p>
        {policy.policyNumber && (
          <p className="truncate text-xs text-zinc-500">#{policy.policyNumber}</p>
        )}
      </div>
      <span
        className={`ml-3 flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
          policy.status === 'VERIFIED'
            ? 'bg-green-100 text-green-700'
            : policy.status === 'FAILED'
            ? 'bg-red-100 text-red-600'
            : 'bg-zinc-200 text-zinc-600'
        }`}
      >
        {statusLabel[policy.status] ?? policy.status}
      </span>
    </Link>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function ClientDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();

  // Static export: extract real ID from pathname (same pattern as policies)
  const clientId = pathname.split('/').filter(Boolean)[1] || params?.id || '';

  const [clientDetail, setClientDetail] = useState<ClientDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isArchiving, setIsArchiving] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Edit form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [rfc, setRfc] = useState('');
  const [curp, setCurp] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateField, setStateField] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [notes, setNotes] = useState('');

  const { markDirty, markClean, guardedNavigate } = useDirtyFormGuard();

  const populateForm = useCallback((c: Client) => {
    setFirstName(c.firstName);
    setLastName(c.lastName);
    setRfc(c.rfc ?? '');
    setCurp(c.curp ?? '');
    setEmail(c.email ?? '');
    setPhone(c.phone ?? '');
    setAddress(c.address ?? '');
    setCity(c.city ?? '');
    setStateField(c.state ?? '');
    setZipCode(c.zipCode ?? '');
    setNotes(c.notes ?? '');
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    clientsApi
      .getClient(clientId)
      .then((data) => {
        if (cancelled) return;
        setClientDetail(data);
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
          setLoadError('Error al cargar el cliente');
        }
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [clientId, populateForm]);

  const handleSave = async () => {
    const validationErrors = validatePatch({ firstName, lastName, rfc, curp, email, phone, zipCode });
    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors);
      return;
    }
    setFormErrors({});
    setSaveError('');
    setIsSaving(true);

    const data: PatchClientData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      rfc: rfc.trim().toUpperCase() || null,
      curp: curp.trim().toUpperCase() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      city: city.trim() || null,
      state: stateField.trim() || null,
      zipCode: zipCode.trim() || null,
      notes: notes.trim() || null,
    };

    try {
      const updated = await clientsApi.patchClient(clientId, data);
      setClientDetail((prev) => (prev ? { ...prev, ...updated } : null));
      populateForm(updated);
      setIsEditMode(false);
      markClean();
      showSuccess('Cliente actualizado exitosamente');
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
    if (clientDetail) populateForm(clientDetail);
    setIsEditMode(false);
    setFormErrors({});
    setSaveError('');
    markClean();
  };

  const handleArchiveToggle = async () => {
    if (!clientDetail) return;
    setIsArchiving(true);
    try {
      if (clientDetail.status === 'active') {
        await clientsApi.archiveClient(clientId);
        setClientDetail((prev) => (prev ? { ...prev, status: 'archived' } : null));
        showSuccess('Cliente archivado');
      } else {
        await clientsApi.unarchiveClient(clientId);
        setClientDetail((prev) => (prev ? { ...prev, status: 'active' } : null));
        showSuccess('Cliente reactivado');
      }
      setShowArchiveConfirm(false);
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al cambiar el estado del cliente');
      }
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDelete = async () => {
    if (!clientDetail) return;
    setIsDeleting(true);
    try {
      const result = await clientsApi.deleteClient(clientId);
      markClean();
      showSuccess(
        result.policiesUnlinked > 0
          ? `Cliente eliminado. ${result.policiesUnlinked} póliza(s) desvinculada(s) y puesta(s) en revisión.`
          : 'Cliente eliminado exitosamente'
      );
      router.push('/clients');
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al eliminar el cliente');
      }
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // ── States ────────────────────────────────────────────────────────────────

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
        <p className="mb-2 text-lg font-semibold text-zinc-900">Cliente no encontrado</p>
        <p className="mb-6 text-sm text-zinc-500">El cliente que buscas no existe o fue eliminado.</p>
        <button
          onClick={() => router.push('/clients')}
          className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Volver a Clientes
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{loadError}</div>
    );
  }

  if (!clientDetail) return null;

  const client = clientDetail;
  const linkedPolicies: Policy[] = clientDetail.policies ?? [];
  const fullName = `${client.firstName} ${client.lastName}`;
  const initials = `${client.firstName.charAt(0)}${client.lastName.charAt(0)}`.toUpperCase();

  return (
    <div>
      {/* Back button */}
      <div className="mb-6">
        <button
          onClick={() => guardedNavigate('/clients', router)}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← Mis clientes
        </button>
      </div>

      {/* Header card */}
      <div className="mb-6 rounded-xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
              <span className="text-sm font-bold text-blue-700">{initials}</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-zinc-900 truncate">{fullName}</h2>
              <div className="mt-1 flex flex-wrap gap-2">
                <StatusBadge status={client.status} />
                <CreatedFromBadge createdFrom={client.createdFrom} />
              </div>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {!isEditMode && (
              <button
                onClick={() => setIsEditMode(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                style={{ minHeight: '36px' }}
              >
                <PencilSquareIcon className="h-4 w-4" />
                Editar
              </button>
            )}
          </div>
        </div>

        {/* Quick contact preview */}
        {!isEditMode && (client.email || client.phone) && (
          <div className="mt-4 flex flex-wrap gap-4 border-t border-zinc-100 pt-4">
            {client.email && (
              <a
                href={`mailto:${client.email}`}
                className="flex items-center gap-1.5 text-sm text-zinc-600 hover:text-blue-600 transition-colors"
              >
                <EnvelopeIcon className="h-4 w-4" />
                {client.email}
              </a>
            )}
            {client.phone && (
              <a
                href={`tel:${client.phone}`}
                className="flex items-center gap-1.5 text-sm text-zinc-600 hover:text-blue-600 transition-colors"
              >
                <PhoneIcon className="h-4 w-4" />
                {client.phone}
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── EDIT MODE ──────────────────────────────────────────────────────── */}
      {isEditMode && (
        <AccountCard title="Editar cliente">
          {saveError && (
            <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{saveError}</div>
          )}
          <div className="space-y-6">
            {/* Identity */}
            <div>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Datos personales
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nombre *" id="edit-firstName" error={formErrors.firstName}>
                  <input
                    id="edit-firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => { setFirstName(e.target.value); markDirty(); }}
                    className={formErrors.firstName ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                  />
                </Field>
                <Field label="Apellido(s) *" id="edit-lastName" error={formErrors.lastName}>
                  <input
                    id="edit-lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => { setLastName(e.target.value); markDirty(); }}
                    className={formErrors.lastName ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                  />
                </Field>
                <Field label="RFC" id="edit-rfc" error={formErrors.rfc}>
                  <input
                    id="edit-rfc"
                    type="text"
                    value={rfc}
                    onChange={(e) => { setRfc(e.target.value); markDirty(); }}
                    maxLength={13}
                    className={formErrors.rfc ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                  />
                </Field>
                <Field label="CURP" id="edit-curp" error={formErrors.curp}>
                  <input
                    id="edit-curp"
                    type="text"
                    value={curp}
                    onChange={(e) => { setCurp(e.target.value); markDirty(); }}
                    maxLength={18}
                    className={formErrors.curp ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                  />
                </Field>
              </div>
            </div>

            {/* Contact */}
            <div>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Contacto
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Correo electrónico" id="edit-email" error={formErrors.email}>
                  <input
                    id="edit-email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); markDirty(); }}
                    className={formErrors.email ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                  />
                </Field>
                <Field label="Teléfono" id="edit-phone" error={formErrors.phone}>
                  <input
                    id="edit-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); markDirty(); }}
                    className={formErrors.phone ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                  />
                </Field>
              </div>
            </div>

            {/* Address */}
            <div>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Domicilio
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <Field label="Calle y número" id="edit-address">
                  <input
                    id="edit-address"
                    type="text"
                    value={address}
                    onChange={(e) => { setAddress(e.target.value); markDirty(); }}
                    className={inputClass}
                    style={{ minHeight: '44px' }}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="Ciudad" id="edit-city">
                    <input
                      id="edit-city"
                      type="text"
                      value={city}
                      onChange={(e) => { setCity(e.target.value); markDirty(); }}
                      className={inputClass}
                      style={{ minHeight: '44px' }}
                    />
                  </Field>
                  <Field label="Estado" id="edit-state">
                    <input
                      id="edit-state"
                      type="text"
                      value={stateField}
                      onChange={(e) => { setStateField(e.target.value); markDirty(); }}
                      className={inputClass}
                      style={{ minHeight: '44px' }}
                    />
                  </Field>
                  <Field label="Código postal" id="edit-zipCode" error={formErrors.zipCode}>
                    <input
                      id="edit-zipCode"
                      type="text"
                      value={zipCode}
                      onChange={(e) => { setZipCode(e.target.value); markDirty(); }}
                      maxLength={5}
                      className={formErrors.zipCode ? inputErrorClass : inputClass}
                      style={{ minHeight: '44px' }}
                    />
                  </Field>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Notas
              </h3>
              <textarea
                value={notes}
                onChange={(e) => { setNotes(e.target.value); markDirty(); }}
                rows={3}
                className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                placeholder="Notas internas sobre el cliente..."
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
          {/* Contact info */}
          <AccountCard title="Información de contacto">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <InfoRow label="Correo electrónico" value={client.email} />
              <InfoRow label="Teléfono" value={client.phone} />
              <InfoRow label="RFC" value={client.rfc} />
              <InfoRow label="CURP" value={client.curp} />
            </div>
          </AccountCard>

          {/* Address */}
          {(client.address || client.city || client.state || client.zipCode) && (
            <AccountCard title="Domicilio">
              <div className="flex items-start gap-2 text-sm text-zinc-700">
                <MapPinIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-400" />
                <div>
                  {client.address && <p>{client.address}</p>}
                  <p>
                    {[client.city, client.state, client.zipCode].filter(Boolean).join(', ')}
                  </p>
                </div>
              </div>
            </AccountCard>
          )}

          {/* Notes */}
          {client.notes && (
            <AccountCard title="Notas">
              <p className="whitespace-pre-wrap text-sm text-zinc-700">{client.notes}</p>
            </AccountCard>
          )}

          {/* Linked policies */}
          <AccountCard title="Pólizas vinculadas">
            {linkedPolicies.length === 0 ? (
              <div className="text-center py-4">
                <ClipboardDocumentListIcon className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
                <p className="text-sm text-zinc-500">Este cliente no tiene pólizas vinculadas</p>
                <Link
                  href="/policies"
                  className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  Ir a Pólizas
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {linkedPolicies.map((policy) => (
                  <LinkedPolicyCard key={policy.policyId} policy={policy} />
                ))}
              </div>
            )}
          </AccountCard>

          {/* Activity timeline */}
          <AccountCard title="Actividades">
            <ActivityTimeline entityType="CLIENT" entityId={clientId} />
          </AccountCard>

          {/* Create opportunity */}
          <Link
            href={`/oportunidades/nueva?clientId=${clientId}&entityName=${encodeURIComponent(fullName)}`}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
            style={{ minHeight: '44px' }}
          >
            Crear oportunidad
          </Link>
        </>
      )}

      {/* ── ARCHIVE / UNARCHIVE SECTION ─────────────────────────────────── */}
      {!isEditMode && (
        <div className="mt-2">
          {!showArchiveConfirm ? (
            <button
              onClick={() => setShowArchiveConfirm(true)}
              className={`w-full rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                client.status === 'active'
                  ? 'border-zinc-300 text-zinc-600 hover:bg-zinc-50'
                  : 'border-green-200 text-green-700 hover:bg-green-50'
              }`}
              style={{ minHeight: '44px' }}
            >
              <span className="inline-flex items-center gap-2">
                {client.status === 'active' ? (
                  <>
                    <ArchiveBoxIcon className="h-4 w-4" />
                    Archivar cliente
                  </>
                ) : (
                  <>
                    <ArchiveBoxXMarkIcon className="h-4 w-4" />
                    Reactivar cliente
                  </>
                )}
              </span>
            </button>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="mb-1 text-sm font-semibold text-zinc-900">
                {client.status === 'active'
                  ? '¿Archivar este cliente?'
                  : '¿Reactivar este cliente?'}
              </p>
              <p className="mb-4 text-xs text-zinc-500">
                {client.status === 'active'
                  ? 'El cliente seguirá existiendo pero no aparecerá en la lista principal.'
                  : 'El cliente volverá a aparecer como activo en la lista.'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleArchiveToggle}
                  disabled={isArchiving}
                  className="flex-1 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
                  style={{ minHeight: '44px' }}
                >
                  {isArchiving
                    ? 'Procesando...'
                    : client.status === 'active'
                    ? 'Sí, archivar'
                    : 'Sí, reactivar'}
                </button>
                <button
                  onClick={() => setShowArchiveConfirm(false)}
                  disabled={isArchiving}
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

      {/* ── DELETE SECTION ────────────────────────────────────────────────── */}
      {!isEditMode && (
        <div className="mt-2">
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full rounded-lg border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              style={{ minHeight: '44px' }}
            >
              <span className="inline-flex items-center gap-2">
                <TrashIcon className="h-4 w-4" />
                Eliminar cliente
              </span>
            </button>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="mb-1 text-sm font-semibold text-red-900">
                ¿Eliminar este cliente permanentemente?
              </p>
              <p className="mb-4 text-xs text-red-700">
                El cliente será eliminado. Las pólizas vinculadas no se borrarán, pero pasarán a estado de revisión.
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
