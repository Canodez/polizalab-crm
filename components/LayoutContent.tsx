'use client';

import { useAuth } from '@/lib/auth-context';
import Navbar from './Navbar';
import { Toaster } from 'react-hot-toast';

/**
 * LayoutContent component
 * Wraps the main content and conditionally shows Navbar when authenticated
 */
export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            duration: 5000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
      {isAuthenticated && <Navbar />}
      <main className={isAuthenticated ? 'pt-16 md:pt-20' : ''}>
        {children}
      </main>
    </>
  );
}
