'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import { Dialog, Transition } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import UserMenu from './UserMenu';
import Avatar from './Avatar';
import {
  UserCircleIcon,
  LockClosedIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';

/**
 * Navbar component
 * Main navigation bar with logo and user menu
 * Responsive: Desktop shows UserMenu dropdown, Mobile shows hamburger menu with drawer
 */
export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      setMobileMenuOpen(false);
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleNavigation = (path: string) => {
    setMobileMenuOpen(false);
    router.push(path);
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 md:h-20">
          {/* Logo/Title */}
          <div className="flex-shrink-0">
            <h1 className="text-xl md:text-2xl font-semibold text-gray-900 tracking-tight">
              PolizaLab CRM
            </h1>
          </div>

          {/* Desktop: nav links + UserMenu dropdown (hidden on mobile) */}
          <div className="hidden md:flex items-center gap-4 md:gap-6">
            <Link
              href="/policies"
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Pólizas
            </Link>
            <UserMenu />
          </div>

          {/* Mobile: Hamburger menu button (hidden on desktop) */}
          <div className="md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              aria-label="Abrir menú"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer/sidebar */}
      <Transition.Root show={mobileMenuOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50 md:hidden" onClose={setMobileMenuOpen}>
          {/* Backdrop */}
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-600 bg-opacity-75" />
          </Transition.Child>

          {/* Drawer panel */}
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
                    <button
                      type="button"
                      className="-m-2.5 p-2.5"
                      onClick={() => setMobileMenuOpen(false)}
                      aria-label="Cerrar menú"
                    >
                      <XMarkIcon className="h-6 w-6 text-white" />
                    </button>
                  </div>
                </Transition.Child>

                {/* Drawer content */}
                <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-4">
                  {/* User info section */}
                  <div className="flex items-center gap-x-4 py-6 border-b border-gray-200">
                    <Avatar email={user?.email || ''} size="lg" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user?.email || 'Usuario'}
                      </p>
                    </div>
                  </div>

                  {/* Navigation menu */}
                  <nav className="flex flex-1 flex-col">
                    <ul role="list" className="flex flex-1 flex-col gap-y-2">
                      <li>
                        <button
                          onClick={() => handleNavigation('/policies')}
                          className="group flex w-full items-center gap-x-3 rounded-md p-3 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                        >
                          <ClipboardDocumentListIcon className="h-6 w-6 text-gray-400 group-hover:text-gray-500" />
                          Pólizas
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => handleNavigation('/account/profile')}
                          className="group flex w-full items-center gap-x-3 rounded-md p-3 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                        >
                          <UserCircleIcon className="h-6 w-6 text-gray-400 group-hover:text-gray-500" />
                          Mi perfil
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => handleNavigation('/account/security')}
                          className="group flex w-full items-center gap-x-3 rounded-md p-3 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                        >
                          <LockClosedIcon className="h-6 w-6 text-gray-400 group-hover:text-gray-500" />
                          Seguridad
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => handleNavigation('/account/preferences')}
                          className="group flex w-full items-center gap-x-3 rounded-md p-3 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                        >
                          <Cog6ToothIcon className="h-6 w-6 text-gray-400 group-hover:text-gray-500" />
                          Configuración
                        </button>
                      </li>

                      {/* Logout button at bottom */}
                      <li className="mt-auto pt-4 border-t border-gray-200">
                        <button
                          onClick={handleLogout}
                          className="group flex w-full items-center gap-x-3 rounded-md p-3 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          <ArrowRightOnRectangleIcon className="h-6 w-6 text-red-500 group-hover:text-red-600" />
                          Cerrar sesión
                        </button>
                      </li>
                    </ul>
                  </nav>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>
    </nav>
  );
}
