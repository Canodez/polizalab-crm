'use client';

import { addDays, format, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { Activity } from '@/lib/api/activitiesApi';
import AgendaCard from './AgendaCard';

interface Props {
  activities: Activity[];
  weekStart: Date;
}

function isSameCalendarDay(isoStr: string | null | undefined, day: Date): boolean {
  if (!isoStr) return false;
  try {
    const d = new Date(isoStr);
    return (
      d.getFullYear() === day.getFullYear() &&
      d.getMonth() === day.getMonth() &&
      d.getDate() === day.getDate()
    );
  } catch {
    return false;
  }
}

function getScheduledTime(activity: Activity): string {
  const iso = activity.scheduledAt;
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export default function WeekView({ activities, weekStart }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function activitiesForDay(day: Date): Activity[] {
    return activities
      .filter((a) => {
        const checkDate = a.scheduledAt || a.dueDate;
        return isSameCalendarDay(checkDate, day);
      })
      .sort((a, b) => {
        const ta = getScheduledTime(a);
        const tb = getScheduledTime(b);
        return ta.localeCompare(tb);
      });
  }

  return (
    <div>
      {/* Desktop: 7-column grid */}
      <div className="hidden sm:grid sm:grid-cols-7 gap-px bg-zinc-200 rounded-lg overflow-hidden">
        {days.map((day, i) => {
          const todayDay = isToday(day);
          const dayActivities = activitiesForDay(day);
          return (
            <div
              key={i}
              className={`bg-white p-2 min-h-[120px] ${
                todayDay ? 'ring-2 ring-blue-500 ring-inset' : ''
              }`}
            >
              <p
                className={`text-xs font-semibold mb-1 capitalize ${
                  todayDay ? 'text-blue-600' : 'text-zinc-500'
                }`}
              >
                {format(day, 'EEE d', { locale: es })}
              </p>
              {dayActivities.length === 0 ? (
                <p className="text-xs text-zinc-300 italic">Sin actividades</p>
              ) : (
                <div className="space-y-1">
                  {dayActivities.map((a) => (
                    <AgendaCard key={a.activityId} activity={a} compact />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: vertical list */}
      <div className="sm:hidden space-y-4">
        {days.map((day, i) => {
          const todayDay = isToday(day);
          const dayActivities = activitiesForDay(day);
          return (
            <div key={i}>
              <p
                className={`text-sm font-semibold mb-2 capitalize ${
                  todayDay ? 'text-blue-600' : 'text-zinc-700'
                }`}
              >
                {format(day, "EEEE d 'de' MMMM", { locale: es })}
              </p>
              {dayActivities.length === 0 ? (
                <p className="text-xs text-zinc-400 italic">Sin actividades</p>
              ) : (
                <div className="space-y-1">
                  {dayActivities.map((a) => (
                    <AgendaCard key={a.activityId} activity={a} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
