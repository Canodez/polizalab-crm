import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoginPage from '../page';
import { loginUser } from '@/lib/auth';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Mock auth module
jest.mock('@/lib/auth', () => ({
  loginUser: jest.fn(),
}));

describe('LoginPage', () => {
  const mockPush = jest.fn();
  const mockLoginUser = loginUser as jest.MockedFunction<typeof loginUser>;
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
});
