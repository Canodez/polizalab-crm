import type { Metadata } from 'next';
import { Lexend } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import LayoutContent from '@/components/LayoutContent';

const lexend = Lexend({
  variable: '--font-lexend',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'PolizaLab - Gestión de Pólizas',
  description: 'Asistente diario para agentes de seguros',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${lexend.variable} antialiased`}
      >
        <AuthProvider>
          <LayoutContent>{children}</LayoutContent>
        </AuthProvider>
      </body>
    </html>
  );
}
