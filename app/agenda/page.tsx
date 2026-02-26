'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  startOfWeek,
  endOfWeek,
  format,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { activitiesApi, Activity } from '@/lib/api/activitiesApi';
import { showError } from '@/lib/toast';
import DayView from '@/components/agenda/DayView';
import WeekView from '@/components/agenda/WeekView';
import IcsExportButton from '@/components/agenda/IcsExportButton';

type View = 'day' | 'week';

function formatDateRange(view: View, date: Date): string {
  try {
    if (view === 'day') {
      return format(date, "EEEE d 'de' MMMM yyyy", { locale: es });
    }
    const ws = startOfWeek(date, { weekStartsOn: 1 });
    const we = endOfWeek(date, { weekStartsOn: 1 });
    const sameMonth = ws.getMonth() === we.getMonth();
    if (sameMonth) {
      return `${format(ws, 'd', { locale: es })} – ${format(we, "d 'de' MMMM yyyy", { locale: es })}`;
    }
    return `${format(ws, "d 'de' MMMM", { locale: es })} – ${format(we, "d 'de' MMMM yyyy", { locale: es })}`;
  } catch {
    return '';
  }
}

function capitalise(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default function AgendaPage() {
  const [view, setView] = useState<View>('day');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Compute date range for fetch
  const getDateRange = useCallback((): { dateFrom: string; dateTo: string } => {
    if (view === 'day') {
      const iso = format(currentDate, 'yyyy-MM-dd');
      return { dateFrom: iso, dateTo: iso };
    }
    const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
    const we = endOfWeek(currentDate, { weekStartsOn: 1 });
    return {
      dateFrom: format(ws, 'yyyy-MM-dd'),
      dateTo: format(we, 'yyyy-MM-dd'),
    };
  }, [view, currentDate]);

  const fetchActivities = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');
    const { dateFrom, dateTo } = getDateRange();
    activitiesApi
      .getAgenda(dateFrom, dateTo)
      .then((res) => {
        if (!cancelled) {
          setActivities(res.activities);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('No se pudieron cargar las actividades. Intenta nuevamente.');
          showError('Error al cargar la agenda');
          setIsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [getDateRange]);

  useEffect(() => {
    const cancel = fetchActivities();
    return cancel;
  }, [fetchActivities]);

  const goBack = () => {
    setCurrentDate((d) => (view === 'day' ? subDays(d, 1) : subWeeks(d, 1)));
  };

  const goForward = () => {
    setCurrentDate((d) => (view === 'day' ? addDays(d, 1) : addWeeks(d, 1)));
  };

  const goToday = () => {
    setCurrentDate(new Date());
  };

  const formattedDate = capitalise(formatDateRange(view, currentDate));
  const { dateFrom, dateTo } = getDateRange();
  const dateLabel = view === 'day' ? format(currentDate, 'yyyy-MM-dd') : `${dateFrom} / ${dateTo}`;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-900">Agenda</h1>
          <div className="flex items-center gap-2">
            <IcsExportButton activities={activities} dateLabel={dateLabel} />
            {/* Day/Week toggle */}
            <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5">
              <button
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === 'day' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'
                }`}
                onClick={() => setView('day')}
              >
                Dia
              </button>
              <button
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === 'week' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'
                }`}
                onClick={() => setView('week')}
              >
                Semana
              </button>
            </div>
          </div>
        </div>

        {/* Date navigation */}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={goBack}
            className="rounded-lg border border-zinc-200 p-1.5 hover:bg-zinc-50 transition-colors"
            aria-label="Anterior"
          >
            <ChevronLeftIcon className="h-4 w-4 text-zinc-600" />
          </button>
          <button
            onClick={goToday}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Hoy
          </button>
          <button
            onClick={goForward}
            className="rounded-lg border border-zinc-200 p-1.5 hover:bg-zinc-50 transition-colors"
            aria-label="Siguiente"
          >
            <ChevronRightIcon className="h-4 w-4 text-zinc-600" />
          </button>
          <span className="text-sm font-medium text-zinc-700">{formattedDate}</span>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-sm text-zinc-500">Cargando agenda...</div>
        </div>
      )}

      {/* Error state */}
      {!isLoading && loadError && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-lg bg-red-50 px-6 py-4 text-sm text-red-600">
            {loadError}
          </div>
          <button
            onClick={fetchActivities}
            className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
            style={{ minHeight: '44px' }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Views */}
      {!isLoading && !loadError && (
        <>
          {view === 'day' && (
            <DayView activities={activities} date={currentDate} />
          )}
          {view === 'week' && (
            <WeekView
              activities={activities}
              weekStart={startOfWeek(currentDate, { weekStartsOn: 1 })}
            />
          )}
        </>
      )}
    </div>
  );
}
