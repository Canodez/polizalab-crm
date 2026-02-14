import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import RegisterPage from '../page';
import { registerUser } from '@/lib/auth';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock auth module
jest.mock('@/lib/auth', () => ({
  registerUser: jest.fn(),
}));

describe('RegisterPage', () => {
  const mockPush = jest.fn();
  const mockRegisterUser = registerUser as jest.MockedFunction<typeof registerUser>;

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
  });

  it('renders registration form with all fields', () => {
    render(<RegisterPage />);

    expect(screen.getByRole('heading', { name: 'Crear cuenta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmar contraseña')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeInTheDocument();
  });

  it('displays validation error for empty email', async () => {
    render(<RegisterPage />);

    const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('El correo electrónico es requerido')).toBeInTheDocument();
    });
  });

  it('displays validation error for invalid email format', async () => {
    render(<RegisterPage />);

    const emailInput = screen.getByLabelText('Correo electrónico') as HTMLInputElement;
    const passwordInput = screen.getByLabelText('Contraseña');
    const confirmPasswordInput = screen.getByLabelText('Confirmar contraseña');
    
    // Fill in all fields with invalid email
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } });

    // Submit form directly to bypass HTML5 validation
    const form = emailInput.closest('form');
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(screen.getByText('Ingresa un correo electrónico válido')).toBeInTheDocument();
    });
  });

  it('displays validation error for short password', async () => {
    render(<RegisterPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    const passwordInput = screen.getByLabelText('Contraseña');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'short' } });

    const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText('La contraseña debe tener al menos 8 caracteres')
      ).toBeInTheDocument();
    });
  });

  it('displays validation error when passwords do not match', async () => {
    render(<RegisterPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    const passwordInput = screen.getByLabelText('Contraseña');
    const confirmPasswordInput = screen.getByLabelText('Confirmar contraseña');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'password456' } });

    const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Las contraseñas no coinciden')).toBeInTheDocument();
    });
  });

  it('clears validation error when user starts typing', async () => {
    render(<RegisterPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    const submitButton = screen.getByRole('button', { name: /crear cuenta/i });

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

  it('successfully registers user and redirects to login', async () => {
    mockRegisterUser.mockResolvedValueOnce({
      userId: 'test-user-id',
      email: 'test@example.com',
    });

    render(<RegisterPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    const passwordInput = screen.getByLabelText('Contraseña');
    const confirmPasswordInput = screen.getByLabelText('Confirmar contraseña');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } });

    const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockRegisterUser).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockPush).toHaveBeenCalledWith('/login?registered=true');
    });
  });

  it('displays error message when registration fails', async () => {
    const errorMessage = 'An account with this email already exists';
    mockRegisterUser.mockRejectedValueOnce(new Error(errorMessage));

    render(<RegisterPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    const passwordInput = screen.getByLabelText('Contraseña');
    const confirmPasswordInput = screen.getByLabelText('Confirmar contraseña');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } });

    const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    // Should not redirect on error
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('disables form during submission', async () => {
    mockRegisterUser.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(<RegisterPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    const passwordInput = screen.getByLabelText('Contraseña');
    const confirmPasswordInput = screen.getByLabelText('Confirmar contraseña');

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } });

    const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
    fireEvent.click(submitButton);

    // Check that button shows loading state
    await waitFor(() => {
      expect(screen.getByText('Registrando...')).toBeInTheDocument();
    });

    // Check that inputs are disabled
    expect(emailInput).toBeDisabled();
    expect(passwordInput).toBeDisabled();
    expect(confirmPasswordInput).toBeDisabled();
    expect(submitButton).toBeDisabled();
  });

  it('has link to login page', () => {
    render(<RegisterPage />);

    const loginLink = screen.getByText('Inicia sesión');
    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute('href', '/login');
  });

  it('has minimum touch target size for submit button', () => {
    render(<RegisterPage />);

    const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
    const styles = window.getComputedStyle(submitButton);
    
    // Check minHeight is set to 44px (mobile-first requirement)
    expect(submitButton).toHaveStyle({ minHeight: '44px' });
  });
});
