import {
  EnvelopeIcon,
  PhoneIcon,
  PencilSquareIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import { Client } from '@/lib/api/clientsApi';

interface Props {
  client: Client;
  onClick: (clientId: string) => void;
}

export default function ClientCard({ client, onClick }: Props) {
  const fullName = `${client.firstName} ${client.lastName}`;
  const initials = `${client.firstName.charAt(0)}${client.lastName.charAt(0)}`.toUpperCase();

  return (
    <button
      onClick={() => onClick(client.clientId)}
      className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm ring-1 ring-transparent transition-all duration-150 hover:ring-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
            <span className="text-xs font-bold text-blue-700">{initials}</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-900">{fullName}</p>
            {client.rfc && (
              <p className="truncate text-xs text-zinc-400">RFC: {client.rfc}</p>
            )}
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          {/* Status badge */}
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              client.status === 'active'
                ? 'bg-green-100 text-green-700'
                : 'bg-zinc-100 text-zinc-500'
            }`}
          >
            {client.status === 'active' ? 'Activo' : 'Archivado'}
          </span>
        </div>
      </div>

      {/* Contact info */}
      <div className="mt-3 space-y-1">
        {client.email && (
          <div className="flex items-center gap-1.5 min-w-0">
            <EnvelopeIcon className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
            <p className="truncate text-xs text-zinc-500">{client.email}</p>
          </div>
        )}
        {client.phone && (
          <div className="flex items-center gap-1.5 min-w-0">
            <PhoneIcon className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
            <p className="truncate text-xs text-zinc-500">{client.phone}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        {/* Policy count */}
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <ClipboardDocumentListIcon className="h-3.5 w-3.5" />
          <span>
            {client.policyCount === 1
              ? '1 póliza'
              : `${client.policyCount} pólizas`}
          </span>
        </div>

        {/* createdFrom indicator */}
        <div className="flex items-center gap-1 text-xs text-zinc-400">
          {client.createdFrom === 'manual' ? (
            <>
              <PencilSquareIcon className="h-3.5 w-3.5" />
              <span>Manual</span>
            </>
          ) : (
            <>
              <DocumentTextIcon className="h-3.5 w-3.5" />
              <span>Póliza</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
