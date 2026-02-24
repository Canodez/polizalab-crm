import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import Navbar from '../Navbar';
import { useAuth } from '@/lib/auth-context';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('next/link', () => {
  return function MockLink({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>;
  };
});

jest.mock('../UserMenu', () => {
  return function MockUserMenu() {
    return <div data-testid="user-menu">UserMenu</div>;
  };
});

jest.mock('../Avatar', () => {
  return function MockAvatar({ email, size }: { email: string; size: string }) {
    return <div data-testid={`avatar-${size}`}>{email.charAt(0).toUpperCase()}</div>;
  };
});

describe('Navbar', () => {
  const mockPush = jest.fn();
  const mockLogout = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
    (useAuth as jest.Mock).mockReturnValue({
      user: { email: 'test@example.com' },
      logout: mockLogout,
    });
  });

  describe('Desktop view', () => {
    it('should render logo and UserMenu on desktop', () => {
      render(<Navbar />);

      expect(screen.getByText('PolizaLab CRM')).toBeInTheDocument();
      expect(screen.getByTestId('user-menu')).toBeInTheDocument();
    });

    it('should render "Pólizas" link on desktop', () => {
      render(<Navbar />);
      const link = screen.getByRole('link', { name: 'Pólizas' });
      expect(link).toHaveAttribute('href', '/policies');
    });

    it('should not show hamburger menu on desktop', () => {
      render(<Navbar />);
      
      const hamburgerButton = screen.queryByLabelText('Abrir menú');
      expect(hamburgerButton).toBeInTheDocument();
      // In real browser, this would be hidden by CSS (md:hidden class)
    });
  });

  describe('Mobile view', () => {
    it('should show hamburger menu button', () => {
      render(<Navbar />);
      
      const hamburgerButton = screen.getByLabelText('Abrir menú');
      expect(hamburgerButton).toBeInTheDocument();
    });

    it('should open mobile drawer when hamburger is clicked', async () => {
      render(<Navbar />);
      
      const hamburgerButton = screen.getByLabelText('Abrir menú');
      fireEvent.click(hamburgerButton);

      await waitFor(() => {
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
      });
    });

    it('should show user email in drawer', async () => {
      render(<Navbar />);
      
      const hamburgerButton = screen.getByLabelText('Abrir menú');
      fireEvent.click(hamburgerButton);

      await waitFor(() => {
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
      });
    });

    it('should show avatar in drawer', async () => {
      render(<Navbar />);
      
      const hamburgerButton = screen.getByLabelText('Abrir menú');
      fireEvent.click(hamburgerButton);

      await waitFor(() => {
        expect(screen.getByTestId('avatar-lg')).toBeInTheDocument();
      });
    });

    it('should show navigation options in drawer', async () => {
      render(<Navbar />);

      const hamburgerButton = screen.getByLabelText('Abrir menú');
      fireEvent.click(hamburgerButton);

      await waitFor(() => {
        // 'Pólizas' appears both in desktop link and drawer button
        expect(screen.getAllByText('Pólizas').length).toBeGreaterThan(0);
        expect(screen.getByText('Mi perfil')).toBeInTheDocument();
        expect(screen.getByText('Seguridad')).toBeInTheDocument();
        expect(screen.getByText('Configuración')).toBeInTheDocument();
        expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
      });
    });

    it('should navigate to /policies when "Pólizas" is clicked in drawer', async () => {
      render(<Navbar />);

      const hamburgerButton = screen.getByLabelText('Abrir menú');
      fireEvent.click(hamburgerButton);

      await waitFor(() => {
        // Use role=button to target the drawer button, not the desktop <a> link
        const polizasButton = screen.getByRole('button', { name: /Pólizas/i });
        fireEvent.click(polizasButton);
      });

      expect(mockPush).toHaveBeenCalledWith('/policies');
    });

    it('should navigate to profile when "Mi perfil" is clicked', async () => {
      render(<Navbar />);
      
      const hamburgerButton = screen.getByLabelText('Abrir menú');
      fireEvent.click(hamburgerButton);

      await waitFor(() => {
        const profileButton = screen.getByText('Mi perfil');
        fireEvent.click(profileButton);
      });

      expect(mockPush).toHaveBeenCalledWith('/account/profile');
    });

    it('should navigate to security when "Seguridad" is clicked', async () => {
      render(<Navbar />);
      
      const hamburgerButton = screen.getByLabelText('Abrir menú');
      fireEvent.click(hamburgerButton);

      await waitFor(() => {
        const securityButton = screen.getByText('Seguridad');
        fireEvent.click(securityButton);
      });

      expect(mockPush).toHaveBeenCalledWith('/account/security');
    });

    it('should navigate to settings when "Configuración" is clicked', async () => {
      render(<Navbar />);
      
      const hamburgerButton = screen.getByLabelText('Abrir menú');
      fireEvent.click(hamburgerButton);

      await waitFor(() => {
        const settingsButton = screen.getByText('Configuración');
        fireEvent.click(settingsButton);
      });

      expect(mockPush).toHaveBeenCalledWith('/account/preferences');
    });

    it('should logout and redirect when "Cerrar sesión" is clicked', async () => {
      mockLogout.mockResolvedValue(undefined);
      render(<Navbar />);
      
      const hamburgerButton = screen.getByLabelText('Abrir menú');
      fireEvent.click(hamburgerButton);

      await waitFor(() => {
        const logoutButton = screen.getByText('Cerrar sesión');
        fireEvent.click(logoutButton);
      });

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });

    it('should close drawer when close button is clicked', async () => {
      render(<Navbar />);
      
      const hamburgerButton = screen.getByLabelText('Abrir menú');
      fireEvent.click(hamburgerButton);

      await waitFor(() => {
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
      });

      const closeButton = screen.getByLabelText('Cerrar menú');
      fireEvent.click(closeButton);

      await waitFor(() => {
        // Drawer should be closed (content not visible)
        expect(screen.queryByText('test@example.com')).not.toBeInTheDocument();
      });
    });

    it('should close drawer after navigation', async () => {
      render(<Navbar />);
      
      const hamburgerButton = screen.getByLabelText('Abrir menú');
      fireEvent.click(hamburgerButton);

      await waitFor(() => {
        const profileButton = screen.getByText('Mi perfil');
        fireEvent.click(profileButton);
      });

      await waitFor(() => {
        // Drawer should be closed after navigation
        expect(screen.queryByText('test@example.com')).not.toBeInTheDocument();
      });
    });

    it('should handle logout error gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockLogout.mockRejectedValue(new Error('Logout failed'));
      
      render(<Navbar />);
      
      const hamburgerButton = screen.getByLabelText('Abrir menú');
      fireEvent.click(hamburgerButton);

      await waitFor(() => {
        const logoutButton = screen.getByText('Cerrar sesión');
        fireEvent.click(logoutButton);
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Logout failed:',
          expect.any(Error)
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Responsive behavior', () => {
    it('should use md: breakpoint for responsive behavior', () => {
      const { container } = render(<Navbar />);
      
      // Check that desktop UserMenu has hidden class for mobile
      const desktopMenu = container.querySelector('.hidden.md\\:flex');
      expect(desktopMenu).toBeInTheDocument();

      // Check that mobile hamburger has hidden class for desktop
      const mobileButton = container.querySelector('.md\\:hidden');
      expect(mobileButton).toBeInTheDocument();
    });
  });
});
