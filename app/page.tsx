'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

export default function Home() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = () => {
      const loggedIn = isAuthenticated();
      setIsLoggedIn(loggedIn);
      setIsLoading(false);
      
      // If logged in, redirect to profile
      if (loggedIn) {
        router.push('/profile');
      }
    };

    checkAuth();
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          {/* Logo/Title */}
          <div className="mb-8">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">
              PolizaLab
            </h1>
            <p className="text-xl text-gray-600">
              Tu asistente diario para la gestión de pólizas de seguros
            </p>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-8 my-16">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="text-4xl mb-4">📋</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Gestión de Pólizas
              </h3>
              <p className="text-gray-600">
                Administra todas tus pólizas de seguros en un solo lugar
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="text-4xl mb-4">👥</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Gestión de Clientes
              </h3>
              <p className="text-gray-600">
                Mantén un registro completo de tus clientes y sus necesidades
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Reportes y Análisis
              </h3>
              <p className="text-gray-600">
                Obtén insights valiosos sobre tu cartera de seguros
              </p>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href="/register"
              className="w-full sm:w-auto bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors text-center"
            >
              Crear cuenta
            </a>
            <a
              href="/login"
              className="w-full sm:w-auto bg-white text-blue-600 px-8 py-3 rounded-lg font-medium border-2 border-blue-600 hover:bg-blue-50 transition-colors text-center"
            >
              Iniciar sesión
            </a>
          </div>

          {/* Additional Info */}
          <div className="mt-16 text-gray-600">
            <p className="text-sm">
              PolizaLab CRM - Sistema de gestión para agentes de seguros
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
