'use client';

import { usePathname, useRouter } from 'next/navigation';

const TABS = [
  { label: 'Perfil', href: '/account/profile' },
  { label: 'Preferencias', href: '/account/preferences' },
  { label: 'Seguridad', href: '/account/security' },
  { label: 'Sesiones', href: '/account/sessions' },
];

interface Props {
  onNavigate?: (href: string) => void;
}

export default function AccountTabs({ onNavigate }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const handleClick = (href: string) => {
    if (onNavigate) {
      onNavigate(href);
    } else {
      router.push(href);
    }
  };

  return (
    <div className="border-b border-zinc-200 bg-white">
      <div className="mx-auto max-w-2xl px-4">
        <nav className="flex overflow-x-auto" aria-label="Tabs">
          {TABS.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
            return (
              <button
                key={tab.href}
                onClick={() => handleClick(tab.href)}
                className={`whitespace-nowrap border-b-2 px-4 py-4 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
