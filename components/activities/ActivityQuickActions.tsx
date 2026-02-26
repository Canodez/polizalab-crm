'use client';

import { useState } from 'react';
import { CheckIcon, ClockIcon } from '@heroicons/react/24/outline';
import { activitiesApi, Activity } from '@/lib/api/activitiesApi';
import { showSuccess, showError } from '@/lib/toast';

interface Props {
  activity: Activity;
  onUpdate: () => void;
}

export default function ActivityQuickActions({ activity, onUpdate }: Props) {
  const [isLoading, setIsLoading] = useState('');

  const handleComplete = async () => {
    setIsLoading('complete');
    try {
      await activitiesApi.complete(activity.activityId);
      showSuccess('Actividad completada');
      onUpdate();
    } catch {
      showError('Error al completar');
    } finally {
      setIsLoading('');
    }
  };

  const handleReschedule = async (mode: '+2h' | 'tomorrow_10am') => {
    setIsLoading(mode);
    try {
      await activitiesApi.reschedule(activity.activityId, { mode });
      showSuccess(mode === '+2h' ? 'Reprogramada +2h' : 'Reprogramada para mañana');
      onUpdate();
    } catch {
      showError('Error al reprogramar');
    } finally {
      setIsLoading('');
    }
  };

  const chipClass =
    'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer';

  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={handleComplete}
        disabled={!!isLoading}
        className={`${chipClass} bg-green-50 text-green-700 hover:bg-green-100`}
      >
        <CheckIcon className="h-3.5 w-3.5" />
        {isLoading === 'complete' ? '...' : 'Hecha'}
      </button>

      <button
        onClick={() => handleReschedule('+2h')}
        disabled={!!isLoading}
        className={`${chipClass} bg-blue-50 text-blue-700 hover:bg-blue-100`}
      >
        <ClockIcon className="h-3.5 w-3.5" />
        {isLoading === '+2h' ? '...' : '+2h'}
      </button>

      <button
        onClick={() => handleReschedule('tomorrow_10am')}
        disabled={!!isLoading}
        className={`${chipClass} bg-blue-50 text-blue-700 hover:bg-blue-100`}
      >
        <ClockIcon className="h-3.5 w-3.5" />
        {isLoading === 'tomorrow_10am' ? '...' : 'Mañana'}
      </button>
    </div>
  );
}
