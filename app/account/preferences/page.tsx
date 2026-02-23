'use client';

import { useState, useEffect } from 'react';
import { profileApi, ApiError } from '@/lib/api-client';
import { useDirtyFormGuard } from '@/lib/hooks/useDirtyFormGuard';
import AccountCard from '@/components/account/AccountCard';

interface SavedPreferences {
  preferredLanguage: string;
  timeZone: string;
  emailNotificationsEnabled: boolean;
}

const SUPPORTED_LANGUAGES = [{ value: 'es', label: 'Español' }];

interface TzOption { value: string; label: string }
interface TzGroup { group: string; options: TzOption[] }

const TIMEZONE_GROUPS: TzGroup[] = [
  {
    group: 'Estados Unidos',
    options: [
      { value: 'America/New_York',    label: 'Este — Nueva York, Miami, Atlanta' },
      { value: 'America/Chicago',     label: 'Central — Chicago, Dallas, Houston' },
      { value: 'America/Denver',      label: 'Montaña — Denver, Salt Lake City' },
      { value: 'America/Phoenix',     label: 'Montaña sin DST — Phoenix' },
      { value: 'America/Los_Angeles', label: 'Pacífico — Los Ángeles, San Francisco' },
      { value: 'America/Anchorage',   label: 'Alaska' },
      { value: 'Pacific/Honolulu',    label: 'Hawái' },
    ],
  },
  {
    group: 'México',
    options: [
      { value: 'America/Mexico_City', label: 'Ciudad de México, Guadalajara, Monterrey' },
      { value: 'America/Cancun',      label: 'Cancún, Mérida, Chetumal' },
      { value: 'America/Chihuahua',   label: 'Chihuahua, Mazatlán' },
      { value: 'America/Tijuana',     label: 'Tijuana, Mexicali, Baja California' },
    ],
  },
  {
    group: 'Centroamérica y el Caribe',
    options: [
      { value: 'America/Guatemala',     label: 'Guatemala, El Salvador, Honduras' },
      { value: 'America/Costa_Rica',    label: 'Costa Rica' },
      { value: 'America/Managua',       label: 'Nicaragua' },
      { value: 'America/Panama',        label: 'Panamá' },
      { value: 'America/Havana',        label: 'Cuba' },
      { value: 'America/Puerto_Rico',   label: 'Puerto Rico' },
      { value: 'America/Santo_Domingo', label: 'República Dominicana' },
      { value: 'America/Jamaica',       label: 'Jamaica' },
    ],
  },
  {
    group: 'Sudamérica',
    options: [
      { value: 'America/Bogota',                  label: 'Colombia, Ecuador (oeste)' },
      { value: 'America/Guayaquil',               label: 'Ecuador' },
      { value: 'America/Lima',                    label: 'Perú' },
      { value: 'America/Caracas',                 label: 'Venezuela' },
      { value: 'America/La_Paz',                  label: 'Bolivia' },
      { value: 'America/Asuncion',                label: 'Paraguay' },
      { value: 'America/Argentina/Buenos_Aires',  label: 'Argentina' },
      { value: 'America/Montevideo',              label: 'Uruguay' },
      { value: 'America/Santiago',                label: 'Chile' },
    ],
  },
  {
    group: 'España',
    options: [
      { value: 'Europe/Madrid', label: 'España (Península y Baleares)' },
      { value: 'Atlantic/Canary', label: 'España (Islas Canarias)' },
    ],
  },
];

const ALL_TZ_VALUES = TIMEZONE_GROUPS.flatMap((g) => g.options.map((o) => o.value));

export default function PreferencesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [saved, setSaved] = useState<SavedPreferences>({
    preferredLanguage: 'es',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    emailNotificationsEnabled: true,
  });

  const [preferredLanguage, setPreferredLanguage] = useState('es');
  const [timeZone, setTimeZone] = useState('');
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);

  const { markDirty, markClean } = useDirtyFormGuard();

  const isDirty =
    preferredLanguage !== saved.preferredLanguage ||
    timeZone !== saved.timeZone ||
    emailNotificationsEnabled !== saved.emailNotificationsEnabled;

  useEffect(() => {
    if (isDirty) markDirty();
    else markClean();
  }, [isDirty, markDirty, markClean]);

  useEffect(() => {
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const load = async () => {
      try {
        setIsLoading(true);
        setError('');
        const data = await profileApi.getProfile();
        const prefs: SavedPreferences = {
          preferredLanguage: data.preferredLanguage || 'es',
          timeZone: data.timeZone || detectedTz,
          emailNotificationsEnabled: data.emailNotificationsEnabled ?? true,
        };
        setSaved(prefs);
        setPreferredLanguage(prefs.preferredLanguage);
        setTimeZone(prefs.timeZone);
        setEmailNotificationsEnabled(prefs.emailNotificationsEnabled);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Error al cargar las preferencias');
        }
        // Use detected timezone as fallback
        setTimeZone(detectedTz);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const handleSave = async () => {
    setError('');
    setSuccess('');
    try {
      setIsSaving(true);
      await profileApi.updateProfile({ preferredLanguage, timeZone, emailNotificationsEnabled });
      const updated: SavedPreferences = { preferredLanguage, timeZone, emailNotificationsEnabled };
      setSaved(updated);
      markClean();
      setSuccess('Preferencias guardadas correctamente');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Error al guardar las preferencias');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setPreferredLanguage(saved.preferredLanguage);
    setTimeZone(saved.timeZone);
    setEmailNotificationsEnabled(saved.emailNotificationsEnabled);
    setError('');
    setSuccess('');
    markClean();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-lg text-zinc-600">Cargando...</div>
      </div>
    );
  }

  return (
    <AccountCard title="Preferencias" description="Configura tu idioma, zona horaria y notificaciones.">
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-600">{success}</div>
      )}

      <div className="space-y-6">
        {/* Language */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Idioma</label>
          <select
            value={preferredLanguage}
            onChange={(e) => setPreferredLanguage(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        {/* Timezone */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Zona horaria</label>
          <select
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {/* Fallback option if saved value isn't in the curated list */}
            {timeZone && !ALL_TZ_VALUES.includes(timeZone) && (
              <option value={timeZone}>{timeZone}</option>
            )}
            {TIMEZONE_GROUPS.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.options.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Email notifications toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-700">Notificaciones por email</p>
            <p className="text-xs text-zinc-500">Recibe actualizaciones importantes por correo</p>
          </div>
          <button
            role="switch"
            aria-checked={emailNotificationsEnabled}
            onClick={() => setEmailNotificationsEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              emailNotificationsEnabled ? 'bg-blue-600' : 'bg-zinc-200'
            }`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                emailNotificationsEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="flex-1 rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
          style={{ minHeight: '44px' }}
        >
          {isSaving ? 'Guardando...' : 'Guardar'}
        </button>
        {isDirty && (
          <button
            onClick={handleDiscard}
            disabled={isSaving}
            className="flex-1 rounded-lg border border-zinc-300 px-6 py-3 font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100"
            style={{ minHeight: '44px' }}
          >
            Descartar cambios
          </button>
        )}
      </div>
    </AccountCard>
  );
}
