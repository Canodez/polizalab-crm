'use client';

import { Activity } from '@/lib/api/activitiesApi';
import AgendaCard from './AgendaCard';

interface Props {
  activities: Activity[];
  date: Date;
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7:00 to 21:00

function getActivityHour(activity: Activity): number | null {
  const iso = activity.scheduledAt || activity.dueDate;
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.getHours();
  } catch {
    return null;
  }
}

function isSameDay(isoStr: string | null | undefined, date: Date): boolean {
  if (!isoStr) return false;
  try {
    const d = new Date(isoStr);
    return (
      d.getFullYear() === date.getFullYear() &&
      d.getMonth() === date.getMonth() &&
      d.getDate() === date.getDate()
    );
  } catch {
    return false;
  }
}

export default function DayView({ activities, date }: Props) {
  // Filter to only activities for this day (scheduledAt or dueDate matches)
  const dayActivities = activities.filter((a) => {
    const checkDate = a.scheduledAt || a.dueDate;
    return isSameDay(checkDate, date);
  });

  const noTimeActivities = dayActivities.filter((a) => {
    if (!a.scheduledAt) return true;
    const hour = getActivityHour(a);
    return hour === null || hour < 7 || hour > 21;
  });

  const timedActivities = dayActivities.filter((a) => {
    if (!a.scheduledAt) return false;
    const hour = getActivityHour(a);
    return hour !== null && hour >= 7 && hour <= 21;
  });

  function activitiesForHour(hour: number): Activity[] {
    return timedActivities.filter((a) => getActivityHour(a) === hour);
  }

  if (dayActivities.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-zinc-200 py-16 text-center">
        <p className="text-sm font-medium text-zinc-500">Sin actividades para este dia</p>
        <p className="mt-1 text-xs text-zinc-400">No hay citas ni tareas programadas</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* No-time section */}
      {noTimeActivities.length > 0 && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Sin hora asignada
          </p>
          <div className="space-y-1">
            {noTimeActivities.map((a) => (
              <AgendaCard key={a.activityId} activity={a} />
            ))}
          </div>
        </div>
      )}

      {/* Hourly grid */}
      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
        {HOURS.map((hour) => {
          const hourActivities = activitiesForHour(hour);
          return (
            <div
              key={hour}
              className={`flex border-t border-zinc-100 first:border-t-0 min-h-[48px] ${
                hourActivities.length > 0 ? 'bg-white' : 'bg-zinc-50/50'
              }`}
            >
              {/* Time label */}
              <div className="w-14 flex-shrink-0 py-2 text-right pr-3 border-r border-zinc-100">
                <span className="text-xs text-zinc-400">
                  {String(hour).padStart(2, '0')}:00
                </span>
              </div>
              {/* Activity slots */}
              <div className="flex-1 py-1 pl-3 space-y-1">
                {hourActivities.map((a) => (
                  <AgendaCard key={a.activityId} activity={a} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
