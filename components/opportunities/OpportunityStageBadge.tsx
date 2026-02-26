'use client';

import { OpportunityStage } from '@/lib/api/opportunitiesApi';

const config: Record<OpportunityStage, { label: string; bg: string; text: string }> = {
  CALIFICAR: { label: 'Calificar', bg: 'bg-zinc-100', text: 'text-zinc-600' },
  DATOS_MINIMOS: { label: 'Datos mínimos', bg: 'bg-blue-100', text: 'text-blue-700' },
  COTIZANDO: { label: 'Cotizando', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  PROPUESTA_ENVIADA: { label: 'Propuesta enviada', bg: 'bg-purple-100', text: 'text-purple-700' },
  NEGOCIACION: { label: 'Negociación', bg: 'bg-amber-100', text: 'text-amber-700' },
  GANADA: { label: 'Ganada', bg: 'bg-green-100', text: 'text-green-700' },
  PERDIDA: { label: 'Perdida', bg: 'bg-red-100', text: 'text-red-700' },
};

export default function OpportunityStageBadge({ stage }: { stage: OpportunityStage }) {
  const c = config[stage] ?? config.CALIFICAR;
  return (
    <span className={`inline-flex items-center rounded-full ${c.bg} ${c.text} px-2.5 py-0.5 text-xs font-medium`}>
      {c.label}
    </span>
  );
}
