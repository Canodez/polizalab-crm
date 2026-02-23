'use client';

import { Menu, Transition } from '@headlessui/react';
import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { profileApi } from '@/lib/api-client';
import Avatar from './Avatar';
import {
  UserCircleIcon,
  LockClosedIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';

/**
 * UserMenu component
 * Displays a dropdown menu with user options (profile, settings, logout)
 */
export default function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  // Load profile image URL
  useEffect(() => {
    const loadProfileImage = async () => {
      try {
        const profile = await profileApi.getProfile();
        setProfileImageUrl(profile.profileImageUrl || null);
      } catch (error) {
        // Silently fail - user will see initials instead
        console.error('Failed to load profile image:', error);
      }
    };

    if (user) {
      loadProfileImage();
    }
  }, [user]);

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <Menu as="div" className="relative inline-block text-left">
      {/* Menu button with user avatar */}
      <Menu.Button className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-full">
        <Avatar email={user?.email || ''} imageUrl={profileImageUrl} size="md" />
      </Menu.Button>

      {/* Animated dropdown menu */}
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none divide-y divide-gray-100">
          {/* User email (non-clickable) */}
          <div className="px-4 py-3">
            <p className="text-sm text-gray-900 font-medium truncate">
              {user?.email || 'Usuario'}
            </p>
          </div>

          {/* Navigation options */}
          <div className="py-1">
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={() => router.push('/account/profile')}
                  className={`${
                    active ? 'bg-gray-100' : ''
                  } group flex w-full items-center px-4 py-2 text-sm text-gray-700`}
                >
                  <UserCircleIcon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
                  Mi perfil
                </button>
              )}
            </Menu.Item>

            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={() => router.push('/account/security')}
                  className={`${
                    active ? 'bg-gray-100' : ''
                  } group flex w-full items-center px-4 py-2 text-sm text-gray-700`}
                >
                  <LockClosedIcon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
                  Seguridad
                </button>
              )}
            </Menu.Item>

            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={() => router.push('/account/preferences')}
                  className={`${
                    active ? 'bg-gray-100' : ''
                  } group flex w-full items-center px-4 py-2 text-sm text-gray-700`}
                >
                  <Cog6ToothIcon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
                  Configuración
                </button>
              )}
            </Menu.Item>
          </div>

          {/* Logout option */}
          <div className="py-1">
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={handleLogout}
                  className={`${
                    active ? 'bg-gray-100' : ''
                  } group flex w-full items-center px-4 py-2 text-sm text-red-600`}
                >
                  <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5 text-red-500 group-hover:text-red-600" />
                  Cerrar sesión
                </button>
              )}
            </Menu.Item>
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
