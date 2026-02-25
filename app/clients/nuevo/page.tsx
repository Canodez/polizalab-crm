'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { clientsApi, ApiError, DuplicateCheckResponse } from '@/lib/api/clientsApi';
import { showSuccess, showError } from '@/lib/toast';
import { useDirtyFormGuard } from '@/lib/hooks/useDirtyFormGuard';

// ── Validation helpers ──────────────────────────────────────────────────────

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i;
const CURP_REGEX = /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{2}[A-Z]{3}[A-Z\d]\d$/i;
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

function validate(fields: {
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

// ── Duplicate modal ─────────────────────────────────────────────────────────

interface DuplicateModalProps {
  existingClient: NonNullable<DuplicateCheckResponse['existingClient']>;
  onViewExisting: () => void;
  onContinue: () => void;
  isSubmitting: boolean;
}

function DuplicateModal({ existingClient, onViewExisting, onContinue, isSubmitting }: DuplicateModalProps) {
  const displayName = existingClient.firstName && existingClient.lastName
    ? `${existingClient.firstName} ${existingClient.lastName}`
    : 'Cliente existente';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Cliente duplicado detectado</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Ya existe un cliente con el mismo {existingClient.field === 'rfc' ? 'RFC' : existingClient.field === 'email' ? 'email' : 'teléfono'}.
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-sm font-medium text-zinc-900">
            {displayName}
          </p>
          <p className="text-xs text-zinc-500">Campo coincidente: {existingClient.field}</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={onViewExisting}
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            style={{ minHeight: '44px' }}
          >
            Ver cliente existente
          </button>
          <button
            onClick={onContinue}
            disabled={isSubmitting}
            className="flex-1 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
            style={{ minHeight: '44px' }}
          >
            {isSubmitting ? 'Creando...' : 'Crear de todas formas'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Field component ─────────────────────────────────────────────────────────

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
const inputErrorClass =
  'w-full rounded-lg border border-red-400 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500';

// ── Main component ──────────────────────────────────────────────────────────

export default function NuevoClientePage() {
  const router = useRouter();
  const { markDirty, markClean, guardedNavigate } = useDirtyFormGuard();

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [rfc, setRfc] = useState('');
  const [curp, setCurp] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [notes, setNotes] = useState('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [duplicateClient, setDuplicateClient] = useState<DuplicateCheckResponse['existingClient'] | null>(null);
  const [forceContinue, setForceContinue] = useState(false);

  const handleChange = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string>>) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setter(e.target.value);
        markDirty();
      },
    [markDirty]
  );

  const handleSubmit = async (ignoreConflict = false) => {
    const fields = { firstName, lastName, rfc, curp, email, phone, zipCode };
    const validationErrors = validate(fields);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitError('');
    setIsSubmitting(true);

    try {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        rfc: rfc.trim().toUpperCase() || null,
        curp: curp.trim().toUpperCase() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        zipCode: zipCode.trim() || null,
        notes: notes.trim() || null,
      };

      if (!ignoreConflict) {
        // Try upsert first to detect duplicates
        const result = await clientsApi.upsertClient(payload);
        if (!result.created && result.matched) {
          // Existing client found — show modal
          setDuplicateClient({
            clientId: result.client.clientId,
            field: result.matched.field,
            firstName: result.client.firstName,
            lastName: result.client.lastName,
          });
          setIsSubmitting(false);
          return;
        }
        markClean();
        showSuccess('Cliente creado exitosamente');
        router.push(`/clients/${result.client.clientId}`);
      } else {
        // Force create
        const created = await clientsApi.createClient(payload);
        markClean();
        showSuccess('Cliente creado exitosamente');
        router.push(`/clients/${created.clientId}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 409) {
        // Conflict returned directly — trigger duplicate check
        try {
          const dupResult = await clientsApi.checkDuplicate({
            email: email.trim() || undefined,
            rfc: rfc.trim().toUpperCase() || undefined,
            phone: phone.trim() || undefined,
          });
          if (dupResult.isDuplicate && dupResult.existingClient) {
            setDuplicateClient(dupResult.existingClient);
            setIsSubmitting(false);
            return;
          }
        } catch {
          // Fallback to generic conflict message
        }
        setSubmitError(
          'Ya existe un cliente con este RFC, email o teléfono. Revisa los datos e intenta nuevamente.'
        );
      } else if (err instanceof ApiError) {
        setSubmitError(err.message);
        showError(err.message);
      } else {
        setSubmitError('Error al crear el cliente. Intenta nuevamente.');
        showError('Error al crear el cliente');
      }
      setIsSubmitting(false);
    }
  };

  const handleForceContinue = async () => {
    setForceContinue(true);
    setDuplicateClient(null);
    await handleSubmit(true);
    setForceContinue(false);
  };

  return (
    <>
      {duplicateClient && (
        <DuplicateModal
          existingClient={duplicateClient}
          onViewExisting={() => {
            setDuplicateClient(null);
            router.push(`/clients/${duplicateClient.clientId}`);
          }}
          onContinue={handleForceContinue}
          isSubmitting={forceContinue && isSubmitting}
        />
      )}

      <div>
        {/* Back link */}
        <div className="mb-6">
          <button
            onClick={() => guardedNavigate('/clients', router)}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Mis clientes
          </button>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-xl font-semibold text-zinc-900">Nuevo cliente</h2>
          <p className="mb-6 text-sm text-zinc-500">
            Completa los datos del cliente. Los campos marcados con * son obligatorios.
          </p>

          {submitError && (
            <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600">{submitError}</div>
          )}

          <div className="space-y-6">
            {/* Identity section */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Datos personales
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nombre" id="firstName" error={errors.firstName} required>
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={handleChange(setFirstName)}
                    placeholder="María"
                    className={errors.firstName ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                    autoComplete="given-name"
                  />
                </Field>

                <Field label="Apellido(s)" id="lastName" error={errors.lastName} required>
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={handleChange(setLastName)}
                    placeholder="García López"
                    className={errors.lastName ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                    autoComplete="family-name"
                  />
                </Field>

                <Field label="RFC" id="rfc" error={errors.rfc}>
                  <input
                    id="rfc"
                    type="text"
                    value={rfc}
                    onChange={handleChange(setRfc)}
                    placeholder="XAXX010101000"
                    maxLength={13}
                    className={errors.rfc ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                    autoComplete="off"
                  />
                </Field>

                <Field label="CURP" id="curp" error={errors.curp}>
                  <input
                    id="curp"
                    type="text"
                    value={curp}
                    onChange={handleChange(setCurp)}
                    placeholder="XAXX010101HDFXXX00"
                    maxLength={18}
                    className={errors.curp ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                    autoComplete="off"
                  />
                </Field>
              </div>
            </div>

            {/* Contact section */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Contacto
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Correo electrónico" id="email" error={errors.email}>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={handleChange(setEmail)}
                    placeholder="maria@ejemplo.com"
                    className={errors.email ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                    autoComplete="email"
                  />
                </Field>

                <Field label="Teléfono" id="phone" error={errors.phone}>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={handleChange(setPhone)}
                    placeholder="55 1234 5678"
                    className={errors.phone ? inputErrorClass : inputClass}
                    style={{ minHeight: '44px' }}
                    autoComplete="tel"
                  />
                </Field>
              </div>
            </div>

            {/* Address section */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Domicilio
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <Field label="Calle y número" id="address">
                  <input
                    id="address"
                    type="text"
                    value={address}
                    onChange={handleChange(setAddress)}
                    placeholder="Av. Reforma 123, Col. Centro"
                    className={inputClass}
                    style={{ minHeight: '44px' }}
                    autoComplete="street-address"
                  />
                </Field>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="Ciudad" id="city">
                    <input
                      id="city"
                      type="text"
                      value={city}
                      onChange={handleChange(setCity)}
                      placeholder="Ciudad de México"
                      className={inputClass}
                      style={{ minHeight: '44px' }}
                      autoComplete="address-level2"
                    />
                  </Field>

                  <Field label="Estado" id="state">
                    <input
                      id="state"
                      type="text"
                      value={state}
                      onChange={handleChange(setState)}
                      placeholder="CDMX"
                      className={inputClass}
                      style={{ minHeight: '44px' }}
                      autoComplete="address-level1"
                    />
                  </Field>

                  <Field label="Código postal" id="zipCode" error={errors.zipCode}>
                    <input
                      id="zipCode"
                      type="text"
                      value={zipCode}
                      onChange={handleChange(setZipCode)}
                      placeholder="06600"
                      maxLength={5}
                      className={errors.zipCode ? inputErrorClass : inputClass}
                      style={{ minHeight: '44px' }}
                      autoComplete="postal-code"
                    />
                  </Field>
                </div>
              </div>
            </div>

            {/* Notes section */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Notas
              </h3>
              <div>
                <label htmlFor="notes" className="mb-1 block text-sm font-medium text-zinc-700">
                  Notas internas
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={handleChange(setNotes)}
                  placeholder="Información adicional sobre el cliente..."
                  rows={3}
                  className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 flex gap-3">
            <button
              onClick={() => handleSubmit(false)}
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
              style={{ minHeight: '44px' }}
            >
              {isSubmitting ? 'Creando cliente...' : 'Crear cliente'}
            </button>
            <Link
              href="/clients"
              className="flex-1 rounded-lg border border-zinc-300 px-6 py-3 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              style={{ minHeight: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              Cancelar
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
