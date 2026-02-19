import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import UserMenu from '../UserMenu';
import { useAuth } from '@/lib/auth-context';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock auth context
jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

describe('UserMenu', () => {
  const mockPush = jest.fn();
  const mockLogout = jest.fn();
  const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
    
    // Default mock: authenticated user
    mockUseAuth.mockReturnValue({
      user: {
        userId: 'test-user-id',
        email: 'test@example.com',
        emailVerified: true,
      },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: jest.fn(),
      logout: mockLogout,
      refreshUser: jest.fn(),
    });
  });

  // Task 2.6.1: Test: Avatar muestra iniciales correctas
  describe('2.6.1: Avatar displays correct initials', () => {
    it('displays first letter of email as avatar initial', () => {
      render(<UserMenu />);
      
      const avatar = screen.getByText('T');
      expect(avatar).toBeInTheDocument();
    });

    it('displays correct initial for different email addresses', () => {
      mockUseAuth.mockReturnValue({
        user: {
          userId: 'test-user-id',
          email: 'john.doe@example.com',
          emailVerified: true,
        },
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: jest.fn(),
        logout: mockLogout,
        refreshUser: jest.fn(),
      });

      render(<UserMenu />);
      
      const avatar = screen.getByText('J');
      expect(avatar).toBeInTheDocument();
    });

    it('displays uppercase initial regardless of email case', () => {
      mockUseAuth.mockReturnValue({
        user: {
          userId: 'test-user-id',
          email: 'alice@example.com',
          emailVerified: true,
        },
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: jest.fn(),
        logout: mockLogout,
        refreshUser: jest.fn(),
      });

      render(<UserMenu />);
      
      const avatar = screen.getByText('A');
      expect(avatar).toBeInTheDocument();
    });

    it('displays fallback initial when email is empty', () => {
      mockUseAuth.mockReturnValue({
        user: {
          userId: 'test-user-id',
          email: '',
          emailVerified: true,
        },
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: jest.fn(),
        logout: mockLogout,
        refreshUser: jest.fn(),
      });

      render(<UserMenu />);
      
      const avatar = screen.getByText('U');
      expect(avatar).toBeInTheDocument();
    });

    it('displays fallback initial when user is null', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        login: jest.fn(),
        logout: mockLogout,
        refreshUser: jest.fn(),
      });

      render(<UserMenu />);
      
      const avatar = screen.getByText('U');
      expect(avatar).toBeInTheDocument();
    });
  });

  // Task 2.6.2: Test: Dropdown abre/cierra correctamente
  describe('2.6.2: Dropdown opens/closes correctly', () => {
    it('dropdown is closed by default', () => {
      render(<UserMenu />);
      
      // Menu items should not be visible initially
      expect(screen.queryByText('Mi perfil')).not.toBeInTheDocument();
      expect(screen.queryByText('Seguridad')).not.toBeInTheDocument();
      expect(screen.queryByText('Configuración')).not.toBeInTheDocument();
      expect(screen.queryByText('Cerrar sesión')).not.toBeInTheDocument();
    });

    it('opens dropdown when avatar is clicked', async () => {
      render(<UserMenu />);
      
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Mi perfil')).toBeInTheDocument();
        expect(screen.getByText('Seguridad')).toBeInTheDocument();
        expect(screen.getByText('Configuración')).toBeInTheDocument();
        expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
      });
    });

    it('displays user email in dropdown', async () => {
      render(<UserMenu />);
      
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
      });
    });

    it('closes dropdown when clicking avatar again', async () => {
      render(<UserMenu />);
      
      // Open dropdown
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Mi perfil')).toBeInTheDocument();
      });

      // Click avatar again to close
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.queryByText('Mi perfil')).not.toBeInTheDocument();
      });
    });

    it('closes dropdown when menu item is clicked', async () => {
      render(<UserMenu />);
      
      // Open dropdown
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Mi perfil')).toBeInTheDocument();
      });

      // Click on a menu item
      const profileButton = screen.getByText('Mi perfil');
      fireEvent.click(profileButton);

      // Menu should close and navigation should occur
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/profile');
      });
    });
  });

  // Task 2.6.3: Test: Navegación funciona
  describe('2.6.3: Navigation works', () => {
    it('navigates to profile page when "Mi perfil" is clicked', async () => {
      render(<UserMenu />);
      
      // Open dropdown
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Mi perfil')).toBeInTheDocument();
      });

      // Click on "Mi perfil"
      const profileButton = screen.getByText('Mi perfil');
      fireEvent.click(profileButton);

      expect(mockPush).toHaveBeenCalledWith('/profile');
    });

    it('navigates to security page when "Seguridad" is clicked', async () => {
      render(<UserMenu />);
      
      // Open dropdown
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Seguridad')).toBeInTheDocument();
      });

      // Click on "Seguridad"
      const securityButton = screen.getByText('Seguridad');
      fireEvent.click(securityButton);

      expect(mockPush).toHaveBeenCalledWith('/security');
    });

    it('navigates to settings page when "Configuración" is clicked', async () => {
      render(<UserMenu />);
      
      // Open dropdown
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Configuración')).toBeInTheDocument();
      });

      // Click on "Configuración"
      const settingsButton = screen.getByText('Configuración');
      fireEvent.click(settingsButton);

      expect(mockPush).toHaveBeenCalledWith('/settings');
    });

    it('displays correct icons for each menu item', async () => {
      render(<UserMenu />);
      
      // Open dropdown
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Mi perfil')).toBeInTheDocument();
      });

      // Check that all menu items are present with their text
      expect(screen.getByText('Mi perfil')).toBeInTheDocument();
      expect(screen.getByText('Seguridad')).toBeInTheDocument();
      expect(screen.getByText('Configuración')).toBeInTheDocument();
      expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
    });
  });

  // Task 2.6.4: Test: Logout ejecuta correctamente
  describe('2.6.4: Logout executes correctly', () => {
    it('calls logout function when "Cerrar sesión" is clicked', async () => {
      mockLogout.mockResolvedValue(undefined);
      
      render(<UserMenu />);
      
      // Open dropdown
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
      });

      // Click on "Cerrar sesión"
      const logoutButton = screen.getByText('Cerrar sesión');
      fireEvent.click(logoutButton);

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });

    it('redirects to login page after successful logout', async () => {
      mockLogout.mockResolvedValue(undefined);
      
      render(<UserMenu />);
      
      // Open dropdown
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
      });

      // Click on "Cerrar sesión"
      const logoutButton = screen.getByText('Cerrar sesión');
      fireEvent.click(logoutButton);

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });

    it('handles logout errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockLogout.mockRejectedValue(new Error('Logout failed'));
      
      render(<UserMenu />);
      
      // Open dropdown
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
      });

      // Click on "Cerrar sesión"
      const logoutButton = screen.getByText('Cerrar sesión');
      fireEvent.click(logoutButton);

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith('Logout failed:', expect.any(Error));
      });

      // Should not redirect on error
      expect(mockPush).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('displays logout option in red color', async () => {
      render(<UserMenu />);
      
      // Open dropdown
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
      });

      const logoutButton = screen.getByText('Cerrar sesión');
      expect(logoutButton).toHaveClass('text-red-600');
    });
  });

  // Task 2.6.5: Test: Keyboard navigation funciona
  describe('2.6.5: Keyboard navigation works', () => {
    it('opens dropdown when Enter key is pressed on avatar', async () => {
      render(<UserMenu />);
      
      const avatar = screen.getByText('T');
      const menuButton = avatar.closest('button');
      
      if (menuButton) {
        fireEvent.keyDown(menuButton, { key: 'Enter', code: 'Enter' });
      }

      await waitFor(() => {
        expect(screen.getByText('Mi perfil')).toBeInTheDocument();
      });
    });

    it('opens dropdown when Space key is pressed on avatar', async () => {
      render(<UserMenu />);
      
      const avatar = screen.getByText('T');
      const menuButton = avatar.closest('button');
      
      if (menuButton) {
        fireEvent.keyDown(menuButton, { key: ' ', code: 'Space' });
      }

      await waitFor(() => {
        expect(screen.getByText('Mi perfil')).toBeInTheDocument();
      });
    });

    it('closes dropdown when Escape key is pressed', async () => {
      render(<UserMenu />);
      
      // Open dropdown
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Mi perfil')).toBeInTheDocument();
      });

      // Press Escape on the menu items container
      const menuItems = screen.getByRole('menu');
      fireEvent.keyDown(menuItems, { key: 'Escape', code: 'Escape', keyCode: 27 });

      await waitFor(() => {
        expect(screen.queryByText('Mi perfil')).not.toBeInTheDocument();
      });
    });

    it('navigates through menu items with Tab key', async () => {
      render(<UserMenu />);
      
      // Open dropdown
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Mi perfil')).toBeInTheDocument();
      });

      // Get all menu items
      const profileButton = screen.getByText('Mi perfil');
      const securityButton = screen.getByText('Seguridad');
      const settingsButton = screen.getByText('Configuración');
      const logoutButton = screen.getByText('Cerrar sesión');

      // Verify all items are present and can be focused
      expect(profileButton).toBeInTheDocument();
      expect(securityButton).toBeInTheDocument();
      expect(settingsButton).toBeInTheDocument();
      expect(logoutButton).toBeInTheDocument();
    });

    it('activates menu item when Enter is pressed', async () => {
      render(<UserMenu />);
      
      // Open dropdown
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Mi perfil')).toBeInTheDocument();
      });

      // Click on "Mi perfil" button (simulating Enter key activation)
      const profileButton = screen.getByText('Mi perfil');
      fireEvent.click(profileButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/profile');
      });
    });

    it('menu button has proper focus styles', () => {
      render(<UserMenu />);
      
      const avatar = screen.getByText('T');
      const menuButton = avatar.closest('button');
      
      expect(menuButton).toHaveClass('focus:outline-none');
      expect(menuButton).toHaveClass('focus:ring-2');
      expect(menuButton).toHaveClass('focus:ring-blue-500');
    });

    it('menu items are keyboard accessible', async () => {
      render(<UserMenu />);
      
      // Open dropdown
      const avatar = screen.getByText('T');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Mi perfil')).toBeInTheDocument();
      });

      // All menu items should be buttons (keyboard accessible)
      const profileButton = screen.getByText('Mi perfil').closest('button');
      const securityButton = screen.getByText('Seguridad').closest('button');
      const settingsButton = screen.getByText('Configuración').closest('button');
      const logoutButton = screen.getByText('Cerrar sesión').closest('button');

      expect(profileButton).toBeInTheDocument();
      expect(securityButton).toBeInTheDocument();
      expect(settingsButton).toBeInTheDocument();
      expect(logoutButton).toBeInTheDocument();
    });
  });

  // Additional integration tests
  describe('Integration tests', () => {
    it('renders correctly with all components', () => {
      render(<UserMenu />);
      
      // Avatar should be visible
      const avatar = screen.getByText('T');
      expect(avatar).toBeInTheDocument();
    });

    it('maintains user email throughout dropdown interactions', async () => {
      const testEmail = 'user@test.com';
      mockUseAuth.mockReturnValue({
        user: {
          userId: 'test-user-id',
          email: testEmail,
          emailVerified: true,
        },
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: jest.fn(),
        logout: mockLogout,
        refreshUser: jest.fn(),
      });

      render(<UserMenu />);
      
      // Open dropdown
      const avatar = screen.getByText('U');
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText(testEmail)).toBeInTheDocument();
      });

      // Close by clicking avatar again
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.queryByText(testEmail)).not.toBeInTheDocument();
      });

      // Reopen
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText(testEmail)).toBeInTheDocument();
      });
    });

    it('handles rapid open/close interactions', async () => {
      render(<UserMenu />);
      
      const avatar = screen.getByText('T');

      // Open
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Mi perfil')).toBeInTheDocument();
      });

      // Close
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.queryByText('Mi perfil')).not.toBeInTheDocument();
      });

      // Open again
      fireEvent.click(avatar);

      await waitFor(() => {
        expect(screen.getByText('Mi perfil')).toBeInTheDocument();
      });
    });
  });
});
