'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ComputerDesktopIcon, DevicePhoneMobileIcon } from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { sessionsApi, Session } from '@/lib/api/sessionsApi';
import AccountCard from '@/components/account/AccountCard';

function isMobileOS(device: string): boolean {
  return /iOS|Android/i.test(device);
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState('');

  useEffect(() => {
    let cancelled = false;
    sessionsApi.listSessions()
      .then((data) => { if (!cancelled) { setSessions(data); setIsLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError('No se pudo cargar la sesión'); setIsLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const handleRevokeAll = async () => {
    setRevokeError('');
    setIsRevoking(true);
    try {
      await sessionsApi.revokeAllOtherSessions();
      router.push('/login');
    } catch {
      setRevokeError('Error al cerrar sesión en todos los dispositivos');
      setIsRevoking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-zinc-500">Cargando...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <AccountCard title="Sesiones activas">
        <p className="text-sm text-red-600">{loadError}</p>
      </AccountCard>
    );
  }

  const session = sessions[0];

  return (
    <div className="space-y-6">
      <AccountCard title="Sesiones activas">
        {session && (
          <div className="flex items-center gap-4 rounded-lg border border-zinc-200 px-4 py-3">
            <div className="text-zinc-500">
              {isMobileOS(session.device)
                ? <DevicePhoneMobileIcon className="h-6 w-6" />
                : <ComputerDesktopIcon className="h-6 w-6" />
              }
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-900">{session.device}</p>
              <p className="text-xs text-zinc-500">
                {session.lastActivity
                  ? formatDistanceToNow(new Date(session.lastActivity), { addSuffix: true, locale: es })
                  : 'Sin actividad reciente'}
              </p>
            </div>
            <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
              Sesión actual
            </span>
          </div>
        )}
      </AccountCard>

      <AccountCard title="Zona de peligro" description="Cierra tu sesión en todos los dispositivos donde hayas iniciado sesión.">
        {revokeError && (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{revokeError}</div>
        )}

        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="rounded-lg border border-red-500 px-6 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
            style={{ minHeight: '44px' }}
          >
            Cerrar sesión en todos los dispositivos
          </button>
        ) : (
          <div className="rounded-lg bg-red-50 p-4">
            <p className="mb-4 text-sm text-red-700">
              ¿Estás seguro? Se cerrará tu sesión en todos los dispositivos y serás redirigido al inicio de sesión.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isRevoking}
                className="rounded-lg border border-zinc-300 bg-white px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                style={{ minHeight: '44px' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleRevokeAll}
                disabled={isRevoking}
                className="rounded-lg bg-red-600 px-6 py-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                style={{ minHeight: '44px' }}
              >
                {isRevoking ? 'Cerrando sesión...' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </AccountCard>
    </div>
  );
}
