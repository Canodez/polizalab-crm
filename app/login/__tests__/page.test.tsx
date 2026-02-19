import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoginPage from '../page';
import { loginUser } from '@/lib/auth';
import { useAuth } from '@/lib/auth-context';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Mock auth module
jest.mock('@/lib/auth', () => ({
  loginUser: jest.fn(),
}));

// Mock auth context
jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

describe('LoginPage', () => {
  const mockPush = jest.fn();
  const mockLoginUser = loginUser as jest.MockedFunction<typeof loginUser>;
  const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
  const mockSearchParams = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
    (useSearchParams as jest.Mock).mockReturnValue(mockSearchParams);
    mockSearchParams.get.mockReturnValue(null);
    
    // Default mock: user is not authenticated and not loading
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });
  });

  it('renders login form with all fields', () => {
    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('displays success message when redirected from registration', () => {
    mockSearchParams.get.mockReturnValue('true');
    
    render(<LoginPage />);

    expect(
      screen.getByText('¡Cuenta creada exitosamente! Ahora puedes iniciar sesión.')
    ).toBeInTheDocument();
  });

  it('does not display success message when not redirected from registration', () => {
    mockSearchParams.get.mockReturnValue(null);
    
    render(<LoginPage />);

    expect(
      screen.queryByText('¡Cuenta creada exitosamente! Ahora puedes iniciar sesión.')
    ).not.toBeInTheDocument();
  });

  it('displays validation error for empty email', async () => {
    render(<LoginPage />);

    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('El correo electrónico es requerido')).toBeInTheDocument();
    });
  });

  it('displays validation error for invalid email format', async () => {
    render(<LoginPage />);

    const emailInput = screen.getByLabelText('Correo electrónico') as HTMLInputElement;
    const passwordInput = screen.getByLabelText('Contraseña');
    
    // Fill in fields with invalid email
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    // Submit form directly to bypass HTML5 validation
    const form = emailInput.closest('form');
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(screen.getByText('Ingresa un correo electrónico válido')).toBeInTheDocument();
    });
  });

  it('displays validation error for empty password', async () => {
    render(<LoginPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('La contraseña es requerida')).toBeInTheDocument();
    });
  });

  it('clears validation error when user starts typing', async () => {
    render(<LoginPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

    // Trigger validation error
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('El correo electrónico es requerido')).toBeInTheDocument();
    });

    // Start typing
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

    // Error should be cleared
    expect(screen.queryByText('El correo electrónico es requerido')).not.toBeInTheDocument();
  });

  it('successfully logs in user and redirects to home', async () => {
    mockLoginUser.mockResolvedValueOnce({
      accessToken: 'test-access-token',
      idToken: 'test-id-token',
      refreshToken: 'test-refresh-token',
    });

    render(<LoginPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    const passwordInput = screen.getByLabelText('Contraseña');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockLoginUser).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('displays error message for invalid credentials', async () => {
    const errorMessage = 'Invalid email or password';
    mockLoginUser.mockRejectedValueOnce(new Error(errorMessage));

    render(<LoginPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    const passwordInput = screen.getByLabelText('Contraseña');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });

    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    // Should not redirect on error
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('displays error message when login fails', async () => {
    const errorMessage = 'Login failed: Network error';
    mockLoginUser.mockRejectedValueOnce(new Error(errorMessage));

    render(<LoginPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    const passwordInput = screen.getByLabelText('Contraseña');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    // Should not redirect on error
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('disables form during submission', async () => {
    mockLoginUser.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(<LoginPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    const passwordInput = screen.getByLabelText('Contraseña');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });
    fireEvent.click(submitButton);

    // Check that button shows loading state
    await waitFor(() => {
      expect(screen.getByText('Iniciando sesión...')).toBeInTheDocument();
    });

    // Check that inputs are disabled
    expect(emailInput).toBeDisabled();
    expect(passwordInput).toBeDisabled();
    expect(submitButton).toBeDisabled();
  });

  it('has link to registration page', () => {
    render(<LoginPage />);

    const registerLink = screen.getByText('Crear cuenta');
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute('href', '/register');
  });

  it('has minimum touch target size for submit button', () => {
    render(<LoginPage />);

    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });
    
    // Check minHeight is set to 44px (mobile-first requirement)
    expect(submitButton).toHaveStyle({ minHeight: '44px' });
  });

  it('uses correct autocomplete attributes', () => {
    render(<LoginPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    const passwordInput = screen.getByLabelText('Contraseña');

    expect(emailInput).toHaveAttribute('autocomplete', 'email');
    expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
  });

  it('clears error message when resubmitting form', async () => {
    const errorMessage = 'Invalid email or password';
    mockLoginUser.mockRejectedValueOnce(new Error(errorMessage));

    render(<LoginPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    const passwordInput = screen.getByLabelText('Contraseña');
    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

    // First submission - should fail
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    // Second submission - error should be cleared before new attempt
    mockLoginUser.mockResolvedValueOnce({
      accessToken: 'test-access-token',
      idToken: 'test-id-token',
      refreshToken: 'test-refresh-token',
    });

    fireEvent.change(passwordInput, { target: { value: 'correctpassword' } });
    fireEvent.click(submitButton);

    // Error should be cleared immediately on resubmit
    await waitFor(() => {
      expect(screen.queryByText(errorMessage)).not.toBeInTheDocument();
    });
  });

  // New tests for session detection (Task 1.1)
  it('shows loading spinner while checking authentication', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
      login: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    render(<LoginPage />);

    expect(screen.getByText('Verificando sesión...')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
  });

  it('shows already logged in view when user is authenticated', () => {
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
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    render(<LoginPage />);

    expect(screen.getByText('Ya tienes sesión iniciada')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir a mi perfil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('navigates to profile when clicking "Ir a mi perfil" button', () => {
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
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    render(<LoginPage />);

    const profileButton = screen.getByRole('button', { name: 'Ir a mi perfil' });
    fireEvent.click(profileButton);

    expect(mockPush).toHaveBeenCalledWith('/profile');
  });

  it('shows login form when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn(),
      refreshUser: jest.fn(),
    });

    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
  });

  // Task 1.4: Testing de login inteligente
  describe('Task 1.4: Smart Login Testing', () => {
    // 1.4.1: Test: Usuario sin sesión ve formulario
    describe('1.4.1: User without session sees form', () => {
      it('displays login form with all fields when user is not authenticated', () => {
        mockUseAuth.mockReturnValue({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          login: jest.fn(),
          logout: jest.fn(),
          refreshUser: jest.fn(),
        });

        render(<LoginPage />);

        // Verify form elements are present
        expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
        expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
        expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
        
        // Verify AlreadyLoggedInView is NOT shown
        expect(screen.queryByText('Ya tienes sesión iniciada')).not.toBeInTheDocument();
      });

      it('does not show loading spinner when auth check is complete', () => {
        mockUseAuth.mockReturnValue({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          login: jest.fn(),
          logout: jest.fn(),
          refreshUser: jest.fn(),
        });

        render(<LoginPage />);

        expect(screen.queryByText('Verificando sesión...')).not.toBeInTheDocument();
        expect(screen.queryByRole('status', { name: 'Cargando' })).not.toBeInTheDocument();
      });
    });

    // 1.4.2: Test: Usuario con sesión ve AlreadyLoggedInView
    describe('1.4.2: User with session sees AlreadyLoggedInView', () => {
      it('displays AlreadyLoggedInView when user is authenticated', () => {
        mockUseAuth.mockReturnValue({
          user: {
            userId: 'test-user-id',
            email: 'authenticated@example.com',
            emailVerified: true,
          },
          isAuthenticated: true,
          isLoading: false,
          error: null,
          login: jest.fn(),
          logout: jest.fn(),
          refreshUser: jest.fn(),
        });

        render(<LoginPage />);

        // Verify AlreadyLoggedInView is shown
        expect(screen.getByText('Ya tienes sesión iniciada')).toBeInTheDocument();
        expect(screen.getByText('authenticated@example.com')).toBeInTheDocument();
        
        // Verify login form is NOT shown
        expect(screen.queryByLabelText('Correo electrónico')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
      });

      it('shows user email in AlreadyLoggedInView', () => {
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
          logout: jest.fn(),
          refreshUser: jest.fn(),
        });

        render(<LoginPage />);

        expect(screen.getByText(testEmail)).toBeInTheDocument();
        expect(screen.getByText('Sesión activa como:')).toBeInTheDocument();
      });

      it('does not show AlreadyLoggedInView when user is not authenticated', () => {
        mockUseAuth.mockReturnValue({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          login: jest.fn(),
          logout: jest.fn(),
          refreshUser: jest.fn(),
        });

        render(<LoginPage />);

        expect(screen.queryByText('Ya tienes sesión iniciada')).not.toBeInTheDocument();
      });
    });

    // 1.4.3: Test: Sesión expirada muestra mensaje correcto
    describe('1.4.3: Expired session shows correct message', () => {
      it('displays expired session warning when expired=true query param is present', () => {
        mockSearchParams.get.mockImplementation((key) => {
          if (key === 'expired') return 'true';
          return null;
        });

        mockUseAuth.mockReturnValue({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          login: jest.fn(),
          logout: jest.fn(),
          refreshUser: jest.fn(),
        });

        render(<LoginPage />);

        expect(screen.getByText('Tu sesión expiró')).toBeInTheDocument();
        expect(screen.getByText('Por favor, inicia sesión nuevamente para continuar.')).toBeInTheDocument();
      });

      it('shows restart session button when session expired', () => {
        mockSearchParams.get.mockImplementation((key) => {
          if (key === 'expired') return 'true';
          return null;
        });

        mockUseAuth.mockReturnValue({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          login: jest.fn(),
          logout: jest.fn(),
          refreshUser: jest.fn(),
        });

        render(<LoginPage />);

        const restartButton = screen.getByRole('button', { name: 'Reiniciar sesión' });
        expect(restartButton).toBeInTheDocument();
      });

      it('redirects to clean login page when restart session button is clicked', () => {
        mockSearchParams.get.mockImplementation((key) => {
          if (key === 'expired') return 'true';
          return null;
        });

        mockUseAuth.mockReturnValue({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          login: jest.fn(),
          logout: jest.fn(),
          refreshUser: jest.fn(),
        });

        render(<LoginPage />);

        const restartButton = screen.getByRole('button', { name: 'Reiniciar sesión' });
        fireEvent.click(restartButton);

        expect(mockPush).toHaveBeenCalledWith('/login');
      });

      it('does not show expired session warning when expired param is not present', () => {
        mockSearchParams.get.mockReturnValue(null);

        mockUseAuth.mockReturnValue({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          login: jest.fn(),
          logout: jest.fn(),
          refreshUser: jest.fn(),
        });

        render(<LoginPage />);

        expect(screen.queryByText('Tu sesión expiró')).not.toBeInTheDocument();
      });

      it('shows login form along with expired session message', () => {
        mockSearchParams.get.mockImplementation((key) => {
          if (key === 'expired') return 'true';
          return null;
        });

        mockUseAuth.mockReturnValue({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          login: jest.fn(),
          logout: jest.fn(),
          refreshUser: jest.fn(),
        });

        render(<LoginPage />);

        // Both expired message and login form should be visible
        expect(screen.getByText('Tu sesión expiró')).toBeInTheDocument();
        expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
        expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
      });
    });

    // 1.4.4: Test: Botones funcionan correctamente
    describe('1.4.4: Buttons work correctly', () => {
      it('navigates to profile when "Ir a mi perfil" button is clicked', () => {
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
          logout: jest.fn(),
          refreshUser: jest.fn(),
        });

        render(<LoginPage />);

        const profileButton = screen.getByRole('button', { name: 'Ir a mi perfil' });
        fireEvent.click(profileButton);

        expect(mockPush).toHaveBeenCalledWith('/profile');
      });

      it('calls logout when "Cerrar sesión" button is clicked', async () => {
        const mockLogout = jest.fn().mockResolvedValue(undefined);
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

        render(<LoginPage />);

        const logoutButton = screen.getByRole('button', { name: 'Cerrar sesión' });
        fireEvent.click(logoutButton);

        await waitFor(() => {
          expect(mockLogout).toHaveBeenCalled();
        });
      });

      it('calls logout when "Cambiar de cuenta" link is clicked', async () => {
        const mockLogout = jest.fn().mockResolvedValue(undefined);
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

        render(<LoginPage />);

        const switchAccountButton = screen.getByRole('button', { name: 'Cambiar de cuenta' });
        fireEvent.click(switchAccountButton);

        await waitFor(() => {
          expect(mockLogout).toHaveBeenCalled();
        });
      });

      it('handles logout errors gracefully', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        const mockLogout = jest.fn().mockRejectedValue(new Error('Logout failed'));
        
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

        render(<LoginPage />);

        const logoutButton = screen.getByRole('button', { name: 'Cerrar sesión' });
        fireEvent.click(logoutButton);

        await waitFor(() => {
          expect(mockLogout).toHaveBeenCalled();
          expect(consoleErrorSpy).toHaveBeenCalled();
        });

        consoleErrorSpy.mockRestore();
      });
    });
  });
});
