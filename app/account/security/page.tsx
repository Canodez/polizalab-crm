'use client';

import { useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { securityApi } from '@/lib/api/securityApi';
import AccountCard from '@/components/account/AccountCard';

type PasswordStrength = 'weak' | 'medium' | 'strong';

function getPasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) return 'weak';
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const score = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
  if (password.length >= 12 && score >= 3) return 'strong';
  if (score >= 2) return 'medium';
  return 'weak';
}

const strengthConfig = {
  weak:   { label: 'Débil',   color: 'bg-red-500',    textColor: 'text-red-600' },
  medium: { label: 'Media',   color: 'bg-yellow-500', textColor: 'text-yellow-600' },
  strong: { label: 'Fuerte',  color: 'bg-green-500',  textColor: 'text-green-600' },
};

export default function SecurityPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const strength = newPassword ? getPasswordStrength(newPassword) : null;

  const getValidationError = (): string => {
    if (!currentPassword) return 'La contraseña actual es requerida';
    if (newPassword.length < 8) return 'La nueva contraseña debe tener al menos 8 caracteres';
    if (newPassword !== confirmPassword) return 'Las contraseñas no coinciden';
    return '';
  };

  const validationError = getValidationError();
  const canSave = !validationError && currentPassword && newPassword && confirmPassword;

  const handleSave = async () => {
    setError('');
    setSuccess('');

    const err = getValidationError();
    if (err) {
      setError(err);
      return;
    }

    try {
      setIsSaving(true);
      await securityApi.changePassword(currentPassword, newPassword);
      setSuccess('Contraseña actualizada correctamente');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar la contraseña');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AccountCard title="Cambiar contraseña" description="Actualiza tu contraseña de acceso.">
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-600">{success}</div>
      )}

      <div className="space-y-4">
        {/* Current password */}
        <div>
          <label htmlFor="current-password" className="mb-1 block text-sm font-medium text-zinc-700">
            Contraseña actual
          </label>
          <div className="relative">
            <input
              id="current-password"
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 pr-12 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              style={{ minHeight: '44px' }}
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700"
              aria-label={showCurrent ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showCurrent ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* New password */}
        <div>
          <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-zinc-700">
            Nueva contraseña
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 pr-12 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              style={{ minHeight: '44px' }}
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700"
              aria-label={showNew ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showNew ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
          {/* Password strength indicator */}
          {newPassword && strength && (
            <div className="mt-2">
              <div className="flex gap-1 mb-1">
                {(['weak', 'medium', 'strong'] as PasswordStrength[]).map((level, i) => {
                  const levelIndex = ['weak', 'medium', 'strong'].indexOf(strength);
                  const isActive = i <= levelIndex;
                  return (
                    <div
                      key={level}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        isActive ? strengthConfig[strength].color : 'bg-zinc-200'
                      }`}
                    />
                  );
                })}
              </div>
              <p className={`text-xs ${strengthConfig[strength].textColor}`}>
                Seguridad: {strengthConfig[strength].label}
              </p>
            </div>
          )}
          <p className="mt-1 text-xs text-zinc-500">Mínimo 8 caracteres</p>
        </div>

        {/* Confirm password */}
        <div>
          <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-zinc-700">
            Confirmar nueva contraseña
          </label>
          <div className="relative">
            <input
              id="confirm-password"
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 pr-12 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              style={{ minHeight: '44px' }}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700"
              aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showConfirm ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="mt-1 text-xs text-red-600">Las contraseñas no coinciden</p>
          )}
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className="w-full rounded-lg bg-zinc-900 px-6 py-3 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
          style={{ minHeight: '44px' }}
        >
          {isSaving ? 'Actualizando...' : 'Actualizar contraseña'}
        </button>
      </div>
    </AccountCard>
  );
}
