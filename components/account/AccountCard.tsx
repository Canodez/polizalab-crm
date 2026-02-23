import { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
}

export default function AccountCard({ title, description, children }: Props) {
  return (
    <div className="rounded-lg bg-white p-6 shadow-sm mb-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-zinc-900">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
