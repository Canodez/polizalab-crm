'use client';

import AccountCard from '@/components/account/AccountCard';

export default function SessionsPage() {
  return (
    <AccountCard title="Sesiones activas">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-zinc-200">
              <th className="pb-3 pr-4 font-medium text-zinc-700">Dispositivo</th>
              <th className="pb-3 pr-4 font-medium text-zinc-700">Ubicación</th>
              <th className="pb-3 pr-4 font-medium text-zinc-700">Última actividad</th>
              <th className="pb-3 font-medium text-zinc-700">Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4} className="py-8 text-center text-zinc-500">
                <div className="flex flex-col items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                    Sesión actual
                  </span>
                  <p className="text-sm">Gestión de sesiones disponible próximamente</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AccountCard>
  );
}
