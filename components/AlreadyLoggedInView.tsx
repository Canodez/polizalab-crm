'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { UserCircleIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

/**
 * Component shown when user is already logged in and tries to access login page
 * Provides options to navigate to profile, logout, or switch accounts
 */
export default function AlreadyLoggedInView() {
  const router = useRouter();
  const { user, logout } = useAuth();

  /**
   * Navigate to user profile page
   */
  const handleGoToProfile = () => {
    router.push('/profile');
  };

  /**
   * Logout current user
   */
  const handleLogout = async () => {
    try {
      await logout();
      // After logout, the page will automatically show the login form
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  /**
   * Switch to a different account by logging out first
   */
  const handleSwitchAccount = async () => {
    try {
      await logout();
      // After logout, the page will automatically show the login form
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-md p-8">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <UserCircleIcon className="w-16 h-16 text-blue-600" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">
            Ya tienes sesión iniciada
          </h1>
          
          {/* User email */}
          <div className="mb-6 text-center">
            <p className="text-gray-600 mb-2">Sesión activa como:</p>
            <p className="text-lg font-medium text-gray-900">{user?.email}</p>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            {/* Primary button: Go to profile */}
            <button
              onClick={handleGoToProfile}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex items-center justify-center gap-2"
            >
              <UserCircleIcon className="w-5 h-5" />
              Ir a mi perfil
            </button>
            
            {/* Secondary button: Logout */}
            <button
              onClick={handleLogout}
              className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowRightOnRectangleIcon className="w-5 h-5" />
              Cerrar sesión
            </button>
          </div>

          {/* Switch account link */}
          <div className="mt-6 text-center">
            <button
              onClick={handleSwitchAccount}
              className="text-sm text-blue-600 hover:text-blue-700 hover:underline focus:outline-none focus:underline"
            >
              Cambiar de cuenta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
