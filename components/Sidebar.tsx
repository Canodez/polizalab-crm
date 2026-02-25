'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Dialog, Transition } from '@headlessui/react';
import {
  ClipboardDocumentListIcon,
  UsersIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/lib/auth-context';

interface SidebarProps {
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  isMobileOpen: boolean;
  closeMobile: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  disabled?: boolean;
}

const mainNav: NavItem[] = [
  { label: 'Pólizas', href: '/policies', icon: ClipboardDocumentListIcon },
  { label: 'Clientes', href: '/clients', icon: UsersIcon },
  { label: 'Reportes', href: '/reports', icon: ChartBarIcon, disabled: true },
];

const bottomNav: NavItem[] = [
  { label: 'Configuración', href: '/account/preferences', icon: Cog6ToothIcon },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/');
}

/* ─── Module-level NavLink ─── */
function NavLink({
  item,
  collapsed,
  active,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;

  if (item.disabled) {
    return (
      <div
        className={`group relative flex items-center gap-x-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 cursor-not-allowed select-none ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
        {collapsed && <Tooltip label={item.label} />}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`group relative flex items-center gap-x-3 px-3 py-2 text-sm font-medium transition-colors ${
        collapsed ? 'justify-center rounded-lg' : ''
      } ${
        active
          ? `bg-zinc-100 text-zinc-900 ${collapsed ? 'rounded-lg' : 'rounded-r-lg border-l-2 border-blue-600 pl-[10px]'}`
          : 'rounded-lg text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
      }`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-blue-600' : 'text-zinc-400 group-hover:text-zinc-600'}`} />
      {!collapsed && <span>{item.label}</span>}
      {collapsed && <Tooltip label={item.label} />}
    </Link>
  );
}

/* ─── Tooltip (used in collapsed mode) ─── */
function Tooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full ml-2 rounded-md bg-zinc-800 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[60]">
      {label}
    </span>
  );
}

/* ─── Module-level SidebarContent ─── */
function SidebarContent({
  collapsed,
  toggleCollapsed,
  pathname,
  onLogout,
  onNavigate,
}: {
  collapsed: boolean;
  toggleCollapsed: () => void;
  pathname: string;
  onLogout: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-white">
      {/* Logo + collapse toggle */}
      <div className={`flex items-center border-b border-zinc-200 h-14 shrink-0 ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
        {!collapsed && (
          <span className="text-lg font-semibold text-zinc-900 tracking-tight">PolizaLab</span>
        )}
        <button
          onClick={toggleCollapsed}
          className="hidden lg:flex items-center justify-center rounded-md p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronLeftIcon className="h-4 w-4" />}
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {mainNav.map((item) => (
            <li key={item.href}>
              <NavLink
                item={item}
                collapsed={collapsed}
                active={isActivePath(pathname, item.href)}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="shrink-0 border-t border-zinc-200 px-3 py-3 space-y-1">
        {bottomNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            active={isActivePath(pathname, item.href)}
            onNavigate={onNavigate}
          />
        ))}

        {/* Logout */}
        <button
          onClick={onLogout}
          className={`group relative flex w-full items-center gap-x-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <ArrowRightOnRectangleIcon className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Cerrar sesión</span>}
          {collapsed && <Tooltip label="Cerrar sesión" />}
        </button>
      </div>
    </div>
  );
}

/* ─── Main Sidebar ─── */
export default function Sidebar({ isCollapsed, toggleCollapsed, isMobileOpen, closeMobile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      closeMobile();
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const contentProps = {
    pathname,
    onLogout: handleLogout,
    toggleCollapsed,
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:flex-col border-r border-zinc-200 transition-[width] duration-200 ${
          isCollapsed ? 'lg:w-16' : 'lg:w-64'
        }`}
      >
        <SidebarContent {...contentProps} collapsed={isCollapsed} onNavigate={() => {}} />
      </aside>

      {/* Mobile drawer */}
      <Transition.Root show={isMobileOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50 lg:hidden" onClose={closeMobile}>
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-zinc-900/50" />
          </Transition.Child>

          <div className="fixed inset-0 flex">
            <Transition.Child
              as={Fragment}
              enter="transition ease-in-out duration-300 transform"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in-out duration-300 transform"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
                {/* Close button */}
                <Transition.Child
                  as={Fragment}
                  enter="ease-in-out duration-300"
                  enterFrom="opacity-0"
                  enterTo="opacity-100"
                  leave="ease-in-out duration-300"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                    <button type="button" className="-m-2.5 p-2.5" onClick={closeMobile} aria-label="Cerrar menú">
                      <XMarkIcon className="h-6 w-6 text-white" />
                    </button>
                  </div>
                </Transition.Child>

                <SidebarContent {...contentProps} collapsed={false} onNavigate={closeMobile} />
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  );
}
