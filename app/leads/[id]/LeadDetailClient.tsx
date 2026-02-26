'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  EnvelopeIcon,
  PhoneIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import {
  leadsApi,
  Lead,
  PatchLeadData,
  ProductInterest,
  LeadSource,
  LeadStatus,
  NextActionType,
  ConvertLeadResponse,
} from '@/lib/api/leadsApi';
import { ApiError } from '@/lib/api-client';
import { useDirtyFormGuard } from '@/lib/hooks/useDirtyFormGuard';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import AccountCard from '@/components/account/AccountCard';
import LeadStatusBadge from '@/components/leads/LeadStatusBadge';
import LeadTimeline from '@/components/leads/LeadTimeline';
import ActivityTimeline from '@/components/activities/ActivityTimeline';

// ── Validation ───────────────────────────────────────────────────────────────

const PHONE_REGEX = /^[\d\s\-+().]{7,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormErrors {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
}

function validatePatch(fields: { firstName: string; lastName: string; phone: string; email: string }): FormErrors {
  const errors: FormErrors = {};
  if (!fields.firstName.trim()) errors.firstName = 'El nombre es requerido';
  if (!fields.lastName.trim()) errors.lastName = 'El apellido es requerido';
  if (!fields.phone.trim()) {
    errors.phone = 'El telefono es requerido';
  } else if (!PHONE_REGEX.test(fields.phone.trim())) {
    errors.phone = 'Telefono invalido';
  }
  if (fields.email.trim() && !EMAIL_REGEX.test(fields.email.trim())) {
    errors.email = 'Correo electronico invalido';
  }
  return errors;
}

// ── Display helpers ──────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), "d 'de' MMMM yyyy", { locale: es });
  } catch {
    return dateStr;
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

const productLabels: Record<ProductInterest, string> = {
  AUTO: 'Auto',
  VIDA: 'Vida',
  GMM: 'GMM',
  HOGAR: 'Hogar',
  PYME: 'PyME',
  OTRO: 'Otro',
};

const sourceLabels: Record<LeadSource, string> = {
  WHATSAPP: 'WhatsApp',
  REFERIDO: 'Referido',
  WEB: 'Web',
  FACEBOOK: 'Facebook',
  EVENTO: 'Evento',
  OTRO: 'Otro',
};

const nextActionLabels: Record<NextActionType, string> = {
  CALL: 'Llamada',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  MEETING: 'Reunion',
  FOLLOWUP: 'Seguimiento',
};

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const inputErrorClass =
  'w-full rounded-lg border border-red-400 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500';
const selectClass =
  'w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white';

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

function getInitials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

// ── Main component ───────────────────────────────────────────────────────────

export default function LeadDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();

  // Static export: extract real ID from pathname
  const leadId = pathname.split('/').filter(Boolean)[1] || params?.id || '';

  const [lead, setLead] = useState<Lead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [convertResult, setConvertResult] = useState<ConvertLeadResponse | null>(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Log contact form
  const [showLogForm, setShowLogForm] = useState(false);
  const [logType, setLogType] = useState<NextActionType>('CALL');
  const [logNote, setLogNote] = useState('');
  const [isLogging, setIsLogging] = useState(false);

  // Edit form fields
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editProductInterest, setEditProductInterest] = useState<ProductInterest | ''>('');
  const [editSource, setEditSource] = useState<LeadSource | ''>('');
  const [editSourceDetail, setEditSourceDetail] = useState('');
  const [editNextActionAt, setEditNextActionAt] = useState('');
  const [editNextActionType, setEditNextActionType] = useState<NextActionType | ''>('');
  const [editNotes, setEditNotes] = useState('');

  const { markDirty, markClean, guardedNavigate } = useDirtyFormGuard();

  const populateForm = useCallback((l: Lead) => {
    const nameParts = l.fullName.trim().split(' ');
    setEditFirstName(nameParts[0] || '');
    setEditLastName(nameParts.slice(1).join(' ') || '');
    setEditPhone(l.phone);
    setEditEmail(l.email ?? '');
    setEditProductInterest(l.productInterest);
    setEditSource(l.source ?? '');
    setEditSourceDetail(l.sourceDetail ?? '');
    setEditNextActionAt(
      l.nextActionAt ? l.nextActionAt.split('T')[0] : ''
    );
    setEditNextActionType(l.nextActionType ?? '');
    setEditNotes(l.notes ?? '');
  }, []);

  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    leadsApi
      .getLead(leadId)
      .then((data) => {
        if (cancelled) return;
        setLead(data);
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
          setLoadError('Error al cargar el lead');
        }
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [leadId, populateForm]);

  const handleSave = async () => {
    const validationErrors = validatePatch({
      firstName: editFirstName,
      lastName: editLastName,
      phone: editPhone,
      email: editEmail,
    });
    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors);
      return;
    }
    setFormErrors({});
    setSaveError('');
    setIsSaving(true);

    const data: PatchLeadData = {
      fullName: `${editFirstName.trim()} ${editLastName.trim()}`,
      phone: editPhone.trim(),
      email: editEmail.trim() || null,
      productInterest: editProductInterest || undefined,
      source: editSource || null,
      sourceDetail: editSourceDetail.trim() || null,
      nextActionAt: editNextActionAt || null,
      nextActionType: editNextActionType || null,
      notes: editNotes.trim() || null,
    };

    try {
      const updated = await leadsApi.patchLead(leadId, data);
      setLead(updated);
      populateForm(updated);
      setIsEditMode(false);
      markClean();
      showSuccess('Lead actualizado exitosamente');
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
    if (lead) populateForm(lead);
    setIsEditMode(false);
    setFormErrors({});
    setSaveError('');
    markClean();
  };

  const handleStatusChange = async (newStatus: LeadStatus) => {
    if (!lead || newStatus === lead.status) {
      setShowStatusDropdown(false);
      return;
    }
    setIsUpdatingStatus(true);
    setShowStatusDropdown(false);
    try {
      const updated = await leadsApi.patchLead(leadId, { status: newStatus });
      setLead(updated);
      showSuccess('Estado actualizado');
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al actualizar el estado');
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleLogContact = async () => {
    if (!logNote.trim() && !logType) return;
    setIsLogging(true);
    try {
      const updated = await leadsApi.logContact(leadId, {
        type: logType,
        note: logNote.trim(),
      });
      setLead(updated);
      setLogNote('');
      setLogType('CALL');
      setShowLogForm(false);
      showSuccess('Contacto registrado');
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al registrar el contacto');
      }
    } finally {
      setIsLogging(false);
    }
  };

  const handleConvert = async () => {
    setIsConverting(true);
    try {
      const result = await leadsApi.convertLead(leadId);
      setConvertResult(result);
      setShowConvertConfirm(false);

      if (result.action === 'duplicate_found' && result.existingClient) {
        showInfo(
          `Se encontro un cliente existente: ${result.existingClient.firstName} ${result.existingClient.lastName}`
        );
      } else if (result.success) {
        showSuccess('Lead convertido a cliente exitosamente');
        // Reload lead to show converted state
        const updated = await leadsApi.getLead(leadId);
        setLead(updated);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al convertir el lead');
      }
    } finally {
      setIsConverting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await leadsApi.deleteLead(leadId);
      markClean();
      showSuccess('Lead eliminado exitosamente');
      router.push('/leads');
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Error al eliminar el lead');
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
        <p className="mb-2 text-lg font-semibold text-zinc-900">Lead no encontrado</p>
        <p className="mb-6 text-sm text-zinc-500">El lead que buscas no existe o fue eliminado.</p>
        <button
          onClick={() => router.push('/leads')}
          className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Volver a Leads
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{loadError}</div>
    );
  }

  if (!lead) return null;

  const initials = getInitials(lead.fullName);
  const isConverted = !!lead.convertedClientId;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Back button */}
      <div className="mb-6">
        <button
          onClick={() => guardedNavigate('/leads', router)}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← Mis leads
        </button>
      </div>

      {/* Header card */}
      <div className="mb-6 rounded-xl border border-zinc-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100">
              <span className="text-sm font-bold text-indigo-700">{initials}</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-zinc-900 truncate">{lead.fullName}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {/* Status badge — clickable to change */}
                <div className="relative">
                  <button
                    onClick={() => setShowStatusDropdown((v) => !v)}
                    disabled={isUpdatingStatus}
                    className="focus:outline-none"
                    title="Cambiar estado"
                  >
                    <LeadStatusBadge status={lead.status} size="md" />
                  </button>
                  {showStatusDropdown && (
                    <div className="absolute left-0 top-full z-10 mt-1 min-w-[130px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                      {(['NEW', 'CONTACTED', 'QUOTING', 'WON', 'LOST'] as LeadStatus[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          className={`block w-full px-4 py-2 text-left text-xs hover:bg-zinc-50 ${
                            lead.status === s ? 'font-semibold text-blue-600' : 'text-zinc-700'
                          }`}
                        >
                          <LeadStatusBadge status={s} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Product badge */}
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600">
                  {productLabels[lead.productInterest]}
                </span>
                {isConverted && (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                    Convertido
                  </span>
                )}
              </div>
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

        {/* Contact row */}
        {!isEditMode && (lead.phone || lead.email) && (
          <div className="mt-4 flex flex-wrap gap-4 border-t border-zinc-100 pt-4">
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="flex items-center gap-1.5 text-sm text-zinc-600 hover:text-blue-600 transition-colors"
              >
                <PhoneIcon className="h-4 w-4" />
                {lead.phone}
              </a>
            )}
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                className="flex items-center gap-1.5 text-sm text-zinc-600 hover:text-blue-600 transition-colors"
              >
                <EnvelopeIcon className="h-4 w-4" />
                {lead.email}
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── EDIT MODE ──────────────────────────────────────────────────────── */}
      {isEditMode && (
        <AccountCard title="Editar lead">
          {saveError && (
            <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{saveError}</div>
          )}
          <div className="space-y-6">
            {/* Identity */}
            <div>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Datos del prospecto
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nombre(s) *" id="edit-firstName" error={formErrors.firstName}>
                  <input
                    id="edit-firstName"
                    type="text"
                    value={editFirstName}
                    onChange={(e) => { setEditFirstName(e.target.value); markDirty(); }}
                    className={formErrors.firstName ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                    autoComplete="given-name"
                  />
                </Field>
                <Field label="Apellido(s) *" id="edit-lastName" error={formErrors.lastName}>
                  <input
                    id="edit-lastName"
                    type="text"
                    value={editLastName}
                    onChange={(e) => { setEditLastName(e.target.value); markDirty(); }}
                    className={formErrors.lastName ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                    autoComplete="family-name"
                  />
                </Field>
                <Field label="Telefono *" id="edit-phone" error={formErrors.phone}>
                  <input
                    id="edit-phone"
                    type="tel"
                    value={editPhone}
                    onChange={(e) => { setEditPhone(e.target.value); markDirty(); }}
                    className={formErrors.phone ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                  />
                </Field>
                <Field label="Correo electronico" id="edit-email" error={formErrors.email}>
                  <input
                    id="edit-email"
                    type="email"
                    value={editEmail}
                    onChange={(e) => { setEditEmail(e.target.value); markDirty(); }}
                    className={formErrors.email ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                  />
                </Field>
                <Field label="Producto de interes" id="edit-productInterest">
                  <select
                    id="edit-productInterest"
                    value={editProductInterest}
                    onChange={(e) => { setEditProductInterest(e.target.value as ProductInterest); markDirty(); }}
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
              </div>
            </div>

            {/* Origin */}
            <div>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Origen
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Fuente" id="edit-source">
                  <select
                    id="edit-source"
                    value={editSource}
                    onChange={(e) => {
                      setEditSource(e.target.value as LeadSource | '');
                      markDirty();
                      if (!e.target.value) setEditSourceDetail('');
                    }}
                    className={selectClass}
                    style={{ minHeight: '44px' }}
                  >
                    <option value="">Sin especificar</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="REFERIDO">Referido</option>
                    <option value="WEB">Web</option>
                    <option value="FACEBOOK">Facebook</option>
                    <option value="EVENTO">Evento</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </Field>
                {editSource && (
                  <Field label="Detalle de la fuente" id="edit-sourceDetail">
                    <input
                      id="edit-sourceDetail"
                      type="text"
                      value={editSourceDetail}
                      onChange={(e) => { setEditSourceDetail(e.target.value); markDirty(); }}
                      className={inputClass}
                      style={{ minHeight: '44px' }}
                    />
                  </Field>
                )}
              </div>
            </div>

            {/* Next action */}
            <div>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Proxima accion
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Fecha" id="edit-nextActionAt">
                  <input
                    id="edit-nextActionAt"
                    type="date"
                    value={editNextActionAt}
                    onChange={(e) => { setEditNextActionAt(e.target.value); markDirty(); }}
                    className={inputClass}
                    style={{ minHeight: '44px' }}
                  />
                </Field>
                <Field label="Tipo de accion" id="edit-nextActionType">
                  <select
                    id="edit-nextActionType"
                    value={editNextActionType}
                    onChange={(e) => { setEditNextActionType(e.target.value as NextActionType | ''); markDirty(); }}
                    className={selectClass}
                    style={{ minHeight: '44px' }}
                  >
                    <option value="">Sin especificar</option>
                    <option value="CALL">Llamada</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="EMAIL">Email</option>
                    <option value="MEETING">Reunion</option>
                    <option value="FOLLOWUP">Seguimiento</option>
                  </select>
                </Field>
              </div>
            </div>

            {/* Notes */}
            <div>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Notas
              </h3>
              <textarea
                value={editNotes}
                onChange={(e) => { setEditNotes(e.target.value); markDirty(); }}
                rows={3}
                className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                placeholder="Notas internas sobre el prospecto..."
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
          {/* Quick info row */}
          <AccountCard title="Informacion del lead">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <InfoRow label="Fuente" value={lead.source ? sourceLabels[lead.source] : null} />
              {lead.sourceDetail && (
                <InfoRow label="Detalle fuente" value={lead.sourceDetail} />
              )}
              <InfoRow label="Creado" value={formatDate(lead.createdAt)} />
              <InfoRow label="Ultimo contacto" value={formatDate(lead.lastContactAt)} />
            </div>
          </AccountCard>

          {/* Next action */}
          {(lead.nextActionAt || lead.nextActionType) && (
            <AccountCard title="Proxima accion">
              <div className="flex items-start gap-3">
                <CalendarDaysIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-zinc-400" />
                <div>
                  {lead.nextActionAt && (
                    <p className="text-sm font-medium text-zinc-900">
                      {formatDate(lead.nextActionAt)}
                    </p>
                  )}
                  {lead.nextActionType && (
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {nextActionLabels[lead.nextActionType]}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setIsEditMode(true)}
                  className="ml-auto text-xs text-blue-600 hover:underline"
                >
                  Editar
                </button>
              </div>
            </AccountCard>
          )}

          {/* Notes */}
          {lead.notes && (
            <AccountCard title="Notas">
              <p className="whitespace-pre-wrap text-sm text-zinc-700">{lead.notes}</p>
            </AccountCard>
          )}

          {/* Timeline */}
          <AccountCard title="Historial de contacto">
            <div className="mb-4">
              {!showLogForm ? (
                <button
                  onClick={() => setShowLogForm(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  + Registrar contacto
                </button>
              ) : (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 mb-4">
                  <h4 className="mb-3 text-sm font-semibold text-zinc-700">Nuevo registro</h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-600">
                        Tipo de contacto
                      </label>
                      <select
                        value={logType}
                        onChange={(e) => setLogType(e.target.value as NextActionType)}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        style={{ minHeight: '40px' }}
                      >
                        <option value="CALL">Llamada</option>
                        <option value="WHATSAPP">WhatsApp</option>
                        <option value="EMAIL">Email</option>
                        <option value="MEETING">Reunion</option>
                        <option value="FOLLOWUP">Seguimiento</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-zinc-600">
                        Nota
                      </label>
                      <textarea
                        value={logNote}
                        onChange={(e) => setLogNote(e.target.value)}
                        placeholder="¿Como fue el contacto? Que se acordo..."
                        rows={2}
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={handleLogContact}
                      disabled={isLogging}
                      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
                      style={{ minHeight: '36px' }}
                    >
                      {isLogging ? 'Guardando...' : 'Registrar'}
                    </button>
                    <button
                      onClick={() => { setShowLogForm(false); setLogNote(''); }}
                      disabled={isLogging}
                      className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                      style={{ minHeight: '36px' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <LeadTimeline entries={lead.timeline} />
          </AccountCard>

          {/* Activity timeline */}
          <AccountCard title="Actividades">
            <ActivityTimeline entityType="LEAD" entityId={leadId} />
          </AccountCard>

          {/* Create opportunity */}
          <Link
            href={`/oportunidades/nueva?leadId=${leadId}&entityName=${encodeURIComponent(lead.fullName)}`}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
            style={{ minHeight: '44px' }}
          >
            Crear oportunidad
          </Link>
        </>
      )}

      {/* ── CONVERT TO CLIENT ──────────────────────────────────────────────── */}
      {!isEditMode && (
        <div className="mt-2">
          {isConverted ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-green-900">
                    Lead convertido a cliente
                  </p>
                  {lead.convertedAt && (
                    <p className="text-xs text-green-700 mt-0.5">
                      Convertido el {formatDate(lead.convertedAt)}
                    </p>
                  )}
                </div>
                <Link
                  href={`/clients/${lead.convertedClientId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  Ver cliente
                </Link>
              </div>
            </div>
          ) : !showConvertConfirm ? (
            <button
              onClick={() => setShowConvertConfirm(true)}
              className="w-full rounded-lg border border-green-300 px-4 py-3 text-sm font-medium text-green-700 hover:bg-green-50 transition-colors"
              style={{ minHeight: '44px' }}
            >
              <span className="inline-flex items-center gap-2">
                <UserPlusIcon className="h-4 w-4" />
                Convertir a cliente
              </span>
            </button>
          ) : (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <p className="mb-1 text-sm font-semibold text-green-900">
                Convertir este lead a cliente
              </p>
              <p className="mb-4 text-xs text-green-700">
                Se creara un nuevo cliente con los datos de este lead. El lead quedara marcado como Ganado.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleConvert}
                  disabled={isConverting}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:bg-green-300"
                  style={{ minHeight: '44px' }}
                >
                  {isConverting ? 'Convirtiendo...' : 'Si, convertir'}
                </button>
                <button
                  onClick={() => setShowConvertConfirm(false)}
                  disabled={isConverting}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  style={{ minHeight: '44px' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Show duplicate found result */}
          {convertResult?.action === 'duplicate_found' && convertResult.existingClient && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Cliente duplicado encontrado</p>
              <p className="mt-1 text-xs text-amber-700">
                Ya existe un cliente con datos similares:{' '}
                <strong>
                  {convertResult.existingClient.firstName} {convertResult.existingClient.lastName}
                </strong>
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/clients/${convertResult.existingClient.clientId}`}
                  className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700"
                >
                  Ver cliente existente
                </Link>
                <button
                  onClick={async () => {
                    setIsConverting(true);
                    try {
                      await leadsApi.convertLead(leadId, {
                        forceLink: true,
                        linkClientId: convertResult.existingClient!.clientId,
                      });
                      const updated = await leadsApi.getLead(leadId);
                      setLead(updated);
                      setConvertResult(null);
                      showSuccess('Lead vinculado al cliente existente');
                    } catch (err) {
                      if (err instanceof ApiError) showError(err.message);
                      else showError('Error al vincular el lead');
                    } finally {
                      setIsConverting(false);
                    }
                  }}
                  disabled={isConverting}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                >
                  Vincular a ese cliente
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
                Eliminar lead
              </span>
            </button>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="mb-1 text-sm font-semibold text-red-900">
                Eliminar este lead permanentemente?
              </p>
              <p className="mb-4 text-xs text-red-700">
                El lead y su historial de contacto seran eliminados. Esta accion no se puede deshacer.
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
