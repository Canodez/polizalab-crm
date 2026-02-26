'use client';

import { OpportunityStage, StageHistoryEntry } from '@/lib/api/opportunitiesApi';

interface Props {
  currentStage: OpportunityStage;
  stageHistory: StageHistoryEntry[];
}

// Ordered active pipeline stages (GANADA/PERDIDA are terminal, shown separately)
const PIPELINE_STAGES: OpportunityStage[] = [
  'CALIFICAR',
  'DATOS_MINIMOS',
  'COTIZANDO',
  'PROPUESTA_ENVIADA',
  'NEGOCIACION',
];

const STAGE_LABELS: Record<OpportunityStage, string> = {
  CALIFICAR: 'Calificar',
  DATOS_MINIMOS: 'Datos',
  COTIZANDO: 'Cotizando',
  PROPUESTA_ENVIADA: 'Propuesta',
  NEGOCIACION: 'Negociación',
  GANADA: 'Ganada',
  PERDIDA: 'Perdida',
};

export default function StageStepper({ currentStage, stageHistory }: Props) {
  const isTerminal = currentStage === 'GANADA' || currentStage === 'PERDIDA';

  // Determine which pipeline stages were reached
  const reachedStages = new Set(stageHistory.map((h) => h.stage));
  reachedStages.add(currentStage);

  const currentIndex = PIPELINE_STAGES.indexOf(currentStage);

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex items-center gap-0 min-w-max">
        {PIPELINE_STAGES.map((stage, index) => {
          const isPast = isTerminal
            ? reachedStages.has(stage)
            : index < currentIndex;
          const isCurrent = !isTerminal && stage === currentStage;
          const isFuture = !isTerminal && index > currentIndex;

          let dotClass = '';
          let labelClass = '';

          if (isPast && !isCurrent) {
            dotClass = 'bg-green-500 border-green-500';
            labelClass = 'text-green-700';
          } else if (isCurrent) {
            dotClass = 'bg-blue-600 border-blue-600 ring-2 ring-blue-200';
            labelClass = 'text-blue-700 font-semibold';
          } else if (isFuture) {
            dotClass = 'bg-white border-zinc-300';
            labelClass = 'text-zinc-400';
          } else {
            // Terminal: all pipeline stages are past
            dotClass = 'bg-green-500 border-green-500';
            labelClass = 'text-green-700';
          }

          const isLast = index === PIPELINE_STAGES.length - 1;

          return (
            <div key={stage} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`h-3 w-3 rounded-full border-2 transition-colors ${dotClass}`}
                />
                <span className={`text-xs whitespace-nowrap ${labelClass}`}>
                  {STAGE_LABELS[stage]}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`h-0.5 w-8 mx-1 mb-3 transition-colors ${
                    isPast || isCurrent ? 'bg-green-400' : 'bg-zinc-200'
                  }`}
                />
              )}
            </div>
          );
        })}

        {/* Terminal connector */}
        <div className="flex items-center">
          <div
            className={`h-0.5 w-8 mx-1 mb-3 transition-colors ${
              isTerminal ? (currentStage === 'GANADA' ? 'bg-green-400' : 'bg-red-300') : 'bg-zinc-200'
            }`}
          />
          <div className="flex flex-col items-center gap-1">
            <div
              className={`h-3 w-3 rounded-full border-2 transition-colors ${
                isTerminal
                  ? currentStage === 'GANADA'
                    ? 'bg-green-500 border-green-500 ring-2 ring-green-200'
                    : 'bg-red-500 border-red-500 ring-2 ring-red-200'
                  : 'bg-white border-zinc-300'
              }`}
            />
            <span
              className={`text-xs whitespace-nowrap ${
                isTerminal
                  ? currentStage === 'GANADA'
                    ? 'text-green-700 font-semibold'
                    : 'text-red-600 font-semibold'
                  : 'text-zinc-400'
              }`}
            >
              {isTerminal ? STAGE_LABELS[currentStage] : 'Cierre'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
