'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { PlusIcon, SunIcon } from '@heroicons/react/24/outline';
import { activitiesApi, TodayResponse, Activity } from '@/lib/api/activitiesApi';
import { showError } from '@/lib/toast';
import { useAuth } from '@/lib/auth-context';
import ActivityCard from '@/components/activities/ActivityCard';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTodayDate(): string {
  try {
    return format(new Date(), "EEEE d 'de' MMMM", { locale: es });
  } catch {
    return '';
  }
}

function capitalise(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Section component ─────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  count: number;
  activities: Activity[];
  accentClass: string;
  badgeBgClass: string;
  badgeTextClass: string;
  emptyMessage: string;
  onUpdate: () => void;
}

function ActivitySection({
  title,
  count,
  activities,
  accentClass,
  badgeBgClass,
  badgeTextClass,
  emptyMessage,
  onUpdate,
}: SectionProps) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <h2 className={`text-sm font-semibold uppercase tracking-wide ${accentClass}`}>{title}</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeBgClass} ${badgeTextClass}`}>
          {count}
        </span>
      </div>
      {activities.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-5 text-center">
          <p className="text-sm text-zinc-400">{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activities.map((a) => (
            <ActivityCard key={a.activityId} activity={a} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EmpezarMiDiaPage() {
  const { user } = useAuth();
  const [data, setData] = useState<TodayResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const firstName =
    user && 'nombre' in user && typeof (user as { nombre?: string }).nombre === 'string'
      ? (user as { nombre: string }).nombre
      : null;

  const greeting = firstName ? `Buenos dias, ${firstName}` : 'Empezar mi dia';
  const todayLabel = capitalise(formatTodayDate());

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await activitiesApi.getToday();
      setData(result);
    } catch {
      setLoadError('No se pudieron cargar las actividades. Intenta nuevamente.');
      showError('Error al cargar las actividades');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-lg text-zinc-500">Cargando...</div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 rounded-lg bg-red-50 px-6 py-4 text-sm text-red-600">
          {loadError}
        </div>
        <button
          onClick={load}
          className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
          style={{ minHeight: '44px' }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const atrasadas = data?.atrasadas ?? [];
  const hoy = data?.hoy ?? [];
  const estaSemana = data?.estaSemana ?? [];
  const counts = data?.counts ?? { atrasadas: 0, hoy: 0, estaSemana: 0 };

  return (
    <div>
      {/* Welcome header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <SunIcon className="h-5 w-5 text-amber-500" />
          <h1 className="text-2xl font-bold text-zinc-900">{greeting}</h1>
        </div>
        {todayLabel && (
          <p className="text-sm text-zinc-500 capitalize">{todayLabel}</p>
        )}
      </div>

      {/* Atrasadas */}
      <ActivitySection
        title="Atrasadas"
        count={counts.atrasadas}
        activities={atrasadas}
        accentClass="text-red-600"
        badgeBgClass="bg-red-100"
        badgeTextClass="text-red-700"
        emptyMessage="Sin actividades atrasadas"
        onUpdate={load}
      />

      {/* Hoy */}
      <ActivitySection
        title="Hoy"
        count={counts.hoy}
        activities={hoy}
        accentClass="text-blue-600"
        badgeBgClass="bg-blue-100"
        badgeTextClass="text-blue-700"
        emptyMessage="Sin actividades para hoy"
        onUpdate={load}
      />

      {/* Esta semana */}
      <ActivitySection
        title="Esta semana"
        count={counts.estaSemana}
        activities={estaSemana}
        accentClass="text-zinc-500"
        badgeBgClass="bg-zinc-100"
        badgeTextClass="text-zinc-600"
        emptyMessage="Sin actividades para esta semana"
        onUpdate={load}
      />

      {/* FAB */}
      <Link
        href="/actividades/nueva"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors"
        aria-label="Nueva actividad"
      >
        <PlusIcon className="h-6 w-6" />
      </Link>
    </div>
  );
}
