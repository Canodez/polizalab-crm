'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import {
  leadsApi,
  ProductInterest,
  LeadSource,
  NextActionType,
} from '@/lib/api/leadsApi';
import { ApiError } from '@/lib/api-client';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { useDirtyFormGuard } from '@/lib/hooks/useDirtyFormGuard';

// ── Validation ───────────────────────────────────────────────────────────────

const PHONE_REGEX = /^[\d\s\-+().]{7,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormErrors {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  productInterest?: string;
}

function validate(fields: {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  productInterest: string;
}): FormErrors {
  const errors: FormErrors = {};
  if (!fields.firstName.trim()) errors.firstName = 'El nombre es requerido';
  if (!fields.lastName.trim()) errors.lastName = 'El apellido es requerido';
  if (!fields.phone.trim()) {
    errors.phone = 'El telefono es requerido';
  } else if (!PHONE_REGEX.test(fields.phone.trim())) {
    errors.phone = 'Telefono invalido (ej. 55 1234 5678)';
  }
  if (fields.email.trim() && !EMAIL_REGEX.test(fields.email.trim())) {
    errors.email = 'Correo electronico invalido';
  }
  if (!fields.productInterest) errors.productInterest = 'Selecciona el producto de interes';
  return errors;
}

// ── Field component ──────────────────────────────────────────────────────────

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
const selectClass =
  'w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white';
const selectErrorClass =
  'w-full rounded-lg border border-red-400 px-4 py-3 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 bg-white';

// ── Main component ───────────────────────────────────────────────────────────

export default function NuevoLeadPage() {
  const router = useRouter();
  const { markDirty, markClean, guardedNavigate } = useDirtyFormGuard();

  // Required fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [productInterest, setProductInterest] = useState<ProductInterest | ''>('');

  // Optional fields
  const [email, setEmail] = useState('');
  const [source, setSource] = useState<LeadSource | ''>('');
  const [sourceDetail, setSourceDetail] = useState('');
  const [nextActionAt, setNextActionAt] = useState('');
  const [nextActionType, setNextActionType] = useState<NextActionType | ''>('');
  const [notes, setNotes] = useState('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleChange = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string>>) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setter(e.target.value);
        markDirty();
      },
    [markDirty]
  );

  const handleSubmit = async () => {
    const validationErrors = validate({ firstName, lastName, phone, email, productInterest });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitError('');
    setIsSubmitting(true);

    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const result = await leadsApi.createLead({
        fullName,
        phone: phone.trim(),
        productInterest: productInterest as ProductInterest,
        email: email.trim() || null,
        source: source || null,
        sourceDetail: sourceDetail.trim() || null,
        nextActionAt: nextActionAt || null,
        nextActionType: nextActionType || null,
        notes: notes.trim() || null,
      });

      markClean();

      if (!result.created && result.duplicateOf) {
        showInfo('Ya existe un lead con ese telefono. Redirigiendo al lead existente...');
        router.push(`/leads/${result.duplicateOf}`);
        return;
      }

      showSuccess('Lead creado exitosamente');
      router.push(`/leads/${result.lead.leadId}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
        showError(err.message);
      } else {
        setSubmitError('Error al crear el lead. Intenta nuevamente.');
        showError('Error al crear el lead');
      }
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Back link */}
      <div className="mb-6">
        <button
          onClick={() => guardedNavigate('/leads', router)}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Mis leads
        </button>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-xl font-semibold text-zinc-900">Nuevo lead</h2>
        <p className="mb-6 text-sm text-zinc-500">
          Completa los datos del prospecto. Los campos marcados con * son obligatorios.
        </p>

        {submitError && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600">{submitError}</div>
        )}

        <div className="space-y-6">
          {/* Basic info */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Datos del prospecto
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre(s)" id="firstName" error={errors.firstName} required>
                <input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={handleChange(setFirstName)}
                  placeholder="Juan Carlos"
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
                  placeholder="Perez Garcia"
                  className={errors.lastName ? inputErrorClass : inputClass}
                  style={{ minHeight: '44px' }}
                  autoComplete="family-name"
                />
              </Field>

              <Field label="Telefono" id="phone" error={errors.phone} required>
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

              <Field label="Correo electronico" id="email" error={errors.email}>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={handleChange(setEmail)}
                  placeholder="juan@ejemplo.com"
                  className={errors.email ? inputErrorClass : inputClass}
                  style={{ minHeight: '44px' }}
                  autoComplete="email"
                />
              </Field>

              <Field label="Producto de interes" id="productInterest" error={errors.productInterest} required>
                <select
                  id="productInterest"
                  value={productInterest}
                  onChange={(e) => {
                    setProductInterest(e.target.value as ProductInterest | '');
                    markDirty();
                  }}
                  className={errors.productInterest ? selectErrorClass : selectClass}
                  style={{ minHeight: '44px' }}
                >
                  <option value="">Seleccionar producto...</option>
                  <option value="AUTO">Auto</option>
                  <option value="VIDA">Vida</option>
                  <option value="GMM">GMM (Gastos Medicos Mayores)</option>
                  <option value="HOGAR">Hogar</option>
                  <option value="PYME">PyME</option>
                  <option value="OTRO">Otro</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Origin */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Origen
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Fuente" id="source">
                <select
                  id="source"
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value as LeadSource | '');
                    markDirty();
                    if (!e.target.value) setSourceDetail('');
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

              {source && (
                <Field label="Detalle de la fuente" id="sourceDetail">
                  <input
                    id="sourceDetail"
                    type="text"
                    value={sourceDetail}
                    onChange={handleChange(setSourceDetail)}
                    placeholder={
                      source === 'REFERIDO'
                        ? 'Nombre de quien lo refirió...'
                        : source === 'EVENTO'
                        ? 'Nombre del evento...'
                        : 'Detalle adicional...'
                    }
                    className={inputClass}
                    style={{ minHeight: '44px' }}
                  />
                </Field>
              )}
            </div>
          </div>

          {/* Next action */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Proxima accion
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Fecha de proxima accion" id="nextActionAt">
                <input
                  id="nextActionAt"
                  type="date"
                  value={nextActionAt}
                  onChange={handleChange(setNextActionAt)}
                  className={inputClass}
                  style={{ minHeight: '44px' }}
                />
              </Field>

              <Field label="Tipo de accion" id="nextActionType">
                <select
                  id="nextActionType"
                  value={nextActionType}
                  onChange={(e) => {
                    setNextActionType(e.target.value as NextActionType | '');
                    markDirty();
                  }}
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
                placeholder="Informacion adicional sobre el prospecto..."
                rows={3}
                className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>
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
            {isSubmitting ? 'Creando lead...' : 'Crear lead'}
          </button>
          <Link
            href="/leads"
            className="flex-1 rounded-lg border border-zinc-300 px-6 py-3 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            style={{ minHeight: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            Cancelar
          </Link>
        </div>
      </div>
    </div>
  );
}
