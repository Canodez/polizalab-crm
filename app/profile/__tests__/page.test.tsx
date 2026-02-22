import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import ProfilePage from '../page';
import { useAuth } from '@/lib/auth-context';
import { profileApi } from '@/lib/api-client';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock auth context
jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

// Mock API client
jest.mock('@/lib/api-client', () => ({
  profileApi: {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    getImageUploadUrl: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public statusCode: number) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

// Mock react-dropzone
jest.mock('react-dropzone', () => ({
  useDropzone: jest.fn(() => ({
    getRootProps: jest.fn(() => ({})),
    getInputProps: jest.fn(() => ({})),
    isDragActive: false,
  })),
}));

// Mock date-fns
jest.mock('date-fns', () => ({
  format: jest.fn((date, formatStr) => '15 Feb 2026'),
  formatDistanceToNow: jest.fn(() => 'hace 5 minutos'),
}));

jest.mock('date-fns/locale', () => ({
  es: {},
}));

// Mock UserMenu component
jest.mock('@/components/UserMenu', () => {
  return function MockUserMenu() {
    return <div data-testid="user-menu">UserMenu</div>;
  };
});

// Mock ImagePreview component
jest.mock('@/components/ImagePreview', () => {
  return function MockImagePreview() {
    return <div data-testid="image-preview">ImagePreview</div>;
  };
});

describe('ProfilePage - Account Information Section', () => {
  const mockPush = jest.fn();
  const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
  const mockGetProfile = profileApi.getProfile as jest.MockedFunction<typeof profileApi.getProfile>;

  const mockProfileData = {
    userId: 'test-user-123',
    email: 'test@example.com',
    nombre: 'Juan',
    apellido: 'Pérez',
    profileImage: null,
    profileImageUrl: null,
    createdAt: '2026-02-15T10:00:00Z',
    lastLoginAt: '2026-02-21T14:30:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });

    mockUseAuth.mockReturnValue({
      user: {
        userId: 'test-user-123',
        email: 'test@example.com',
        emailVerified: true,
      },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    mockGetProfile.mockResolvedValue(mockProfileData);
  });

  // Task 7.6.1: Test: Email verificado muestra correctamente
  describe('7.6.1: Email verification status displays correctly', () => {
    it('shows verified badge when email is verified', async () => {
      mockUseAuth.mockReturnValue({
        user: {
          userId: 'test-user-123',
          email: 'test@example.com',
          emailVerified: true,
        },
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: jest.fn(),
        logout: jest.fn(),
        refreshUser: jest.fn(),
      });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('Email verificado')).toBeInTheDocument();
      });

      // Check for verified badge with "Sí" text
      const verifiedBadge = screen.getByText('Sí');
      expect(verifiedBadge).toBeInTheDocument();
      expect(verifiedBadge.closest('span')).toHaveClass('bg-green-100', 'text-green-800');
    });

    it('shows unverified badge when email is not verified', async () => {
      mockUseAuth.mockReturnValue({
        user: {
          userId: 'test-user-123',
          email: 'test@example.com',
          emailVerified: false,
        },
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: jest.fn(),
        logout: jest.fn(),
        refreshUser: jest.fn(),
      });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('Email verificado')).toBeInTheDocument();
      });

      // Check for unverified badge with "No" text
      const unverifiedBadge = screen.getByText('No');
      expect(unverifiedBadge).toBeInTheDocument();
      expect(unverifiedBadge.closest('span')).toHaveClass('bg-red-100', 'text-red-800');
    });

    it('displays checkmark icon for verified email', async () => {
      mockUseAuth.mockReturnValue({
        user: {
          userId: 'test-user-123',
          email: 'test@example.com',
          emailVerified: true,
        },
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: jest.fn(),
        logout: jest.fn(),
        refreshUser: jest.fn(),
      });

      render(<ProfilePage />);

      await waitFor(() => {
        const verifiedBadge = screen.getByText('Sí').closest('span');
        expect(verifiedBadge).toBeInTheDocument();
        
        // Check for SVG checkmark icon
        const svg = verifiedBadge?.querySelector('svg');
        expect(svg).toBeInTheDocument();
      });
    });

    it('displays X icon for unverified email', async () => {
      mockUseAuth.mockReturnValue({
        user: {
          userId: 'test-user-123',
          email: 'test@example.com',
          emailVerified: false,
        },
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: jest.fn(),
        logout: jest.fn(),
        refreshUser: jest.fn(),
      });

      render(<ProfilePage />);

      await waitFor(() => {
        const unverifiedBadge = screen.getByText('No').closest('span');
        expect(unverifiedBadge).toBeInTheDocument();
        
        // Check for SVG X icon
        const svg = unverifiedBadge?.querySelector('svg');
        expect(svg).toBeInTheDocument();
      });
    });
  });

  // Task 7.6.2: Test: Fechas se formatean correctamente
  describe('7.6.2: Dates are formatted correctly', () => {
    it('displays registration date in correct format', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('Fecha de registro')).toBeInTheDocument();
      });

      // Check that the formatted date is displayed
      expect(screen.getByText('15 Feb 2026')).toBeInTheDocument();
    });

    it('displays last login date as relative time', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('Último inicio de sesión')).toBeInTheDocument();
      });

      // Check that the relative time is displayed
      expect(screen.getByText('hace 5 minutos')).toBeInTheDocument();
    });

    it('does not display last login section when lastLoginAt is not available', async () => {
      const profileWithoutLastLogin = {
        ...mockProfileData,
        lastLoginAt: undefined,
      };
      mockGetProfile.mockResolvedValue(profileWithoutLastLogin);

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('Fecha de registro')).toBeInTheDocument();
      });

      // Last login section should not be present
      expect(screen.queryByText('Último inicio de sesión')).not.toBeInTheDocument();
    });

    it('displays calendar icon next to registration date', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        const registrationDateRow = screen.getByText('Fecha de registro').closest('div');
        expect(registrationDateRow).toBeInTheDocument();
        
        // Check for calendar icon (SVG)
        const svg = registrationDateRow?.querySelector('svg');
        expect(svg).toBeInTheDocument();
      });
    });

    it('displays calendar icon next to last login date', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        const lastLoginRow = screen.getByText('Último inicio de sesión').closest('div');
        expect(lastLoginRow).toBeInTheDocument();
        
        // Check for calendar icon (SVG)
        const svg = lastLoginRow?.querySelector('svg');
        expect(svg).toBeInTheDocument();
      });
    });

    it('formats dates using Spanish locale', async () => {
      const { format, formatDistanceToNow } = require('date-fns');
      const { es } = require('date-fns/locale');

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('Fecha de registro')).toBeInTheDocument();
      });

      // Verify that format was called with Spanish locale
      expect(format).toHaveBeenCalledWith(
        expect.any(Date),
        'd MMM yyyy',
        { locale: es }
      );

      // Verify that formatDistanceToNow was called with Spanish locale
      expect(formatDistanceToNow).toHaveBeenCalledWith(
        expect.any(Date),
        { addSuffix: true, locale: es }
      );
    });
  });

  // Task 7.6.3: Test: ID se oculta/muestra correctamente
  describe('7.6.3: User ID show/hide functionality', () => {
    it('displays user ID as hidden by default', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      });

      // Check that the ID is hidden (showing dots)
      expect(screen.getByText('••••••••••••••••')).toBeInTheDocument();
      
      // Check that the actual ID is not visible
      expect(screen.queryByText('test-user-123')).not.toBeInTheDocument();
    });

    it('shows user ID when show button is clicked', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      });

      // Find and click the show button
      const showButton = screen.getByLabelText('Mostrar ID de usuario');
      fireEvent.click(showButton);

      // Check that the actual ID is now visible
      expect(screen.getByText('test-user-123')).toBeInTheDocument();
      
      // Check that the dots are no longer visible
      expect(screen.queryByText('••••••••••••••••')).not.toBeInTheDocument();
    });

    it('hides user ID when hide button is clicked after showing', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      });

      // Show the ID first
      const showButton = screen.getByLabelText('Mostrar ID de usuario');
      fireEvent.click(showButton);

      await waitFor(() => {
        expect(screen.getByText('test-user-123')).toBeInTheDocument();
      });

      // Now hide it again
      const hideButton = screen.getByLabelText('Ocultar ID de usuario');
      fireEvent.click(hideButton);

      // Check that the ID is hidden again
      expect(screen.getByText('••••••••••••••••')).toBeInTheDocument();
      expect(screen.queryByText('test-user-123')).not.toBeInTheDocument();
    });

    it('displays eye icon when ID is hidden', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      });

      const showButton = screen.getByLabelText('Mostrar ID de usuario');
      expect(showButton).toBeInTheDocument();
      
      // Check that the button contains an SVG (eye icon)
      const svg = showButton.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('displays eye-slash icon when ID is shown', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      });

      // Show the ID
      const showButton = screen.getByLabelText('Mostrar ID de usuario');
      fireEvent.click(showButton);

      await waitFor(() => {
        const hideButton = screen.getByLabelText('Ocultar ID de usuario');
        expect(hideButton).toBeInTheDocument();
        
        // Check that the button contains an SVG (eye-slash icon)
        const svg = hideButton.querySelector('svg');
        expect(svg).toBeInTheDocument();
      });
    });

    it('toggles between show and hide states multiple times', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      });

      // Initially hidden
      expect(screen.getByText('••••••••••••••••')).toBeInTheDocument();

      // Show
      fireEvent.click(screen.getByLabelText('Mostrar ID de usuario'));
      await waitFor(() => {
        expect(screen.getByText('test-user-123')).toBeInTheDocument();
      });

      // Hide
      fireEvent.click(screen.getByLabelText('Ocultar ID de usuario'));
      await waitFor(() => {
        expect(screen.getByText('••••••••••••••••')).toBeInTheDocument();
      });

      // Show again
      fireEvent.click(screen.getByLabelText('Mostrar ID de usuario'));
      await waitFor(() => {
        expect(screen.getByText('test-user-123')).toBeInTheDocument();
      });
    });

    it('displays user ID in monospace font', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      });

      // Show the ID
      const showButton = screen.getByLabelText('Mostrar ID de usuario');
      fireEvent.click(showButton);

      await waitFor(() => {
        const userIdElement = screen.getByText('test-user-123');
        expect(userIdElement).toHaveClass('font-mono');
      });
    });
  });

  // Task 7.6.4: Test: Copiar al clipboard funciona
  describe('7.6.4: Copy to clipboard functionality', () => {
    let mockClipboard: { writeText: jest.Mock };

    beforeEach(() => {
      // Mock clipboard API
      mockClipboard = {
        writeText: jest.fn().mockResolvedValue(undefined),
      };
      Object.assign(navigator, {
        clipboard: mockClipboard,
      });
    });

    it('displays copy button next to user ID', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      });

      const copyButton = screen.getByLabelText('Copiar ID de usuario');
      expect(copyButton).toBeInTheDocument();
    });

    it('copies user ID to clipboard when copy button is clicked', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      });

      const copyButton = screen.getByLabelText('Copiar ID de usuario');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith('test-user-123');
      });
    });

    it('shows checkmark icon after successful copy', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      });

      const copyButton = screen.getByLabelText('Copiar ID de usuario');
      fireEvent.click(copyButton);

      await waitFor(() => {
        // Check that the checkmark icon is displayed
        const svg = copyButton.querySelector('svg');
        expect(svg).toBeInTheDocument();
        expect(svg).toHaveClass('text-green-600');
      });
    });

    it('reverts to clipboard icon after 2 seconds', async () => {
      jest.useFakeTimers();

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      });

      const copyButton = screen.getByLabelText('Copiar ID de usuario');
      fireEvent.click(copyButton);

      // Wait for the checkmark to appear
      await waitFor(() => {
        const svg = copyButton.querySelector('svg');
        expect(svg).toHaveClass('text-green-600');
      });

      // Fast-forward time by 2 seconds
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      // Wait for the icon to revert
      await waitFor(() => {
        const svg = copyButton.querySelector('svg');
        expect(svg).not.toHaveClass('text-green-600');
      });

      jest.useRealTimers();
    });

    it('handles clipboard copy errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockClipboard.writeText.mockRejectedValue(new Error('Clipboard error'));

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      });

      const copyButton = screen.getByLabelText('Copiar ID de usuario');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to copy user ID:',
          expect.any(Error)
        );
      });

      // Check that error message is displayed
      await waitFor(() => {
        expect(screen.getByText('Error al copiar el ID de usuario')).toBeInTheDocument();
      });

      consoleErrorSpy.mockRestore();
    });

    it('does not copy if user ID is not available', async () => {
      mockUseAuth.mockReturnValue({
        user: {
          userId: undefined as any,
          email: 'test@example.com',
          emailVerified: true,
        },
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: jest.fn(),
        logout: jest.fn(),
        refreshUser: jest.fn(),
      });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      });

      const copyButton = screen.getByLabelText('Copiar ID de usuario');
      fireEvent.click(copyButton);

      // Clipboard should not be called
      expect(mockClipboard.writeText).not.toHaveBeenCalled();
    });

    it('displays clipboard icon by default', async () => {
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      });

      const copyButton = screen.getByLabelText('Copiar ID de usuario');
      const svg = copyButton.querySelector('svg');
      
      expect(svg).toBeInTheDocument();
      expect(svg).not.toHaveClass('text-green-600');
    });

    it('allows multiple copy operations', async () => {
      jest.useFakeTimers();

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText('ID de usuario')).toBeInTheDocument();
      });

      const copyButton = screen.getByLabelText('Copiar ID de usuario');

      // First copy
      fireEvent.click(copyButton);
      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledTimes(1);
      });

      // Wait for icon to revert
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      // Second copy
      fireEvent.click(copyButton);
      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledTimes(2);
      });

      jest.useRealTimers();
    });
  });
});
